import { getStaticJson, sameOriginError, enforcePublicReadRateLimit, normalizeQuery } from "./lib.mjs";

const COOKIE = "__Host-platehk-contact";
const PRICE = 9900;
const encoder = new TextEncoder();
const phonePattern = /^852[456789]\d{7}$/;

export function contactUnlockEnabled(env) {
  return env.CONTACT_UNLOCK_ENABLED === "true"
    && /^sk_(test|live)_/.test(env.STRIPE_SECRET_KEY || "")
    && /^[a-f0-9]{64}$/i.test(env.CONTACT_UNLOCK_ENCRYPTION_KEY || "");
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

async function stripeRequest(env, path, body) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("payment_provider_unavailable");
  return response.json();
}

export async function handleContactUnlock(request, env) {
  const url = new URL(request.url);
  const route = url.pathname.slice("/api/contact/".length);
  if (!["availability", "checkout", "reveal"].includes(route)) return reply({ error: "not_found" }, 404);
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const originError = sameOriginError(request);
  if (originError) return reply({ error: "invalid_origin" }, 403);
  if (!contactUnlockEnabled(env)) return reply({ error: "contact_unlock_unavailable" }, 503);
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
      if (session.status !== "complete" || session.payment_status !== "paid") return reply({ error: "payment_pending" }, 409);
      const charge = session.payment_intent?.latest_charge;
      if (session.mode !== "payment" || session.currency !== "hkd" || session.amount_total !== PRICE
          || session.livemode !== env.STRIPE_SECRET_KEY.startsWith("sk_live_")
          || session.payment_intent?.status !== "succeeded" || !charge || charge.paid !== true
          || charge.refunded || charge.amount_refunded > 0 || charge.disputed) return reply({ error: "invalid_purchase" }, 403);
      const contact = await decryptContact(env, session.metadata.contact, owner);
      if (!phonePattern.test(contact.whatsapp_number) || contact.plate !== session.metadata.plate
          || contact.listing_id !== session.metadata.listing_id) return reply({ error: "invalid_purchase" }, 403);
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
    const owner = await buyerHash(buyer);
    const params = new URLSearchParams({
      mode: "payment", "payment_method_types[0]": "card",
      "adaptive_pricing[enabled]": "false",
      "line_items[0][price_data][currency]": "hkd",
      "line_items[0][price_data][unit_amount]": String(PRICE),
      "line_items[0][price_data][product_data][name]": `Plate.hk — ${plate} seller WhatsApp contact`,
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
