import { createHash } from "node:crypto";
import {
  formatMoney,
  newCode,
  newId,
  parseCommand,
  parseIntent,
} from "./domain.mjs";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const TERMINAL_MATCH_STATES = new Set(["expired", "refunded", "delivered", "failed"]);

function iso(value) {
  return new Date(value).toISOString();
}

function contactHash(chatId) {
  return createHash("sha256").update(String(chatId)).digest("hex");
}

function enqueue(state, type, payload, now, id = newId("O")) {
  if (state.outbox[id]) return id;
  state.outbox[id] = {
    id,
    type,
    payload,
    status: "pending",
    attempts: 0,
    nextAttemptAt: iso(now),
    createdAt: iso(now),
  };
  return id;
}

function releaseLead(state, match) {
  const lead = state.leads[match?.leadId];
  if (lead?.reservedMatchId === match?.id) delete lead.reservedMatchId;
}

function latestAvailableLead(state, plate, now) {
  return Object.values(state.leads)
    .filter((lead) => lead.plate === plate
      && lead.status === "active"
      && !lead.reservedMatchId
      && Date.parse(lead.expiresAt) > now)
    .sort((a, b) => b.budgetHkd - a.budgetHkd || Date.parse(a.createdAt) - Date.parse(b.createdAt))[0] || null;
}

function buyerConsentText(lead) {
  return [
    `Plate.hk received your ${formatMoney(lead.budgetHkd)} offer for ${lead.plate}.`,
    "Plate.hk may show the offer amount to a self-identified seller. Your number is shared only after you approve that seller and the seller pays the introduction fee.",
    "The three-party group will reveal phone numbers to its members. Plate.hk does not verify ownership, negotiate, handle purchase money, or guarantee a transfer.",
    `Reply BUYER YES ${lead.confirmCode} within 24 hours to consent.`,
    "",
    `Plate.hk 已收到你對 ${lead.plate} 的 ${formatMoney(lead.budgetHkd)} 出價。`,
    "只有在你再次批准賣方、且賣方支付介紹費後，我們才會建立三方群組並公開雙方電話號碼。Plate.hk 不核實擁有權、不議價、不代收交易款項，也不保證成交或轉名。",
    `請在 24 小時內回覆 BUYER YES ${lead.confirmCode} 表示同意。`,
  ].join("\n");
}

function sellerConsentText(match, lead, feeHkd) {
  return [
    `A WhatsApp-verified buyer offered ${formatMoney(lead.budgetHkd)} for ${lead.plate}.`,
    `Plate.hk charges ${formatMoney(feeHkd)} only after the buyer approves this match. Payment creates a three-party WhatsApp group.`,
    "Your number will be visible to the buyer. The fee covers a witnessed introduction, not a reply, negotiation, sale, ownership check, or transfer guarantee.",
    `Reply SELLER YES ${match.sellerCode} within 24 hours to consent.`,
    "",
    `一名已驗證 WhatsApp 的買家對 ${lead.plate} 出價 ${formatMoney(lead.budgetHkd)}。`,
    `買家批准配對後，賣方支付 ${formatMoney(feeHkd)}，Plate.hk 才會建立三方 WhatsApp 群組。費用只包括可見證的介紹，不保證回覆、議價、成交、擁有權或轉名。`,
    `請在 24 小時內回覆 SELLER YES ${match.sellerCode} 表示同意。`,
  ].join("\n");
}

function buyerMatchText(match, lead) {
  return [
    `A self-identified seller wants to discuss ${lead.plate}. Plate.hk has not verified legal ownership.`,
    "If you approve, the seller receives a payment link. After payment, a three-party WhatsApp group will reveal both phone numbers.",
    `Reply MATCH YES ${match.buyerCode} within 24 hours to approve this seller.`,
    "",
    `一名自稱是 ${lead.plate} 賣方的人希望洽談；Plate.hk 尚未核實其法律擁有權。你批准後，賣方會收到付款連結，付款後建立三方 WhatsApp 群組並公開雙方電話號碼。`,
    `請在 24 小時內回覆 MATCH YES ${match.buyerCode}。`,
  ].join("\n");
}

