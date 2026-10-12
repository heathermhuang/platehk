import { getStaticJson, sameOriginError, enforcePublicReadRateLimit, normalizeQuery } from "./lib.mjs";

const COOKIE = "__Host-platehk-contact";
const PRICE = 9900;
const STRIPE_API_VERSION = "2026-09-30.endive";
const encoder = new TextEncoder();
const STRIPE_INTEGRATION_IDENTIFIER = "platehk-contact-unlock-lrqmxwpt";
const phonePattern = /^852[456789]\d{7}$/;

function contactRuntimeReady(env) {
  return /^(sk|rk)_(test|live)_/.test(env.STRIPE_SECRET_KEY || "")
    && /^price_[a-zA-Z0-9]+$/.test(env.CONTACT_UNLOCK_PRICE_ID || "")
    && /^[a-f0-9]{64}$/i.test(env.CONTACT_UNLOCK_ENCRYPTION_KEY || "");
}

export function contactUnlockEnabled(env) {
  return env.CONTACT_UNLOCK_ENABLED === "true" && contactRuntimeReady(env)
    && /^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET || "");
}

function reply(body, status = 200, cookie = null) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow, noarchive",
  };
  if (cookie) headers["set-cookie"] = `${COOKIE}=${cookie}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000`;
  return new Response(JSON.stringify(body), { status, headers });
}

function buyerCookie(request) {
  const value = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value || "") ? value : null;
}

function randomBuyer() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function buyerHash(buyer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(buyer)))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function encryptionKey(env) {
  const bytes = Uint8Array.from(env.CONTACT_UNLOCK_ENCRYPTION_KEY.match(/../g), (hex) => parseInt(hex, 16));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptContact(env, contact, owner) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(owner) },
    await encryptionKey(env), encoder.encode(JSON.stringify(contact)),
  ));
  return btoa(String.fromCharCode(...iv, ...ciphertext));
}

async function decryptContact(env, value, owner) {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: encoder.encode(owner) },
    await encryptionKey(env), bytes.slice(12),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function loadContactShard(request, env, shard) {
  return getStaticJson(env, request.url, `./_market/28car/contacts/${shard}.json`, { cache: false });
}

export async function advertisedContact(request, env, plate, listingId, supplied = {}) {
  if (!/^[A-Z0-9]{1,16}$/.test(plate) || !/^n\d+$/.test(listingId)) return null;
  const payload = "contacts" in supplied ? supplied.contacts : await loadContactShard(request, env, plate[0]);
  if (!payload || payload.schema_version !== 1 || payload.source !== "28car" || payload.coverage?.complete !== true) return null;
  const item = payload.contacts?.[listingId];
  const hours = Math.max(1, Math.min(168, Number(payload.fresh_for_hours || 72)));
  const observed = Date.parse(item?.observed_at || "");
  if (!item || item.plate !== plate || !phonePattern.test(item.whatsapp_number)
      || !Number.isFinite(observed) || observed > Date.now() + 600000
      || observed < Date.now() - hours * 3600000) return null;
  // Both files must agree on the exact listing and observation; never unlock a stale/reassigned contact.
  const market = supplied.market || await getStaticJson(env, request.url, `./_market/28car/${plate[0]}.json`, { cache: false });
  const offer = market?.signals?.[plate]?.find((candidate) => candidate.listing_id === listingId);
  if (market?.schema_version !== 1 || market.source !== "28car" || market.coverage?.complete !== true
      || market.scraped_at !== payload.scraped_at || !offer || offer.last_seen_at !== item.observed_at) return null;
  if (!/^https:\/\/m\.28car\.com\/num_dsp\.php\?/.test(offer.source_url || "")) return null;
  return {
    plate, listing_id: listingId, whatsapp_number: item.whatsapp_number,
    source_url: offer.source_url, observed_at: item.observed_at,
    asking_price_hkd: Number.isSafeInteger(offer.asking_price_hkd) && offer.asking_price_hkd > 0 ? offer.asking_price_hkd : null,
  };
}

async function stripeRequest(env, path, body, idempotencyKey) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "stripe-version": STRIPE_API_VERSION, ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}), ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("payment_provider_unavailable");
  return response.json();
}

async function verifiedPurchase(env, session) {
  const charge = session.payment_intent?.latest_charge;
  if (!/^cs_(test|live)_[a-zA-Z0-9]{1,200}$/.test(session.id || "") || session.metadata?.purpose !== "seller_whatsapp_unlock" || !/^[a-f0-9]{64}$/.test(session.metadata.owner || "")
      || session.mode !== "payment" || session.currency !== "hkd" || session.amount_total !== PRICE
      || session.livemode !== /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY)
      || session.status !== "complete" || session.payment_status !== "paid"
      || session.payment_intent?.status !== "succeeded" || !charge || charge.paid !== true
      || charge.refunded || charge.amount_refunded > 0 || charge.disputed) return null;
  const contact = await decryptContact(env, session.metadata.contact, session.metadata.owner);
  if (!phonePattern.test(contact.whatsapp_number) || !/^[A-Z0-9]{1,16}$/.test(contact.plate || "")
      || !/^n\d+$/.test(contact.listing_id || "") || contact.plate !== session.metadata.plate
      || contact.listing_id !== session.metadata.listing_id) return null;
  return contact;
}

