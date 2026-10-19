import { ApiError, clientIp, enforceRateLimit, handleApiError, jsonResponse, readJsonBody, readBoundedText, requireJsonContentType, sameOriginError } from "./lib.mjs";

export const AGENT_SCOPE = "auction:read";
const TTL_SECONDS = 86400;
const READ_ROUTES = new Set(["/api/health", "/api/search", "/api/issues", "/api/issue", "/api/results", "/api/comparables"]);
const credentialPattern = /^(phk|phc|phm)_(reg_[a-f0-9]{32})\.([a-f0-9]{64})$/;
const encoder = new TextEncoder();

function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), value => value.toString(16).padStart(2, "0")).join("");
}

async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");
}

function credential(value) {
  const match = credentialPattern.exec(String(value || ""));
  return match ? { kind: match[1], id: match[2], value: match[0] } : null;
}

function store(env, name) {
  if (!env.AGENT_REGISTRATIONS) throw new ApiError("agent_registration_unavailable", 503);
  return env.AGENT_REGISTRATIONS.get(env.AGENT_REGISTRATIONS.idFromName(name));
}

async function command(env, name, data) {
  return store(env, name).fetch(new Request("https://agent-store.internal/", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data),
  }));
}

function unauthorized() {
  return jsonResponse({ error: "invalid_token" }, 401, {
    "www-authenticate": 'Bearer error="invalid_token", resource_metadata="https://plate.hk/.well-known/oauth-protected-resource"',
  });
}

// Each registration and each hashed-IP rate bucket has its own strongly consistent
// object. Only hashes of credentials are persisted. Objects expire automatically.
// The fetch interface keeps this class usable by the existing Node test harness.
export class AgentRegistrationStore {
  constructor(state) { this.state = state; }

  async fetch(request) {
    const input = await request.json();
    return this.state.blockConcurrencyWhile(async () => {
      const now = Date.now();
      const current = await this.state.storage.get("record");
      if (input.action === "limit") {
        const bucket = current && current.expiresAt > now ? current : { count: 0, expiresAt: now + input.windowMs };
        if (bucket.count >= input.limit) return jsonResponse({ error: "rate_limited" }, 429, { "retry-after": String(Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000))) });
        bucket.count++;
        await this.state.storage.put("record", bucket);
        await this.state.storage.setAlarm(bucket.expiresAt);
        return jsonResponse({ ok: true });
      }
      if (input.action === "create") {
        if (current) return jsonResponse({ error: "registration_conflict" }, 409);
        await this.state.storage.put("record", input.record);
        await this.state.storage.setAlarm(input.record.expiresAt);
        return jsonResponse({ ok: true }, 201);
      }
      if (!current || current.expiresAt <= now || current.revoked) return unauthorized();
      const expected = input.kind === "phk" ? current.accessHash : input.kind === "phc" ? current.claimHash : input.kind === "phm" ? current.ownerHash : null;
      if (!expected || expected !== input.hash) return unauthorized();
      if (input.action === "claim" && input.kind === "phc") {
        current.claimHash = null;
        current.ownerHash = input.ownerHash;
        current.claimed = true;
        await this.state.storage.put("record", current);
      } else if (input.action === "revoke" && ["phk", "phm"].includes(input.kind)) {
        current.revoked = true;
        current.accessHash = null;
        current.claimHash = null;
        current.ownerHash = null;
        await this.state.storage.put("record", current);
      } else if (input.action !== "check" || input.kind !== "phk") {
        return unauthorized();
      }
      return jsonResponse({ registration_id: current.id, scope: AGENT_SCOPE, expires_at: new Date(current.expiresAt).toISOString(), claimed: Boolean(current.claimed) });
    });
  }

  async alarm() {
    const record = await this.state.storage.get("record");
    if (record && record.expiresAt > Date.now()) await this.state.storage.setAlarm(record.expiresAt);
    else await this.state.storage.deleteAll();
  }
}