function groupOpeningText(introduction, lead, feeHkd) {
  return [
    `Plate.hk introduction ${introduction.id}`,
    `Plate: ${lead.plate}`,
    `Buyer offer: ${formatMoney(lead.budgetHkd)}`,
    `Introduction fee paid by seller: ${formatMoney(feeHkd)}`,
    "",
    `Buyer: reply INTRO ${introduction.confirmCode} within 24 hours to confirm that this offer remains active. If that confirmation is absent, Plate.hk refunds the introduction fee.`,
    "After confirmation, the introduction is delivered and the fee is non-refundable. Plate.hk does not verify ownership, negotiate, handle purchase money, guarantee a transaction, or mediate disputes.",
    "",
    `買家：請在 24 小時內回覆 INTRO ${introduction.confirmCode}，確認出價仍然有效。若沒有確認，Plate.hk 會退回介紹費。確認後即視為已完成介紹，費用不予退回。`,
  ].join("\n");
}

export class IntroductionWorkflow {
  constructor({ store, messaging, payments, config, clock = () => new Date() }) {
    this.store = store;
    this.messaging = messaging;
    this.payments = payments;
    this.config = config;
    this.clock = clock;
    this.draining = false;
  }

  now() {
    return this.clock().getTime();
  }

  async handleMessage(message) {
    const now = this.now();
    await this.store.transact((state) => {
      if (state.processedMessages[message.id]) return;
      state.processedMessages[message.id] = iso(now);
      const command = parseCommand(message.body);

      if (message.isGroup) {
        if (command?.type !== "intro_confirm") return;
        const introduction = Object.values(state.introductions).find((item) =>
          item.groupId === message.chatId
          && item.status === "awaiting_buyer_confirmation"
          && item.confirmCode === command.code,
        );
        if (!introduction) return;
        const lead = state.leads[introduction.leadId];
        if (!lead || lead.buyerChatId !== message.senderId) return;
        lead.status = "delivered";
        introduction.status = "delivered";
        introduction.deliveredAt = iso(now);
        introduction.closeAt = iso(now + this.config.groupLifetimeDays * DAY_MS);
        const match = state.matches[introduction.matchId];
        if (match) match.status = "delivered";
        const payment = state.payments[introduction.paymentId];
        if (payment) payment.status = "earned";
        enqueue(state, "send_text", {
          chatId: introduction.groupId,
          text: "Buyer confirmation recorded. The Plate.hk introduction is now complete. Please continue directly; Plate.hk will leave this group after seven days.\n\n已記錄買家確認，Plate.hk 的介紹服務現已完成。雙方可直接洽談；Plate.hk 會在七日後退出群組。",
        }, now, `confirm_${introduction.id}`);
        return;
      }

      const intent = parseIntent(message.body);
      if (intent?.role === "buyer") {
        this.handleBuyerIntent(state, message, intent, now);
        return;
      }
      if (intent?.role === "seller") {
        this.handleSellerIntent(state, message, intent, now);
        return;
      }
      if (command) this.handleCommand(state, message, command, now);
    });
    await this.drainOutbox();
  }

  handleBuyerIntent(state, message, intent, now) {
    const buyerHash = contactHash(message.senderId);
    const existing = Object.values(state.leads).find((lead) =>
      lead.buyerHash === buyerHash
      && lead.plate === intent.plate
      && ["pending_consent", "active"].includes(lead.status),
    );
    if (existing?.reservedMatchId) {
      enqueue(state, "send_text", {
        chatId: message.senderId,
        text: "This offer is already in an active seller match and cannot be changed until that match finishes.\n\n此出價已進入賣方配對，配對完結前不能修改。",
      }, now);
      return;
    }
    const activeBuyerLeads = Object.values(state.leads).filter((lead) =>
      lead.buyerHash === buyerHash && ["pending_consent", "active"].includes(lead.status) && Date.parse(lead.expiresAt) > now,
    );
    if (!existing && activeBuyerLeads.length >= 5) {
      enqueue(state, "send_text", {
        chatId: message.senderId,
        text: "You already have five active Plate.hk offers. Wait for one to expire before adding another.\n\n你已有五個有效出價，請待其中一個到期後再新增。",
      }, now);
      return;
    }
    const lead = existing || {
      id: newId("L"),
      buyerChatId: message.senderId,
      buyerHash,
      confirmCode: newCode(),
      createdAt: iso(now),
      status: "pending_consent",
    };
    lead.plate = intent.plate;
    lead.budgetHkd = intent.budgetHkd;
    lead.sourceUrl = intent.sourceUrl;
    lead.note = intent.note;
    lead.updatedAt = iso(now);
    lead.expiresAt = iso(now + (lead.status === "active" ? this.config.buyerOfferDays * DAY_MS : DAY_MS));
    state.leads[lead.id] = lead;
    enqueue(state, "send_text", {
      chatId: lead.buyerChatId,
      text: lead.status === "active"
        ? `Your active offer for ${lead.plate} is updated to ${formatMoney(lead.budgetHkd)} and remains valid for ${this.config.buyerOfferDays} days.`
        : buyerConsentText(lead),
    }, now);
  }

