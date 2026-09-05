import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { parseProxyUrl } from "../src/config.mjs";
import {
  buyerStartMessage,
  normalizePlate,
  parseCommand,
  parseIntent,
  sellerStartMessage,
} from "../src/domain.mjs";
import { normalizeOpenWAMessage } from "../src/message.mjs";
import { EncryptedFileStore, MemoryStore } from "../src/store.mjs";
import { IntroductionWorkflow } from "../src/workflow.mjs";

const buyer = "85260000001@c.us";
const seller = "85260000002@c.us";
const config = {
  introFeeHkd: 199,
  buyerOfferDays: 7,
  confirmationHours: 24,
  groupLifetimeDays: 7,
  piiRetentionDays: 30,
};

function message(id, senderId, body, { groupId = "" } = {}) {
  return {
    id,
    chatId: groupId || senderId,
    senderId,
    body,
    isGroup: Boolean(groupId),
  };
}

function harness() {
  let current = new Date("2026-09-05T00:00:00.000Z");
  const sent = [];
  const groups = [];
  const refunds = [];
  const leaves = [];
  const messaging = {
    async sendText(chatId, text) { sent.push({ chatId, text }); return "message-id"; },
    async createGroup(input) {
      groups.push(input);
      return { groupId: "120363000000@g.us", inviteLink: "https://chat.whatsapp.com/example" };
    },
    async leaveGroup(groupId) { leaves.push(groupId); return groupId; },
  };
  const payments = {
    async createCheckout() {
      return {
        sessionId: "cs_test_1",
        url: "https://checkout.stripe.test/session",
        expiresAt: new Date(current.getTime() + 30 * 60 * 1000).toISOString(),
      };
    },
    async refund(paymentIntentId) { refunds.push(paymentIntentId); return { refundId: "re_1", status: "succeeded" }; },
  };
  const store = new MemoryStore();
  const workflow = new IntroductionWorkflow({ store, messaging, payments, config, clock: () => current });
  return {
    workflow,
    store,
    sent,
    groups,
    refunds,
    leaves,
    advance(ms) { current = new Date(current.getTime() + ms); },
  };
}

async function reachPaidGroup(h) {
  const buyerIntent = buyerStartMessage({
    plate: "AB 123",
    budgetHkd: 20000,
    sourceUrl: "https://m.28car.com/num_dsp.php?h_vid=1",
    note: "This week",
  });
  await h.workflow.handleMessage(message("m1", buyer, buyerIntent));
  let state = await h.store.read((value) => value);
  const lead = Object.values(state.leads)[0];
  await h.workflow.handleMessage(message("m2", buyer, `BUYER YES ${lead.confirmCode}`));
  await h.workflow.handleMessage(message("m3", seller, sellerStartMessage({ plate: "AB123", sourceUrl: lead.sourceUrl })));
  state = await h.store.read((value) => value);
  let match = Object.values(state.matches)[0];
  await h.workflow.handleMessage(message("m4", seller, `SELLER YES ${match.sellerCode}`));
  state = await h.store.read((value) => value);
  match = state.matches[match.id];
  await h.workflow.handleMessage(message("m5", buyer, `MATCH YES ${match.buyerCode}`));
  state = await h.store.read((value) => value);
  match = state.matches[match.id];
  const payment = state.payments[match.paymentId];
  await h.workflow.handleCheckoutEvent({
    eventId: "evt_1",
    matchId: match.id,
    leadId: lead.id,
    sessionId: payment.checkoutSessionId,
    paymentIntentId: "pi_1",
    amountTotal: 19900,
    currency: "hkd",
    paymentStatus: "paid",
  });
  state = await h.store.read((value) => value);
  return {
    lead: state.leads[lead.id],
    match: state.matches[match.id],
    payment: state.payments[payment.id],
    introduction: Object.values(state.introductions)[0],
  };
}

test("structured buyer and seller messages parse without free-form contact scraping", () => {
  const buyerMessage = buyerStartMessage({
    plate: "AB 123",
    budgetHkd: 20000,
    sourceUrl: "https://m.28car.com/num_dsp.php?h_vid=1",
    note: "Ready now",
  });
  assert.deepEqual(parseIntent(buyerMessage), {
    role: "buyer",
    plate: "AB123",
    budgetHkd: 20000,
    sourceUrl: "https://m.28car.com/num_dsp.php?h_vid=1",
    note: "Ready now",
  });
  assert.equal(parseIntent(sellerStartMessage({ plate: "AB123", sourceUrl: "https://example.com" })).sourceUrl, "");
  assert.equal(normalizePlate("AB-123"), "AB123");
  assert.deepEqual(parseCommand(" buyer   yes abc123 "), { type: "buyer_confirm", code: "ABC123" });
});

