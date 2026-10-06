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
const env = {
  CONTACT_UNLOCK_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_fixture", CONTACT_UNLOCK_ENCRYPTION_KEY: "ab".repeat(32),
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
  stripeCalls++;
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
  assert.equal(JSON.stringify(await response.json()).includes("61112222"), false);
  response = await call("checkout", { body: { plate: "TEST8", listing_id: "n100001" }, cookie });
  assert.equal(response.status, 200);
  assert.equal(checkoutForm.get("line_items[0][price_data][unit_amount]"), "9900");
  assert.equal(checkoutForm.get("line_items[0][price_data][currency]"), "hkd");
  assert.equal(checkoutForm.toString().includes("61112222"), false);
  const session = sessions.get("cs_test_fixture");
  response = await call("reveal", { body: { session_id: session.id }, cookie });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).whatsapp_url, "https://wa.me/85261112222");
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
    assert.equal((await call("reveal", { body: { session_id: session.id }, cookie })).status, 403);
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