  handleSellerIntent(state, message, intent, now) {
    const sellerHash = contactHash(message.senderId);
    const existingMatch = Object.values(state.matches).find((match) =>
      match.sellerHash === sellerHash
      && !TERMINAL_MATCH_STATES.has(match.status)
      && (match.status === "paid" || Date.parse(match.expiresAt || 0) > now),
    );
    if (existingMatch) {
      enqueue(state, "send_text", {
        chatId: message.senderId,
        text: "You already have an active Plate.hk introduction request. Complete or let it expire before starting another.\n\n你已有一個進行中的 Plate.hk 介紹請求，請先完成或等待到期。",
      }, now);
      return;
    }
    const lead = latestAvailableLead(state, intent.plate, now);
    if (!lead) {
      enqueue(state, "send_text", {
        chatId: message.senderId,
        text: `There is no currently available buyer offer for ${intent.plate}. Plate.hk has not stored your contact for future marketing.\n\n目前沒有可配對的 ${intent.plate} 買家出價；Plate.hk 不會保存你的聯絡資料作日後推廣。`,
      }, now);
      return;
    }
    if (sellerHash === lead.buyerHash) {
      enqueue(state, "send_text", { chatId: message.senderId, text: "A buyer cannot claim the same introduction as seller." }, now);
      return;
    }
    const match = {
      id: newId("M"),
      leadId: lead.id,
      sellerChatId: message.senderId,
      sellerHash,
      sourceUrl: intent.sourceUrl,
      status: "pending_seller_consent",
      sellerCode: newCode(),
      createdAt: iso(now),
      expiresAt: iso(now + DAY_MS),
    };
    state.matches[match.id] = match;
    lead.reservedMatchId = match.id;
    enqueue(state, "send_text", {
      chatId: match.sellerChatId,
      text: sellerConsentText(match, lead, this.config.introFeeHkd),
    }, now);
  }

  handleCommand(state, message, command, now) {
    if (command.type === "buyer_confirm") {
      const lead = Object.values(state.leads).find((item) =>
        item.status === "pending_consent"
        && item.confirmCode === command.code
        && item.buyerChatId === message.senderId,
      );
      if (!lead || Date.parse(lead.expiresAt) <= now) return;
      lead.status = "active";
      lead.confirmedAt = iso(now);
      lead.expiresAt = iso(now + this.config.buyerOfferDays * DAY_MS);
      enqueue(state, "send_text", {
        chatId: lead.buyerChatId,
        text: `Offer confirmed for ${this.config.buyerOfferDays} days. We will ask you again before sharing your number with any self-identified seller.\n\n出價已確認，有效期 ${this.config.buyerOfferDays} 日。向任何自稱賣方的人公開你的電話號碼前，我們會再次徵求同意。`,
      }, now);
      return;
    }

    if (command.type === "seller_accept") {
      const match = Object.values(state.matches).find((item) =>
        item.status === "pending_seller_consent"
        && item.sellerCode === command.code
        && item.sellerChatId === message.senderId,
      );
      if (!match || Date.parse(match.expiresAt) <= now) return;
      const lead = state.leads[match.leadId];
      if (!lead || lead.status !== "active") return;
      match.status = "pending_buyer_match";
      match.buyerCode = newCode();
      match.expiresAt = iso(now + DAY_MS);
      enqueue(state, "send_text", {
        chatId: match.sellerChatId,
        text: "Consent recorded. The buyer must approve this specific match before you receive a payment link.\n\n已記錄同意；買家必須先批准本次配對，你才會收到付款連結。",
      }, now);
      enqueue(state, "send_text", {
        chatId: lead.buyerChatId,
        text: buyerMatchText(match, lead),
      }, now);
      return;
    }

    if (command.type === "buyer_match") {
      const match = Object.values(state.matches).find((item) =>
        item.status === "pending_buyer_match" && item.buyerCode === command.code,
      );
      const lead = match && state.leads[match.leadId];
      if (!match || !lead || lead.buyerChatId !== message.senderId || Date.parse(match.expiresAt) <= now) return;
      match.status = "checkout_pending";
      match.buyerApprovedAt = iso(now);
      match.expiresAt = iso(now + 30 * 60 * 1000);
      const paymentId = newId("P");
      match.paymentId = paymentId;
      state.payments[paymentId] = {
        id: paymentId,
        matchId: match.id,
        leadId: lead.id,
        amountHkd: this.config.introFeeHkd,
        currency: "hkd",
        status: "checkout_pending",
        createdAt: iso(now),
      };
      enqueue(state, "create_checkout", {
        paymentId,
        matchId: match.id,
        leadId: lead.id,
        plate: lead.plate,
      }, now, `checkout_${paymentId}`);
    }
  }