test("OpenWA messages normalize direct and group senders without storing self messages", () => {
  assert.equal(normalizeOpenWAMessage({ id: "x", fromMe: true, body: "ignored", from: buyer }), null);
  assert.deepEqual(normalizeOpenWAMessage({ id: "x", body: "hello", from: buyer, chatId: buyer }), {
    id: "x", body: "hello", chatId: buyer, senderId: buyer, isGroup: false,
  });
  assert.deepEqual(normalizeOpenWAMessage({ id: { _serialized: "y" }, body: "INTRO ABC123", from: "120363000000@g.us", author: buyer, isGroupMsg: true }), {
    id: "y", body: "INTRO ABC123", chatId: "120363000000@g.us", senderId: buyer, isGroup: true,
  });
});

test("paid introduction requires seller consent and buyer approval before group creation", async () => {
  const h = harness();
  const result = await reachPaidGroup(h);
  assert.equal(h.groups.length, 1);
  assert.deepEqual(h.groups[0].participants, [buyer, seller]);
  assert.equal(result.introduction.status, "awaiting_buyer_confirmation");
  assert.equal(result.payment.status, "paid");
  assert.match(h.sent.at(-1).text, /INTRO [A-Z0-9]{6}/);

  await h.workflow.handleCheckoutEvent({
    eventId: "evt_1",
    matchId: result.match.id,
    leadId: result.lead.id,
    sessionId: result.payment.checkoutSessionId,
    paymentIntentId: "pi_1",
    amountTotal: 19900,
    currency: "hkd",
    paymentStatus: "paid",
  });
  assert.equal(h.groups.length, 1);

  await h.workflow.handleMessage(message(
    "m6-seller",
    seller,
    `INTRO ${result.introduction.confirmCode}`,
    { groupId: result.introduction.groupId },
  ));
  assert.equal(
    await h.store.read((state) => state.introductions[result.introduction.id].status),
    "awaiting_buyer_confirmation",
  );

  await h.workflow.handleMessage(message(
    "m6-buyer",
    buyer,
    `INTRO ${result.introduction.confirmCode}`,
    { groupId: result.introduction.groupId },
  ));
  const state = await h.store.read((value) => value);
  assert.equal(state.introductions[result.introduction.id].status, "delivered");
  assert.equal(state.payments[result.payment.id].status, "earned");
  assert.equal(state.leads[result.lead.id].status, "delivered");
});

test("missing buyer group confirmation refunds the seller exactly once", async () => {
  const h = harness();
  const result = await reachPaidGroup(h);
  h.advance(25 * 60 * 60 * 1000);
  await h.workflow.sweep();
  await h.workflow.sweep();
  const state = await h.store.read((value) => value);
  assert.deepEqual(h.refunds, ["pi_1"]);
  assert.deepEqual(h.leaves, [result.introduction.groupId]);
  assert.equal(state.introductions[result.introduction.id].status, "refunded_closed");
  assert.equal(state.payments[result.payment.id].status, "refunded");
  assert.equal(state.leads[result.lead.id].status, "expired");
});

test("encrypted file store never writes WhatsApp identifiers in plaintext", async () => {
  const directory = await mkdtemp(join(tmpdir(), "platehk-introduction-test-"));
  const path = join(directory, "state.enc.json");
  const key = randomBytes(32).toString("base64");
  const store = new EncryptedFileStore(path, key);
  await store.load();
  await store.transact((state) => {
    state.leads.L1 = { id: "L1", buyerChatId: buyer, status: "active" };
  });
  const disk = await readFile(path, "utf8");
  assert.doesNotMatch(disk, /85260000001/);
  const restored = new EncryptedFileStore(path, key);
  await restored.load();
  assert.equal(await restored.read((state) => state.leads.L1.buyerChatId), buyer);
});

test("proxy configuration requires an explicit stable endpoint", () => {
  assert.deepEqual(parseProxyUrl("http://user:pass@hk.example:8080"), {
    server: "http://hk.example:8080",
    username: "user",
    password: "pass",
  });
  assert.throws(() => parseProxyUrl("http://hk.example"), /host and port/);
  assert.throws(() => parseProxyUrl("ftp://hk.example:21"), /must use/);
});