async function fulfillPurchase(env, session) {
  const contact = await verifiedPurchase(env, session);
  if (!contact) return null;
  if (session.metadata.contact_fulfillment_version !== "1") {
    // Stripe owns the durable purchase record. A deterministic update and
    // idempotency key let webhook retries and browser returns share fulfillment.
    await stripeRequest(env, `checkout/sessions/${encodeURIComponent(session.id)}`,
      new URLSearchParams({ "metadata[contact_fulfillment_version]": "1" }), `platehk-contact-fulfill-${session.id}`);
  }
  return contact;
}

async function boundedBody(request, limit) {
  const reader = request.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function validStripeSignature(bytes, header, secret) {
  const parts = String(header || "").split(",").map(part => part.trim().split("="));
  const times = parts.filter(([key]) => key === "t").map(([,value]) => value);
  const signatures = parts.filter(([key]) => key === "v1").map(([,value]) => value).filter(value => /^[a-f0-9]{64}$/.test(value || ""));
  if (times.length !== 1 || !/^\d+$/.test(times[0]) || !signatures.length || signatures.length > 8) return false;
  const timestamp = Number(times[0]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const prefix = encoder.encode(`${times[0]}.`);
  const payload = new Uint8Array(prefix.length + bytes.length);
  payload.set(prefix); payload.set(bytes, prefix.length);
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["verify"]);
  for (const signature of signatures) {
    const digest = Uint8Array.from(signature.match(/../g), hex => parseInt(hex,16));
    if (await crypto.subtle.verify("HMAC", key, digest, payload)) return true;
  }
  return false;
}

export async function handleContactWebhook(request, env) {
  if (request.method !== "POST") return reply({ error:"method_not_allowed" },405);
  if (!contactRuntimeReady(env) || !/^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET || "")) return reply({ error:"webhook_unavailable" },503);
  const bytes = await boundedBody(request,65536);
  if (!bytes) return reply({ error:"request_too_large" },413);
  if (!await validStripeSignature(bytes,request.headers.get("stripe-signature"),env.STRIPE_WEBHOOK_SECRET)) return reply({ error:"invalid_signature" },400);
  let event;
  try { event = JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)); } catch { return reply({ error:"invalid_event" },400); }
  if (!event || event.livemode !== /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY)) return reply({ error:"invalid_event" },400);
  if (!["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type)) return reply({ received:true });
  const object = event.data?.object;
  if (object?.metadata?.purpose !== "seller_whatsapp_unlock") return reply({ received:true });
  if (!/^cs_(test|live)_[a-zA-Z0-9]{1,200}$/.test(object.id || "")) return reply({ error:"invalid_event" },400);
  try {
    const session = await stripeRequest(env, `checkout/sessions/${encodeURIComponent(object.id)}?expand[]=payment_intent.latest_charge`);
    // Completed sessions can still be awaiting a delayed payment; the later
    // async success event retries the same verified fulfillment function.
    if (session.payment_status !== "paid") return reply({ received:true });
    const contact = await fulfillPurchase(env,session);
    if (!contact) return reply({ received:true });
    return reply({ received:true,fulfilled:true });
  } catch { return reply({ error:"fulfillment_unavailable" },503); }
}

export async function handleContactUnlock(request, env) {
  const url = new URL(request.url);
  const route = url.pathname.slice("/api/contact/".length);
  if (!["availability", "checkout", "reveal"].includes(route)) return reply({ error: "not_found" }, 404);
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const originError = sameOriginError(request);
  if (originError) return reply({ error: "invalid_origin" }, 403);
  if (!(route === "reveal" ? contactRuntimeReady(env) : contactUnlockEnabled(env))) return reply({ error: "contact_unlock_unavailable" }, 503);
  try {
    enforcePublicReadRateLimit(request, `contact-${route}`, route === "checkout" ? 5 : 30, route === "checkout" ? 30 : 300);
    let body = {};
    if (request.method === "POST") {
      if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "json_required" }, 415);
      const reader = request.body?.getReader();
      const chunks = [];
      let size = 0;
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2048) { await reader.cancel(); return reply({ error: "request_too_large" }, 413); }
          chunks.push(value);
        }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply({ error: "invalid_json" }, 400); }
      if (!body || Array.isArray(body) || typeof body !== "object") return reply({ error: "invalid_json" }, 400);
    }
    if (route === "reveal") {
      const buyer = buyerCookie(request);
      if (!buyer) return reply({ error: "original_browser_required" }, 403);
      if (!/^cs_(test|live)_[a-zA-Z0-9]{1,200}$/.test(body.session_id || "")) return reply({ error: "invalid_session" }, 400);
      const session = await stripeRequest(env, `checkout/sessions/${encodeURIComponent(body.session_id)}?expand[]=payment_intent.latest_charge`);
      const owner = await buyerHash(buyer);
      if (session.metadata?.purpose !== "seller_whatsapp_unlock" || session.metadata?.owner !== owner) return reply({ error: "invalid_purchase" }, 403);
      if (session.status === "expired" && session.payment_status === "unpaid"
          && (!session.payment_intent || ["canceled", "requires_payment_method"].includes(session.payment_intent.status))
          && !session.payment_intent?.latest_charge?.paid) {
        return reply({ error: "payment_expired", plate: session.metadata.plate, listing_id: session.metadata.listing_id }, 410);
      }
      if (session.status !== "complete" || session.payment_status !== "paid") return reply({ error: "payment_pending" }, 409);
      const charge = session.payment_intent?.latest_charge;
      if (session.mode === "payment" && session.currency === "hkd" && session.amount_total === PRICE
          && session.livemode === /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY)
          && session.payment_intent?.status === "succeeded" && charge?.paid === true
          && (charge.refunded || charge.amount_refunded > 0)) {
        return reply({ error: "purchase_refunded", plate: session.metadata.plate, listing_id: session.metadata.listing_id }, 403);
      }
      const contact = await fulfillPurchase(env,session);
      if (!contact) return reply({ error:"invalid_purchase" },403);
      const sourceUrl = /^https:\/\/m\.28car\.com\/num_dsp\.php\?/.test(session.metadata.source_url || "") ? session.metadata.source_url : null;
      const asking = Number(session.metadata.asking_price_hkd);
      return reply({ ...contact, whatsapp_url: `https://wa.me/${contact.whatsapp_number}`,
        source_url: sourceUrl, observed_at: session.metadata.observed_at || null,
        ...(Object.hasOwn(session.metadata, "asking_price_hkd") ? { asking_price_hkd: Number.isSafeInteger(asking) && asking > 0 ? asking : null } : {}),
      });
    }
    const plate = normalizeQuery(String(body.plate || ""));
    const listingId = String(body.listing_id || "");
    const contact = await advertisedContact(request, env, plate, listingId);
    if (!contact) return reply({ error: "contact_unavailable" }, 404);
    if (route === "availability") {
      const { whatsapp_number, ...preview } = contact;
      return reply({ available: true, price_hkd: 99, ...preview }, 200, buyerCookie(request) || randomBuyer());
    }
    const buyer = buyerCookie(request);
    if (!buyer) return reply({ error: "cookies_required" }, 403);
    // Check the catalog before taking payment: a mistaken price must never charge
    // a buyer an amount that the reveal endpoint cannot fulfill.
    const price = await stripeRequest(env, `prices/${encodeURIComponent(env.CONTACT_UNLOCK_PRICE_ID)}`);
    if (!price.active || price.type !== "one_time" || price.recurring != null
        || price.currency !== "hkd" || price.unit_amount !== PRICE || price.transform_quantity != null
        || price.livemode !== /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY)) {
      return reply({ error: "contact_unlock_unavailable" }, 503);
    }
    const owner = await buyerHash(buyer);
    const params = new URLSearchParams({
      mode: "payment",
      integration_identifier: STRIPE_INTEGRATION_IDENTIFIER,
      "adaptive_pricing[enabled]": "false",
      "managed_payments[enabled]": "false",
      "line_items[0][price]": env.CONTACT_UNLOCK_PRICE_ID,
      "line_items[0][quantity]": "1",
      "metadata[purpose]": "seller_whatsapp_unlock", "metadata[owner]": owner,
      "metadata[plate]": plate, "metadata[listing_id]": listingId,
      "metadata[contact]": await encryptContact(env, { plate, listing_id: listingId, whatsapp_number: contact.whatsapp_number }, owner),
      "metadata[source_url]": contact.source_url,
      "metadata[observed_at]": contact.observed_at,
      "metadata[asking_price_hkd]": contact.asking_price_hkd == null ? "" : String(contact.asking_price_hkd),
      "expires_at": String(Math.floor(Date.now() / 1000) + 1800),
      "custom_text[submit][message]": "HK$99 unlocks one advertised contact. The source listing is freely available on 28car. Seller reply, ownership and sale are not guaranteed.",
      success_url: `${url.origin}/contact.html?session_id={CHECKOUT_SESSION_ID}&lang=${body.lang === "en" ? "en" : "zh"}`,
      cancel_url: `${url.origin}/contact.html?plate=${plate}&listing_id=${listingId}&cancelled=1&lang=${body.lang === "en" ? "en" : "zh"}`,
    });
    const session = await stripeRequest(env, "checkout/sessions", params);
    const destination = new URL(session.url);
    if (destination.protocol !== "https:" || destination.hostname !== "checkout.stripe.com") throw new Error("payment_provider_unavailable");
    return reply({ checkout_url: destination.toString() });
  } catch (error) {
    if (error.status === 429) return reply({ error: "rate_limited" }, 429);
    return reply({ error: "contact_unlock_unavailable" }, 503);
  }
}