  async handleCheckoutEvent(event, { drain = true } = {}) {
    const now = this.now();
    await this.store.transact((state) => {
      if (!event?.eventId || state.processedStripeEvents[event.eventId]) return;
      state.processedStripeEvents[event.eventId] = iso(now);
      const match = state.matches[event.matchId];
      const payment = match && state.payments[match.paymentId];
      const lead = match && state.leads[match.leadId];
      const valid = match && payment && lead
        && event.leadId === lead.id
        && event.sessionId === payment.checkoutSessionId
        && event.paymentIntentId
        && event.paymentStatus === "paid"
        && event.currency === "hkd"
        && event.amountTotal === this.config.introFeeHkd * 100;
      if (!valid || payment.status === "paid" || payment.status === "earned") return;
      payment.status = "paid";
      payment.paymentIntentId = event.paymentIntentId;
      payment.paidAt = iso(now);
      match.status = "paid";
      const introduction = {
        id: newId("I"),
        leadId: lead.id,
        matchId: match.id,
        paymentId: payment.id,
        confirmCode: newCode(),
        status: "group_pending",
        createdAt: iso(now),
      };
      state.introductions[introduction.id] = introduction;
      match.introductionId = introduction.id;
      enqueue(state, "create_group", {
        introductionId: introduction.id,
        name: `Plate.hk ${lead.plate} ${introduction.id.slice(-4)}`,
        participants: [lead.buyerChatId, match.sellerChatId],
      }, now, `group_${introduction.id}`);
    });
    if (drain) await this.drainOutbox();
  }

