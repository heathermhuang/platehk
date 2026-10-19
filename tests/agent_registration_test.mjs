import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import worker, { AgentRegistrationStore } from "../cloudflare-worker/src/index.mjs";

const runtime = new Miniflare(convertV4MiniflareOptions({
  name: "agent-registration-test",
  modules: ["index.mjs", "api.mjs", "lib.mjs", "contact-unlock.mjs", "mcp.mjs", "agent-registration.mjs"]
    .map(name => ({ type: "ESModule", path: new URL(`../cloudflare-worker/src/${name}`, import.meta.url).pathname }))
    .concat({ type: "ESModule", path: new URL("../assets/decision-core.mjs", import.meta.url).pathname }),
  compatibilityDate: "2026-03-24",
  compatibilityFlags: ["nodejs_compat"],
  durableObjects: { AGENT_REGISTRATIONS: { className: "AgentRegistrationStore", useSQLite: true } },
  serviceBindings: { ASSETS: request => {
    const url = new URL(request.url);
    if (url.pathname === "/api/v1/index.json") return Response.json({ datasets: ["all"] });
    if (url.pathname === "/agent-claim.html") return Response.redirect(new URL("/agent-claim", url), 301);
    return new Response(request.method === "HEAD" ? null : "fixture", { headers: { "content-type": "text/html" } });
  } },
}));
after(() => runtime.dispose());
let ip = 1;
async function call(path, { method = "GET", json, form, token, client = `192.0.2.${ip++}`, origin } = {}) {
  const headers = { "cf-connecting-ip": client };
  if (token) headers.authorization = `Bearer ${token}`;
  if (json) headers["content-type"] = "application/json";
  if (form) headers["content-type"] = "application/x-www-form-urlencoded";
  if (origin) headers.origin = origin;
  return runtime.dispatchFetch(`https://plate.hk${path}`, { method, headers, body: json ? JSON.stringify(json) : form ? new URLSearchParams(form).toString() : undefined });
}
async function register() {
  const response = await call("/api/agent/register", { method: "POST", json: { type: "anonymous", scope: "auction:read" } });
  assert.equal(response.status, 201);
  assert.match(response.headers.get("cache-control"), /no-store/);
  return response.json();
}

test("real SQLite-backed registration, public read, one-time claim and immediate revocation", async () => {
  const registration = await register();
  assert.equal(registration.scope, "auction:read");
  assert.equal(registration.expires_in, 86400);
  const session = await call("/api/agent/session", { token: registration.access_token });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).registration_id, registration.registration_id);
  await runtime.unsafeEvictDurableObject("agent-registration-test", "AgentRegistrationStore", { name: registration.registration_id });
  assert.equal((await call("/api/agent/session", { token: registration.access_token })).status, 200);
  const dataset = await call("/api/v1/index.json", { token: registration.access_token });
  assert.equal(dataset.status, 200);
  assert.equal(dataset.headers.get("cache-control"), "private, no-store");
  const claim = await call("/api/agent/claim", { method: "POST", json: { claim_token: registration.claim_token } });
  assert.equal(claim.status, 200);
  const owner = await claim.json();
  assert.equal(owner.claimed, true);
  assert.equal(owner.scope, "auction:read");
  assert.equal((await call("/api/agent/claim", { method: "POST", json: { claim_token: registration.claim_token } })).status, 401);
  assert.equal((await call("/api/agent/session", { token: owner.management_token })).status, 401);
  const revoked = await call("/api/agent/revoke", { method: "POST", form: { token: owner.management_token } });
  assert.equal(revoked.status, 200);
  await runtime.unsafeEvictDurableObject("agent-registration-test", "AgentRegistrationStore", { name: registration.registration_id });
  assert.equal((await call("/api/agent/session", { token: registration.access_token })).status, 401);
  assert.equal((await call("/api/v1/index.json", { token: registration.access_token })).status, 401);
  assert.equal((await call("/api/agent/revoke", { method: "POST", form: { token: owner.management_token } })).status, 200);
  assert.equal((await call("/api/v1/index.json")).status, 200);
});

test("registered credentials cannot grant OCR, OAuth tokens, paid contacts or writes", async () => {
  const registration = await register();
  for (const path of ["/api/vision_plate", "/api/vision_session", "/api/oauth/token", "/api/contact/reveal", "/api/contact/checkout", "/api/market_signal"]) {
    const response = await call(path, { method: "POST", json: {}, token: registration.access_token });
    assert.equal(response.status, 403, path);
    assert.equal((await response.json()).error, "insufficient_scope");
  }
  assert.equal((await call("/api/agent/register", { method: "POST", json: { type: "anonymous", scope: "vision:ocr" } })).status, 400);
  assert.equal((await call("/api/agent/register", { method: "POST", json: { type: "service_auth" } })).status, 400);
  assert.equal((await call("/api/agent/register", { method: "POST", json: { type: "anonymous", email: "do-not-store@example.test" } })).status, 400);
  assert.equal((await call("/api/agent/revoke", { method: "POST", form: { token: registration.access_token } })).status, 200);
});

