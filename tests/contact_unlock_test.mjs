import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "../cloudflare-worker/src/index.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const now = new Date().toISOString();
const listing = { listing_id: "n100001", source_url: "https://m.28car.com/num_dsp.php?h_vid=50000001", price_type: "fixed", asking_price_hkd: 88000, first_seen_at: now, last_seen_at: now };
const market = { schema_version: 1, source: "28car", scraped_at: now, fresh_for_hours: 72, coverage: { complete: true }, signals: { TEST8: [listing] } };
const contacts = { ...market, contacts: { n100001: { plate: "TEST8", whatsapp_number: "85261112222", observed_at: now } } };
delete contacts.signals;
let sessions = new Map();
let stripeCalls = 0;
let checkoutForm;
let fulfillmentWrites = 0;
const catalogPrice = { active: true, type: "one_time", recurring: null, currency: "hkd", unit_amount: 9900, transform_quantity: null, livemode: false };
const env = {
  CONTACT_UNLOCK_ENABLED: "true", STRIPE_WEBHOOK_SECRET: "whsec_fixture", STRIPE_SECRET_KEY: "rk_test_fixture", CONTACT_UNLOCK_PRICE_ID: "price_fixture", CONTACT_UNLOCK_ENCRYPTION_KEY: "ab".repeat(32),
  ASSETS: { async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/_market/28car/T.json") return Response.json(market);
    if (path === "/_market/28car/contacts/T.json") return Response.json(contacts);
    if (path === "/contact.html") return new Response("<html>contact</html>", { headers: { "content-type": "text/html" } });
    return new Response("Not found", { status: 404 });
  } },
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  assert.equal(url.origin, "https://api.stripe.com");
  assert.equal(options.headers["stripe-version"], "2026-09-30.endive");
  stripeCalls++;
  if (url.pathname === "/v1/prices/price_fixture") return Response.json(catalogPrice);
  if (options.method === "POST" && /^\/v1\/checkout\/sessions\/cs_/.test(url.pathname)) {
    const session = sessions.get(url.pathname.split("/").at(-1));
    assert.equal(options.headers["idempotency-key"], `platehk-contact-fulfill-${session.id}`);
    fulfillmentWrites++;
    session.metadata.contact_fulfillment_version = "1";
    return Response.json(session);
  }
  if (options.method === "POST") {
    checkoutForm = new URLSearchParams(options.body);
    const id = "cs_test_fixture";
    sessions.set(id, { id, mode: "payment", status: "complete", payment_status: "paid", amount_total: 9900, currency: "hkd", livemode: false,
      payment_intent: { status: "succeeded", latest_charge: { paid: true, refunded: false, amount_refunded: 0, disputed: false } },
      metadata: Object.fromEntries([...checkoutForm].filter(([key]) => key.startsWith("metadata[")).map(([key, value]) => [key.slice(9, -1), value])) });
    return Response.json({ id, url: "https://checkout.stripe.com/c/pay/fixture" });
  }
  return Response.json(sessions.get(url.pathname.split("/").at(-1)));
};
let ip = 1;
const call = (route, { body, cookie, origin = "https://plate.hk", overrideEnv = env } = {}) => {
  if (route.startsWith("availability?")) {
    const query = new URLSearchParams(route.split("?")[1]);
    body = { plate: query.get("plate"), listing_id: query.get("listing_id") };
    route = "availability";
  }
  const headers = { origin, "cf-connecting-ip": `192.0.2.${ip++}`, ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) };
  return worker.fetch(new Request(`https://plate.hk/api/contact/${route}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined }), overrideEnv, {});
};
try {
  let response = await call("availability?plate=TEST8&listing_id=n100001");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const cookie = response.headers.get("set-cookie").split(";")[0];
  assert.match(response.headers.get("set-cookie"), /Secure; HttpOnly; SameSite=Lax/);
  const preview = await response.json();
  assert.equal(JSON.stringify(preview).includes("61112222"), false);
  assert.equal(Object.hasOwn(preview, "whatsapp_number"), false);
  assert.equal(preview.asking_price_hkd, 88000);
  assert.equal(preview.source_url, listing.source_url);
  assert.equal(preview.observed_at, now);
  response = await call("checkout", { body: { plate: "TEST8", listing_id: "n100001" }, cookie });
  assert.equal(response.status, 200);
  assert.equal(checkoutForm.get("line_items[0][price]"), "price_fixture");
  assert.equal(checkoutForm.has("line_items[0][price_data][product_data][name]"), false);
  assert.equal(checkoutForm.has("payment_method_types[0]"), false);
  assert.equal(checkoutForm.get("adaptive_pricing[enabled]"), "false");
  assert.match(checkoutForm.get("integration_identifier"), /^platehk-contact-unlock-[a-z]{8}$/);
  assert.equal(checkoutForm.toString().includes("61112222"), false);
  const session = sessions.get("cs_test_fixture");

  const sign = async (body, timestamp = Math.floor(Date.now()/1000)) => {
    const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    const hash = new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${timestamp}.${body}`)));
    return `t=${timestamp},v1=${[...hash].map(byte=>byte.toString(16).padStart(2,"0")).join("")}`;
  };
  const event = {id:"evt_fixture",livemode:false,type:"checkout.session.completed",data:{object:{id:session.id,metadata:{purpose:"seller_whatsapp_unlock"}}}};
  const webhook = (body,signature,overrideEnv=env) => worker.fetch(new Request("https://plate.hk/api/contact/webhook",{method:"POST",headers:{"stripe-signature":signature,"content-type":"application/json"},body}),overrideEnv,{});
  const eventBody=JSON.stringify(event);
  let eventSignature=await sign(eventBody);
  const callsBefore=stripeCalls;
  assert.equal((await webhook(eventBody,"invalid")).status,400);
  assert.equal((await webhook(eventBody,await sign(eventBody,Math.floor(Date.now()/1000)-1000))).status,400);
  assert.equal((await webhook(eventBody+" ",eventSignature)).status,400);
  assert.equal(stripeCalls,callsBefore);
  let eventResponse=await webhook(eventBody,eventSignature);
  assert.equal(eventResponse.status,200);
  assert.equal((await eventResponse.json()).fulfilled,true);
  assert.equal(fulfillmentWrites,1);
  assert.equal(session.metadata.contact_fulfillment_version,"1");
  assert.equal((await webhook(eventBody,eventSignature)).status,200);
  assert.equal(fulfillmentWrites,1);
  // Server-confirmed payment is required even when the signed event says complete.
  delete session.metadata.contact_fulfillment_version;
  session.payment_status="unpaid";
  eventResponse=await webhook(eventBody,eventSignature);
  assert.equal((await eventResponse.json()).fulfilled,undefined);
  assert.equal(fulfillmentWrites,1);
  session.payment_status="paid";
  event.type="checkout.session.async_payment_succeeded";
  const delayed=JSON.stringify(event);
  assert.equal((await webhook(delayed,await sign(delayed))).status,200);
  assert.equal(fulfillmentWrites,2);
  event.livemode=true;
  const wrongMode=JSON.stringify(event);
  assert.equal((await webhook(wrongMode,await sign(wrongMode))).status,400);
  event.livemode=false;
  // New checkout is held until its signing secret exists, while an already paid
  // owner can recover the contact even after the new-sales switch is disabled.
  assert.equal((await call("availability?plate=TEST8&listing_id=n100001",{overrideEnv:{...env,STRIPE_WEBHOOK_SECRET:""}})).status,503);
  assert.equal((await call("reveal",{body:{session_id:session.id},cookie,overrideEnv:{...env,CONTACT_UNLOCK_ENABLED:"false"}})).status,200);
  for (const change of [{ active: false }, { type: "recurring", recurring: { interval: "month" } }, { unit_amount: 19900 }, { currency: "usd" }, { livemode: true }, { transform_quantity: { divide_by: 2, round: "up" } }]) {
    const previous = { ...catalogPrice };
    Object.assign(catalogPrice, change);
    assert.equal((await call("checkout", { body: { plate: "TEST8", listing_id: "n100001" }, cookie })).status, 503);
    Object.assign(catalogPrice, previous);
  }
  response = await call("reveal", { body: { session_id: session.id }, cookie });
  assert.equal(response.status, 200);
  const unlocked = await response.json();
  assert.equal(unlocked.whatsapp_url, "https://wa.me/85261112222");
  assert.equal(unlocked.asking_price_hkd, 88000);
  assert.equal(unlocked.source_url, listing.source_url);
  assert.equal(unlocked.observed_at, now);
  // An expired unpaid checkout can restart; processing/paid payments never do.
  const savedIntent = session.payment_intent;
  session.status = "expired";
  session.payment_status = "unpaid";
  session.payment_intent = null;
  response = await call("reveal", { body: { session_id: session.id }, cookie });
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), { error: "payment_expired", plate: "TEST8", listing_id: "n100001" });
  assert.equal((await call("reveal", { body: { session_id: session.id }, cookie: `__Host-platehk-contact=${"cd".repeat(32)}` })).status, 403);
  session.payment_intent = { status: "processing" };
  assert.equal((await call("reveal", { body: { session_id: session.id }, cookie })).status, 409);
  session.payment_intent = savedIntent;
  assert.equal((await call("reveal", { body: { session_id: session.id }, cookie })).status, 409);
  session.status = "complete";
  session.payment_status = "paid";
  // Restricted live keys must enforce live mode, just like unrestricted keys.
  const liveEnv = { ...env, STRIPE_SECRET_KEY: "rk_live_fixture" };
  assert.equal((await call("reveal", { body: { session_id: session.id }, cookie, overrideEnv: liveEnv })).status, 403);
  session.livemode = true;
  assert.equal((await call("reveal", { body: { session_id: session.id }, cookie, overrideEnv: liveEnv })).status, 200);
  session.livemode = false;
  for (const key of ["pk_test_fixture", "sk_org_fixture", "invalid"]) {
    assert.equal((await call("availability?plate=TEST8&listing_id=n100001", { overrideEnv: { ...env, STRIPE_SECRET_KEY: key } })).status, 503);
  }
  assert.equal((await call("availability?plate=TEST8&listing_id=n100001", { overrideEnv: { ...env, CONTACT_UNLOCK_PRICE_ID: "" } })).status, 503);
  // Existing purchases with no preview metadata still reveal their purchased number.
  const savedPreview = { source_url: session.metadata.source_url, observed_at: session.metadata.observed_at, asking_price_hkd: session.metadata.asking_price_hkd };
  for (const key of Object.keys(savedPreview)) delete session.metadata[key];
  const oldPurchase = await call("reveal", { body: { session_id: session.id }, cookie });
  assert.equal(oldPurchase.status, 200);
  assert.equal(Object.hasOwn(await oldPurchase.json(), "asking_price_hkd"), false);
  Object.assign(session.metadata, savedPreview);
  // A refresh after the listing disappears still delivers the exact purchased snapshot.
  delete contacts.contacts.n100001;
  assert.equal((await call("reveal", { body: { session_id: session.id }, cookie })).status, 200);
  const otherBuyer = (await call("availability?plate=TEST8&listing_id=n100001")).status;
  assert.equal(otherBuyer, 404);
  for (const change of [{ amount_total: 19900 }, { currency: "usd" }, { livemode: true }, { mode: "subscription" }, { payment_status: "unpaid" }, { status: "open" }]) {
    const previous = { ...session };
    Object.assign(session, change);
    assert.notEqual((await call("reveal", { body: { session_id: session.id }, cookie })).status, 200);
    Object.assign(session, previous);
  }
  for (const change of [{ refunded: true }, { amount_refunded: 1 }, { disputed: true }]) {
    const charge = session.payment_intent.latest_charge;
    const previous = { ...charge };
    Object.assign(charge, change);
    const denied = await call("reveal", { body: { session_id: session.id }, cookie });
    assert.equal(denied.status, 403);
    if (change.refunded || change.amount_refunded > 0) {
      assert.deepEqual(await denied.json(), { error: "purchase_refunded", plate: "TEST8", listing_id: "n100001" });
    }
    Object.assign(charge, previous);
  }
  assert.equal((await call("reveal", { body: { session_id: session.id } })).status, 403);
  assert.equal((await call("reveal", { body: { session_id: session.id }, cookie: `__Host-platehk-contact=${"cd".repeat(32)}` })).status, 403);
  assert.equal((await call("checkout", { body: { plate: "TEST8", listing_id: "n100001" }, origin: "https://evil.test", cookie })).status, 403);
  const before = stripeCalls;
  assert.equal((await call("checkout", { body: { plate: "TEST8", listing_id: "n100001" }, cookie })).status, 404);
  assert.equal(stripeCalls, before);
  assert.equal((await call("availability?plate=TEST8&listing_id=n100001", { overrideEnv: { ...env, CONTACT_UNLOCK_ENABLED: "false" } })).status, 503);
  contacts.contacts.n100001 = { plate: "TEST8", whatsapp_number: "85261112222", observed_at: now };
  contacts.coverage = { complete: false };
  assert.equal((await call("availability?plate=TEST8&listing_id=n100001")).status, 404);
  contacts.coverage = { complete: true };
  contacts.contacts.n100001.observed_at = "2020-01-01T00:00:00Z";
  assert.equal((await call("availability?plate=TEST8&listing_id=n100001")).status, 404);
  contacts.contacts.n100001.observed_at = now;
  const signal = await worker.fetch(new Request("https://plate.hk/api/market_signal?plate=TEST8", { headers: { "cf-connecting-ip": "192.0.2.200" } }), env, {});
  const publicData = await signal.json();
  assert.equal(publicData.contact_unlock_available, true);
  assert.equal(JSON.stringify(publicData).includes("61112222"), false);
  for (const path of ["/_market/28car/contacts/T.json", "/%5Fmarket/28car/contacts/T.json"]) {
    assert.equal((await worker.fetch(new Request(`https://plate.hk${path}`), env, {})).status, 404);
  }
  session.metadata.contact = session.metadata.contact.slice(0, -6) + "AAAAAA";
  assert.equal((await call("reveal", { body: { session_id: session.id }, cookie })).status, 503);
  console.log("Contact unlock payment, isolation, encryption, freshness, refund and privacy tests passed.");
} finally { globalThis.fetch = realFetch; }