  async sweep() {
    const now = this.now();
    await this.store.transact((state) => {
      for (const lead of Object.values(state.leads)) {
        if (["pending_consent", "active"].includes(lead.status) && Date.parse(lead.expiresAt) <= now) {
          lead.status = "expired";
          if (lead.reservedMatchId) {
            const match = state.matches[lead.reservedMatchId];
            if (match && !TERMINAL_MATCH_STATES.has(match.status)) match.status = "expired";
            delete lead.reservedMatchId;
          }
        }
      }
      for (const match of Object.values(state.matches)) {
        if (["pending_seller_consent", "pending_buyer_match", "checkout_pending", "awaiting_payment"].includes(match.status)
            && Date.parse(match.expiresAt) <= now) {
          match.status = "expired";
          releaseLead(state, match);
        }
      }
      for (const introduction of Object.values(state.introductions)) {
        if (introduction.status === "awaiting_buyer_confirmation" && Date.parse(introduction.confirmBy) <= now) {
          introduction.status = "refund_pending";
          const payment = state.payments[introduction.paymentId];
          if (payment?.paymentIntentId) {
            enqueue(state, "refund", {
              introductionId: introduction.id,
              paymentId: payment.id,
              paymentIntentId: payment.paymentIntentId,
            }, now, `refund_${payment.id}`);
          }
        }
        if (introduction.status === "delivered" && Date.parse(introduction.closeAt) <= now) {
          introduction.status = "close_pending";
          enqueue(state, "leave_group", {
            introductionId: introduction.id,
            groupId: introduction.groupId,
          }, now, `leave_${introduction.id}`);
        }
      }
      const retentionCutoff = now - this.config.piiRetentionDays * DAY_MS;
      for (const action of Object.values(state.outbox)) {
        if (action.status === "processing" && Date.parse(action.startedAt || 0) <= now - 5 * 60 * 1000) {
          action.status = "pending";
          action.nextAttemptAt = iso(now);
        }
      }
      for (const [id, match] of Object.entries(state.matches)) {
        if (TERMINAL_MATCH_STATES.has(match.status) && Date.parse(match.createdAt) < retentionCutoff) delete state.matches[id];
      }
      for (const [id, lead] of Object.entries(state.leads)) {
        if (["expired", "delivered", "refunded"].includes(lead.status) && Date.parse(lead.createdAt) < retentionCutoff) delete state.leads[id];
      }
      for (const [id, createdAt] of Object.entries(state.processedMessages)) {
        if (Date.parse(createdAt) < retentionCutoff) delete state.processedMessages[id];
      }
      for (const [id, createdAt] of Object.entries(state.processedStripeEvents)) {
        if (Date.parse(createdAt) < retentionCutoff) delete state.processedStripeEvents[id];
      }
      for (const [id, action] of Object.entries(state.outbox)) {
        if (["done", "dead"].includes(action.status) && Date.parse(action.createdAt) < retentionCutoff) delete state.outbox[id];
      }
      for (const introduction of Object.values(state.introductions)) {
        if (["closed", "refunded_closed", "refunded"].includes(introduction.status)
            && Date.parse(introduction.createdAt) < retentionCutoff) {
          delete introduction.groupId;
          delete introduction.inviteLink;
          delete introduction.confirmCode;
          introduction.contactDataDeletedAt ||= iso(now);
        }
      }
    });
    await this.drainOutbox();
  }

  async nextAction() {
    const now = this.now();
    return this.store.transact((state) => {
      const action = Object.values(state.outbox)
        .filter((item) => item.status === "pending" && Date.parse(item.nextAttemptAt) <= now)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
      if (!action) return null;
      action.status = "processing";
      action.attempts += 1;
      action.startedAt = iso(now);
      return structuredClone(action);
    });
  }