test("claim is atomic and forged credentials fail", async () => {
  const registration = await register();
  const forged = registration.access_token.slice(0, -1) + (registration.access_token.endsWith("a") ? "b" : "a");
  assert.equal((await call("/api/agent/session", { token: forged })).status, 401);
  const results = await Promise.all([1, 2].map(() => call("/api/agent/claim", { method: "POST", json: { claim_token: registration.claim_token } })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 401]);
  await call("/api/agent/revoke", { method: "POST", form: { token: registration.access_token } });
});

test("only credential hashes persist; expiry fails closed and alarms clean up safely", async () => {
  const objects = new Map();
  const env = { AGENT_REGISTRATIONS: {
    idFromName: name => name,
    get(name) {
      if (!objects.has(name)) {
        const values = new Map();
        const state = { blockConcurrencyWhile: fn => fn(), storage: { get: async key => values.get(key), put: async (key, value) => values.set(key, structuredClone(value)), setAlarm: async time => { state.alarmAt = time; }, deleteAll: async () => values.clear() } };
        objects.set(name, { object: new AgentRegistrationStore(state), state });
      }
      return objects.get(name).object;
    },
  } };
  const response = await worker.fetch(new Request("https://plate.hk/api/agent/register", { method: "POST", headers: { "content-type": "application/json" }, body: '{"type":"anonymous"}' }), env, {});
  const registration = await response.json();
  assert.equal(response.status, 201);
  const { object, state } = objects.get(registration.registration_id);
  const record = await state.storage.get("record");
  assert.equal(JSON.stringify(record).includes(registration.access_token), false);
  assert.equal(JSON.stringify(record).includes(registration.claim_token), false);
  assert.match(record.accessHash, /^[a-f0-9]{64}$/);
  await object.alarm();
  assert.equal((await state.storage.get("record")).id, registration.registration_id);
  assert.equal(state.alarmAt, record.expiresAt);
  await state.storage.put("record", { ...record, expiresAt: Date.now() - 1 });
  const expired = await worker.fetch(new Request("https://plate.hk/api/agent/session", { headers: { authorization: `Bearer ${registration.access_token}` } }), env, {});
  assert.equal(expired.status, 401);
  await object.alarm();
  assert.equal(await state.storage.get("record"), undefined);
});

test("persistent per-IP limits, bounded bodies, cross-origin rejection and correct discovery", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await call("/api/agent/register", { method: "POST", json: { type: "anonymous" }, client: "198.51.100.90" })).status, 201);
  const limited = await call("/api/agent/register", { method: "POST", json: { type: "anonymous" }, client: "198.51.100.90" });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal((await call("/api/agent/register", { method: "POST", json: { type: "anonymous" }, origin: "https://evil.example" })).status, 403);
  assert.equal((await call("/api/agent/register", { method: "POST", json: { type: "anonymous", padding: "x".repeat(4096) } })).status, 413);
  assert.equal((await call("/api/agent/register")).status, 405);
  const metadata = await (await call("/.well-known/oauth-authorization-server")).json();
  assert.equal(metadata.agent_auth.register_uri, "https://plate.hk/api/agent/register");
  assert.deepEqual(metadata.agent_auth.identity_types_supported, ["anonymous"]);
  assert.deepEqual(metadata.agent_auth.anonymous.credential_types_supported, ["api_key"]);
  const root = await (await call("/.well-known/oauth-protected-resource")).json();
  assert.deepEqual(root.scopes_supported, ["auction:read", "vision:ocr"]);
  const ocr = await (await call("/.well-known/oauth-protected-resource/api/vision_plate")).json();
  assert.deepEqual(ocr.scopes_supported, ["vision:ocr"]);
});

test("authenticated-read abuse returns 429 without being misreported as a storage outage", async () => {
  const registration = await register();
  for (let i = 0; i < 240; i++) {
    const response = await call("/api/v1/index.json", { token: registration.access_token, client: "198.51.100.91" });
    assert.equal(response.status, 200);
    await response.text();
  }
  const limited = await call("/api/v1/index.json", { token: registration.access_token, client: "198.51.100.91" });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  await call("/api/agent/revoke", { method: "POST", form: { token: registration.access_token } });
});

test("claim page aliases preserve privacy without Cloudflare asset redirects on any host", async () => {
  for (const origin of ["https://plate.hk", "https://preview.example"]) {
    for (const path of ["/agent/claim", "/agent-claim", "/agent-claim.html"]) {
      const response = await runtime.dispatchFetch(origin + path, { redirect: "manual" });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.match(response.headers.get("x-robots-tag"), /noindex/);
      assert.equal((await runtime.dispatchFetch(origin + path, { method: "POST" })).status, 405);
    }
  }
});