async function register(request, env) {
  const mediaError = requireJsonContentType(request);
  if (mediaError) return mediaError;
  const input = await readJsonBody(request, 2048);
  if (input.type !== "anonymous") return jsonResponse({ error: "unsupported_identity_type" }, 400);
  if (input.scope !== undefined && input.scope !== AGENT_SCOPE) return jsonResponse({ error: "invalid_scope" }, 400);
  if (Object.keys(input).some(key => !["type", "scope"].includes(key))) return jsonResponse({ error: "unsupported_registration_field" }, 400);
  const ipHash = await hash(clientIp(request));
  for (const [name, limit, windowMs] of [[`minute:${ipHash}`, 5, 60000], [`hour:${ipHash}`, 40, 3600000], ["global:hour", 500, 3600000]]) {
    const allowed = await command(env, name, { action: "limit", limit, windowMs });
    if (!allowed.ok) return allowed;
  }
  const id = `reg_${randomHex(16)}`;
  const access = `phk_${id}.${randomHex(32)}`;
  const claim = `phc_${id}.${randomHex(32)}`;
  const expiresAt = Date.now() + TTL_SECONDS * 1000;
  const created = await command(env, id, { action: "create", record: {
    id, expiresAt, accessHash: await hash(access), claimHash: await hash(claim), ownerHash: null, claimed: false, revoked: false,
  } });
  if (!created.ok) return created;
  return jsonResponse({ registration_id: id, registration_type: "anonymous", access_token: access, token_type: "Bearer", scope: AGENT_SCOPE, expires_in: TTL_SECONDS, expires_at: new Date(expiresAt).toISOString(), claim_token: claim, claim_url: "https://plate.hk/agent/claim", revocation_uri: "https://plate.hk/api/agent/revoke" }, 201);
}

async function claim(request, env) {
  const mediaError = requireJsonContentType(request);
  if (mediaError) return mediaError;
  const input = await readJsonBody(request, 2048);
  const parsed = credential(input.claim_token);
  if (!parsed || parsed.kind !== "phc") return unauthorized();
  const owner = `phm_${parsed.id}.${randomHex(32)}`;
  const result = await command(env, parsed.id, { action: "claim", kind: parsed.kind, hash: await hash(parsed.value), ownerHash: await hash(owner) });
  if (!result.ok) return result;
  return jsonResponse({ ...await result.json(), management_token: owner, revocation_uri: "https://plate.hk/api/agent/revoke" });
}

async function revoke(request, env) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType !== "application/x-www-form-urlencoded") return jsonResponse({ error: "unsupported_media_type" }, 415);
  const form = new URLSearchParams(await readBoundedText(request, 2048));
  const parsed = credential(form.get("token"));
  if (parsed && ["phk", "phm"].includes(parsed.kind)) {
    await command(env, parsed.id, { action: "revoke", kind: parsed.kind, hash: await hash(parsed.value) });
  }
  // RFC 7009: unknown and already revoked credentials produce the same response.
  return jsonResponse({});
}

export async function checkAgentCredential(request, env) {
  enforceRateLimit(`agent-check:${clientIp(request)}`, 240, 60);
  const header = request.headers.get("authorization") || "";
  if (!/^Bearer\s+/i.test(header)) return unauthorized();
  const raw = header.replace(/^Bearer\s+/i, "");
  const parsed = credential(raw);
  if (!parsed || parsed.kind !== "phk") return unauthorized();
  return command(env, parsed.id, { action: "check", kind: parsed.kind, hash: await hash(parsed.value) });
}

export async function guardAgentRead(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!/^Bearer\s+ph[kcm]_/i.test(auth)) return null;
  const checked = await checkAgentCredential(request, env);
  if (!checked.ok) return checked;
  const path = new URL(request.url).pathname;
  const allowed = (request.method === "GET" || request.method === "HEAD") && (READ_ROUTES.has(path) || path.startsWith("/api/v1/"));
  if (!allowed && !(path === "/mcp" && request.method === "POST")) return jsonResponse({ error: "insufficient_scope", scope: AGENT_SCOPE }, 403);
  return null;
}

export async function handleAgentRegistration(request, env) {
  try {
    enforceRateLimit(`agent-management:${clientIp(request)}`, 120, 60);
    const route = new URL(request.url).pathname;
    const hasBrowserProvenance = ["origin", "referer", "sec-fetch-site"].some(name => request.headers.has(name));
    const originError = hasBrowserProvenance ? sameOriginError(request) : null;
    if (originError) return originError;
    if (route === "/api/agent/session" && request.method === "GET") return await checkAgentCredential(request, env);
    if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, { allow: route === "/api/agent/session" ? "GET" : "POST" });
    if (route === "/api/agent/register") return await register(request, env);
    if (route === "/api/agent/claim") return await claim(request, env);
    if (route === "/api/agent/revoke") return await revoke(request, env);
    return jsonResponse({ error: "not_found" }, 404);
  } catch (error) { return handleApiError(error); }
}