  async drainOutbox() {
    if (this.draining) return;
    this.draining = true;
    try {
      for (let count = 0; count < 25; count += 1) {
        const action = await this.nextAction();
        if (!action) break;
        try {
          const result = await this.performAction(action);
          await this.completeAction(action, result);
        } catch (error) {
          await this.failAction(action, error);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  async performAction(action) {
    if (action.type === "send_text") {
      return this.messaging.sendText(action.payload.chatId, action.payload.text);
    }
    if (action.type === "create_checkout") {
      return this.payments.createCheckout({
        ...action.payload,
        idempotencyKey: action.id,
      });
    }
    if (action.type === "create_group") {
      return this.messaging.createGroup(action.payload);
    }
    if (action.type === "refund") {
      return this.payments.refund(action.payload.paymentIntentId, action.id);
    }
    if (action.type === "leave_group") {
      return this.messaging.leaveGroup(action.payload.groupId);
    }
    throw new Error(`Unknown outbox action: ${action.type}`);
  }

  async completeAction(action, result) {
    const now = this.now();
    await this.store.transact((state) => {
      const current = state.outbox[action.id];
      if (!current) return;
      current.status = "done";
      current.completedAt = iso(now);
      delete current.lastError;
      if (action.type === "create_checkout") {
        const payment = state.payments[action.payload.paymentId];
        const match = state.matches[action.payload.matchId];
        if (!payment || !match) return;
        payment.status = "open";
        payment.checkoutSessionId = result.sessionId;
        payment.checkoutExpiresAt = result.expiresAt;
        match.status = "awaiting_payment";
        match.expiresAt = result.expiresAt;
        enqueue(state, "send_text", {
          chatId: match.sellerChatId,
          text: [
            `The buyer approved this match. Pay ${formatMoney(this.config.introFeeHkd)} within 30 minutes to create the three-party group:`,
            result.url,
            "The fee is refunded if the buyer does not post the required confirmation within 24 hours.",
            "",
            `買家已批准配對。請在 30 分鐘內支付 ${formatMoney(this.config.introFeeHkd)}，付款後會建立三方群組：`,
            result.url,
          ].join("\n"),
        }, now);
      }
      if (action.type === "create_group") {
        const introduction = state.introductions[action.payload.introductionId];
        if (!introduction) return;
        const lead = state.leads[introduction.leadId];
        const match = state.matches[introduction.matchId];
        introduction.status = "awaiting_buyer_confirmation";
        introduction.groupId = result.groupId;
        introduction.inviteLink = result.inviteLink || "";
        introduction.confirmBy = iso(now + this.config.confirmationHours * HOUR_MS);
        if (result.inviteLink) {
          const inviteText = [
            `Join the paid Plate.hk introduction group for ${lead.plate}: ${result.inviteLink}`,
            lead.buyerChatId ? `Buyer confirmation required in the group: INTRO ${introduction.confirmCode}` : "",
            "",
            `加入 ${lead.plate} 的 Plate.hk 已付款介紹群組：${result.inviteLink}`,
            lead.buyerChatId ? `買家須在群組回覆：INTRO ${introduction.confirmCode}` : "",
          ].filter(Boolean).join("\n");
          enqueue(state, "send_text", { chatId: lead.buyerChatId, text: inviteText }, now);
          enqueue(state, "send_text", { chatId: match.sellerChatId, text: inviteText }, now);
        }
        enqueue(state, "send_text", {
          chatId: result.groupId,
          text: groupOpeningText(introduction, lead, this.config.introFeeHkd),
        }, now);
      }
      if (action.type === "refund") {
        const introduction = state.introductions[action.payload.introductionId];
        const payment = state.payments[action.payload.paymentId];
        if (!introduction || !payment) return;
        const lead = state.leads[introduction.leadId];
        introduction.status = "refunded";
        introduction.refundedAt = iso(now);
        introduction.refundId = result.refundId;
        payment.status = "refunded";
        if (lead) lead.status = "expired";
        const match = state.matches[introduction.matchId];
        if (match) {
          match.status = "refunded";
          releaseLead(state, match);
          enqueue(state, "send_text", {
            chatId: match.sellerChatId,
            text: "The buyer did not post the required group confirmation in time. Plate.hk has issued the introduction-fee refund.\n\n買家未有在限期內於群組確認，Plate.hk 已發出介紹費退款。",
          }, now);
        }
        if (introduction.groupId) {
          enqueue(state, "leave_group", {
            introductionId: introduction.id,
            groupId: introduction.groupId,
          }, now, `leave_${introduction.id}`);
        }
      }
      if (action.type === "leave_group") {
        const introduction = state.introductions[action.payload.introductionId];
        if (introduction) {
          introduction.status = introduction.refundedAt ? "refunded_closed" : "closed";
          introduction.closedAt = iso(now);
        }
      }
    });
  }

  async failAction(action, error) {
    const now = this.now();
    await this.store.transact((state) => {
      const current = state.outbox[action.id];
      if (!current) return;
      current.lastError = error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
      const maximumAttempts = action.type === "refund" ? 10 : 3;
      if (current.attempts < maximumAttempts) {
        current.status = "pending";
        current.nextAttemptAt = iso(now + Math.min(60, 2 ** current.attempts) * 60 * 1000);
        return;
      }
      current.status = "dead";
      current.failedAt = iso(now);
      if (action.type === "create_group") {
        const introduction = state.introductions[action.payload.introductionId];
        const payment = introduction && state.payments[introduction.paymentId];
        if (introduction && payment?.paymentIntentId) {
          introduction.status = "refund_pending";
          enqueue(state, "refund", {
            introductionId: introduction.id,
            paymentId: payment.id,
            paymentIntentId: payment.paymentIntentId,
          }, now, `refund_${payment.id}`);
        }
      }
      if (action.type === "create_checkout") {
        const match = state.matches[action.payload.matchId];
        if (match) {
          match.status = "failed";
          releaseLead(state, match);
        }
      }
    });
  }

  async status() {
    return this.store.read((state) => ({
      leads: Object.values(state.leads).reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] || 0) + 1 }), {}),
      matches: Object.values(state.matches).reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] || 0) + 1 }), {}),
      introductions: Object.values(state.introductions).reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] || 0) + 1 }), {}),
      outboxPending: Object.values(state.outbox).filter((item) => item.status === "pending" || item.status === "processing").length,
      outboxDead: Object.values(state.outbox).filter((item) => item.status === "dead").length,
    }));
  }
}
