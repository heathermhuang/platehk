import Stripe from "stripe";

export class StripeGateway {
  constructor({ secretKey, webhookSecret, baseUrl, feeHkd }) {
    this.stripe = new Stripe(secretKey);
    this.webhookSecret = webhookSecret;
    this.baseUrl = baseUrl;
    this.feeHkd = feeHkd;
  }

  parseWebhook(rawBody, signature) {
    if (!signature) throw new Error("Missing Stripe-Signature header");
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }

  async createCheckout({ matchId, leadId, plate, idempotencyKey }) {
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: matchId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "hkd",
          unit_amount: this.feeHkd * 100,
          product_data: {
            name: `Plate.hk buyer introduction: ${plate}`,
            description: "Buyer-confirmed three-party WhatsApp introduction. No transaction or sale guarantee.",
          },
        },
      }],
      metadata: {
        service: "platehk_introduction",
        match_id: matchId,
        lead_id: leadId,
        plate,
      },
      payment_intent_data: {
        metadata: {
          service: "platehk_introduction",
          match_id: matchId,
          lead_id: leadId,
          plate,
        },
      },
      success_url: `${this.baseUrl}/payment/success`,
      cancel_url: `${this.baseUrl}/payment/cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    }, { idempotencyKey });
    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    return {
      sessionId: session.id,
      url: session.url,
      expiresAt: new Date(session.expires_at * 1000).toISOString(),
    };
  }

  async refund(paymentIntentId, idempotencyKey) {
    const refund = await this.stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: "requested_by_customer",
      metadata: { service: "platehk_introduction" },
    }, { idempotencyKey });
    return { refundId: refund.id, status: refund.status };
  }
}

export function normalizeCheckoutEvent(event) {
  if (event?.type !== "checkout.session.completed") return null;
  const session = event.data?.object;
  if (!session || session.metadata?.service !== "platehk_introduction") return null;
  return {
    eventId: String(event.id || ""),
    matchId: String(session.metadata.match_id || ""),
    leadId: String(session.metadata.lead_id || ""),
    sessionId: String(session.id || ""),
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : String(session.payment_intent?.id || ""),
    amountTotal: Number(session.amount_total),
    currency: String(session.currency || "").toLowerCase(),
    paymentStatus: String(session.payment_status || ""),
  };
}
