const ISOLATE_RATE_LIMITS = new Map();
const encoder = new TextEncoder();
const STATIC_JSON_CACHE = new Map();
const OAUTH_SCOPE_VISION = "vision:ocr";
const OAUTH_SIGNING_CACHE = new Map();
const OAUTH_VERIFY_CACHE = new Map();

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return apiJsonResponse(JSON.stringify(data), status, extraHeaders);
}

export function apiJsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "SAMEORIGIN",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "geolocation=(), microphone=(), camera=(), browsing-topics=()",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "cross-origin-resource-policy": "same-origin",
      ...extraHeaders,
    },
  });
}

export function badRequest(code) {
  return jsonResponse({ error: code }, 400);
}

export function notFound(code = "not_found") {
  return jsonResponse({ error: code }, 404);
}

export function methodNotAllowed() {
  return jsonResponse({ error: "method_not_allowed" }, 405);
}

export function unsupportedMediaType() {
  return jsonResponse({ error: "unsupported_media_type" }, 415);
}

export function tooManyRequests(code = "rate_limited", retryAfterSeconds = 60) {
  return jsonResponse({ error: code }, 429, {
    "retry-after": String(Math.max(1, Math.floor(retryAfterSeconds))),
  });
}

export function clientIp(request) {
  const forwarded = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")
    || "";
  if (!forwarded) return "unknown";
  return forwarded.split(",")[0].trim() || "unknown";
}

export function clientFingerprint(request) {
  return cheapHashHex(clientIp(request)).slice(0, 16);
}

export function userAgentFingerprint(request) {
  return cheapHashHex(request.headers.get("user-agent") || "").slice(0, 16);
}

export function normalizeQuery(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]+/g, "")
    .replaceAll("I", "1")
    .replaceAll("O", "0")
    .replaceAll("Q", "");
}

export function normalizePlateForSearch(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]+/g, "");
}

export function validDataset(dataset, allowAll = false) {
  if (allowAll && dataset === "all") return true;
  return ["pvrm", "tvrm_physical", "tvrm_eauction", "tvrm_legacy"].includes(dataset);
}

export function composeAuctionKey(datasetKey, auctionDate) {
  const dataset = String(datasetKey || "");
  const date = String(auctionDate || "");
  if (!dataset || !date) return "";
  return `${dataset}::${date}`;
}

export function issueLookupKey(dataset, item) {
  if (!item || typeof item !== "object") return "";
  if (dataset === "all") {
    if (item.auction_key) return String(item.auction_key);
    return composeAuctionKey(item.dataset_key || item.dataset, item.auction_date);
  }
  return String(item.auction_date || "");
}

export function issueShardPath(dataset, issueId) {
  if (dataset === "all") {
    return `issues/${String(issueId || "").replace("::", "--")}.json`;
  }
  return `issues/${String(issueId || "")}.json`;
}

export function validIssueId(dataset, issueId) {
  const value = String(issueId || "");
  if (!value) return false;
  if (dataset === "all") {
    const match = /^([a-z_]+)::(\d{4}-\d{2}-\d{2})$/.exec(value);
    return !!(match && validDataset(match[1]));
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function shortQuerySearchPageCap(dataset, normalizedQuery) {
  const qLen = String(normalizedQuery || "").length;
  if (qLen <= 1) return dataset === "all" ? 3 : 5;
  if (qLen === 2) return dataset === "all" ? 5 : 10;
  return null;
}

export function requireMethod(request, method) {
  if (request.method !== method) return methodNotAllowed();
  return null;
}

export function requireGetLike(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed();
  return null;
}

export function requireJsonContentType(request) {
  const contentType = request.headers.get("content-type") || "";
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") return unsupportedMediaType();
  return null;
}

export function requireFormUrlencodedContentType(request) {
  const contentType = request.headers.get("content-type") || "";
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/x-www-form-urlencoded") return unsupportedMediaType();
  return null;
}

export function sameOriginError(request) {
  const current = new URL(request.url);
  const origin = (request.headers.get("origin") || "").trim();
  const referer = (request.headers.get("referer") || "").trim();
  const secFetchSite = (request.headers.get("sec-fetch-site") || "").trim().toLowerCase();
  const matches = (candidate) => {
    if (!candidate) return false;
    try {
      const url = new URL(candidate);
      return url.protocol === current.protocol && url.host === current.host;
    } catch {
      return false;
    }
  };
  if (origin && !matches(origin)) return jsonResponse({ error: "invalid_origin" }, 403);
  if (!origin && referer && !matches(referer)) return jsonResponse({ error: "invalid_origin" }, 403);
  if (!origin && !referer) return jsonResponse({ error: "origin_required" }, 403);
  if (secFetchSite && !["same-origin", "same-site", "none"].includes(secFetchSite)) {
    return jsonResponse({ error: "invalid_origin" }, 403);
  }
  return null;
}

export async function readJsonBody(request, maxBytes = 7 * 1024 * 1024) {
  const raw = await request.text();
  if (!raw) throw new ApiError("empty_body", 400);
  if (raw.length > maxBytes) throw new ApiError("payload_too_large", 400);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError("invalid_json", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError("invalid_json", 400);
  }
  return parsed;
}

export function enforcePageSize(endpointKey, pageSize, maxPageSize = 200) {
  const n = Number(pageSize);
  if (!Number.isInteger(n) || n < 1 || n > maxPageSize) {
    throw new ApiError("invalid_paging", 400, { endpoint: endpointKey, pageSize: n });
  }
}

export function enforceSearchWindow(dataset, normalizedQuery, page) {
  const maxPage = shortQuerySearchPageCap(dataset, normalizedQuery);
  if (page < 1) throw new ApiError("invalid_paging", 400);
  if (maxPage !== null && page > maxPage) {
    throw new ApiError("query_window_exceeded", 400, { dataset, page, maxPage });
  }
}

export function enforceRateLimit(bucket, limit, windowSeconds) {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const current = (ISOLATE_RATE_LIMITS.get(bucket) || []).filter((ts) => ts >= windowStart);
  if (current.length >= limit) {
    const retryAfterMs = Math.max(1000, current[0] + windowSeconds * 1000 - now);
    throw new ApiError("rate_limited", 429, { bucket }, Math.ceil(retryAfterMs / 1000));
  }
  current.push(now);
  ISOLATE_RATE_LIMITS.set(bucket, current);
}

export function enforcePublicReadRateLimit(request, endpointKey, minuteLimit, hourLimit) {
  const ip = clientIp(request);
  enforceRateLimit(`public-read:${endpointKey}:minute:${ip}`, minuteLimit, 60);
  enforceRateLimit(`public-read:${endpointKey}:hour:${ip}`, hourLimit, 3600);
}

export function mapStaticRow(row, datasetKey, auctionMeta = null) {
  const resolvedDatasetKey = String(row?.dataset_key || row?.dataset || datasetKey || "");
  const resolvedAuctionDate = String(row?.auction_date || "");
  const doubleLine = Array.isArray(row?.double_line)
    ? row.double_line
    : (row?.double_top !== undefined || row?.double_bottom !== undefined)
      ? [row.double_top || "", row.double_bottom || ""]
      : null;
  return {
    dataset_key: resolvedDatasetKey,
    auction_key: String(
      row?.auction_key
      || composeAuctionKey(
        resolvedDatasetKey,
        resolvedAuctionDate
      )
      || ""
    ),
    auction_date: resolvedAuctionDate,
    auction_date_label: row?.auction_date_label == null
      ? (auctionMeta?.auction_date_label == null ? null : String(auctionMeta.auction_date_label))
      : String(row.auction_date_label),
    date_precision: row?.date_precision == null ? (auctionMeta?.date_precision || null) : String(row.date_precision),
    year_range: row?.year_range == null ? (auctionMeta?.year_range || null) : String(row.year_range),
    is_lny: row?.is_lny != null ? Boolean(row.is_lny) : Boolean(auctionMeta?.is_lny),
    single_line: row?.single_line || null,
    double_line: doubleLine,
    amount_hkd: row?.amount_hkd == null ? null : Number(row.amount_hkd),
    pdf_url: row?.pdf_url || auctionMeta?.pdf_url || null,
    source_url: row?.source_url || auctionMeta?.source_url || null,
    source_format: row?.source_format || auctionMeta?.source_format || null,
    source_type: row?.source_type || auctionMeta?.source_type || null,
    source_sheet: row?.source_sheet || auctionMeta?.source_sheet || null,
    result_status: row?.result_status || null,
    result_text: row?.result_text || null,
  };
}

export function plateNormForRow(row) {
  if (row.single_line) return normalizePlateForSearch(row.single_line);
  if (Array.isArray(row.double_line)) return normalizePlateForSearch(row.double_line.join(""));
  return "";
}

export function compareSearchRows(a, b, sort, query) {
  const aNorm = plateNormForRow(a);
  const bNorm = plateNormForRow(b);
  const aRank = aNorm === query ? 0 : (aNorm.startsWith(query) ? 1 : 2);
  const bRank = bNorm === query ? 0 : (bNorm.startsWith(query) ? 1 : 2);
  if (aRank !== bRank) return aRank - bRank;
  if (sort === "amount_desc" || sort === "amount_asc") {
    const aAmount = a.amount_hkd == null ? -1 : Number(a.amount_hkd);
    const bAmount = b.amount_hkd == null ? -1 : Number(b.amount_hkd);
    if (aAmount !== bAmount) return sort === "amount_desc" ? (bAmount - aAmount) : (aAmount - bAmount);
  } else if (sort === "plate_asc") {
    const cmp = String(a.single_line || "").localeCompare(String(b.single_line || ""));
    if (cmp !== 0) return cmp;
  }
  if (a.auction_date !== b.auction_date) return String(b.auction_date).localeCompare(String(a.auction_date));
  return String(a.single_line || "").localeCompare(String(b.single_line || ""));
}

export async function getStaticJson(env, requestUrl, path) {
  const cacheKey = `${requestUrl}::${path}`;
  if (STATIC_JSON_CACHE.has(cacheKey)) return STATIC_JSON_CACHE.get(cacheKey);
  const requestBase = new URL(requestUrl);
  const normalizedPath = String(path || "").startsWith("./") ? `/${String(path).slice(2)}` : String(path || "");
  const assetUrl = new URL(normalizedPath, `${requestBase.origin}/`);
  const response = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method: "GET" }));
  if (!response.ok) return null;
  const data = await response.json();
  STATIC_JSON_CACHE.set(cacheKey, data);
  return data;
}

export async function getStaticText(env, requestUrl, path) {
  const cacheKey = `${requestUrl}::text::${path}`;
  if (STATIC_JSON_CACHE.has(cacheKey)) return STATIC_JSON_CACHE.get(cacheKey);
  const requestBase = new URL(requestUrl);
  const normalizedPath = String(path || "").startsWith("./") ? `/${String(path).slice(2)}` : String(path || "");
  const assetUrl = new URL(normalizedPath, `${requestBase.origin}/`);
  const response = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method: "GET" }));
  if (!response.ok) return null;
  const data = await response.text();
  STATIC_JSON_CACHE.set(cacheKey, data);
  return data;
}

export async function loadDatasetIndex(env, requestUrl) {
  return getStaticJson(env, requestUrl, "./api/v1/index.json");
}

export async function loadDatasetIssueManifest(env, requestUrl, dataset) {
  return getStaticJson(env, requestUrl, `./api/v1/${dataset}/issues.manifest.json`);
}

export async function loadDatasetAuctions(env, requestUrl, dataset) {
  const rows = await getStaticJson(env, requestUrl, `./api/v1/${dataset}/auctions.json`);
  return Array.isArray(rows) ? rows : [];
}

export async function loadDatasetAuctionMap(env, requestUrl, dataset) {
  const cacheKey = `${requestUrl}::auctionMap::${dataset}`;
  if (STATIC_JSON_CACHE.has(cacheKey)) return STATIC_JSON_CACHE.get(cacheKey);
  const rows = await loadDatasetAuctions(env, requestUrl, dataset);
  const out = new Map();
  for (const row of rows) {
    const key = issueLookupKey(dataset, row);
    if (!key) continue;
    out.set(key, row);
  }
  STATIC_JSON_CACHE.set(cacheKey, out);
  return out;
}

export async function loadDatasetPreset(env, requestUrl, dataset) {
  const rows = await getStaticJson(env, requestUrl, `./api/v1/${dataset}/preset.amount_desc.top1000.json`);
  return Array.isArray(rows) ? rows : [];
}

export async function loadDatasetIssueRows(env, requestUrl, dataset, auctionDate, relFile = "") {
  const target = relFile || issueShardPath(dataset, auctionDate);
  const rows = await getStaticJson(env, requestUrl, `./api/v1/${dataset}/${target}`);
  return Array.isArray(rows) ? rows : [];
}

export async function loadDatasetSlimRows(env, requestUrl, dataset) {
  const cacheKey = `${requestUrl}::slimRows::${dataset}`;
  if (STATIC_JSON_CACHE.has(cacheKey)) return STATIC_JSON_CACHE.get(cacheKey);
  const rows = await getStaticJson(env, requestUrl, `./api/v1/${dataset}/results.slim.json`);
  const out = Array.isArray(rows) ? rows : [];
  STATIC_JSON_CACHE.set(cacheKey, out);
  return out;
}

export async function loadDatasetResultsChunkManifest(env, requestUrl, dataset) {
  const decoded = await getStaticJson(env, requestUrl, `./api/v1/${dataset}/results.chunks.json`);
  return decoded && typeof decoded === "object" ? decoded : null;
}

export async function loadDatasetResultsChunk(env, requestUrl, dataset, relFile) {
  const rows = await getStaticJson(env, requestUrl, `./api/v1/${dataset}/${relFile}`);
  return Array.isArray(rows) ? rows : [];
}

export async function loadDatasetAllRows(env, requestUrl, dataset) {
  const cacheKey = `${requestUrl}::allRows::${dataset}`;
  if (STATIC_JSON_CACHE.has(cacheKey)) return STATIC_JSON_CACHE.get(cacheKey);
  const manifest = await loadDatasetResultsChunkManifest(env, requestUrl, dataset);
  if (!manifest || !Array.isArray(manifest.chunks)) return [];
  const chunks = [];
  for (const chunkMeta of manifest.chunks) {
    const rows = await loadDatasetResultsChunk(env, requestUrl, dataset, String(chunkMeta.file || ""));
    if (rows.length) chunks.push(...rows);
  }
  if (Number(manifest.total_rows || 0) <= 20000) {
    STATIC_JSON_CACHE.set(cacheKey, chunks);
  }
  return chunks;
}

export async function buildPagedDateDescRows(env, requestUrl, dataset, page, pageSize) {
  const manifest = await loadDatasetIssueManifest(env, requestUrl, dataset);
  const auctionMap = await loadDatasetAuctionMap(env, requestUrl, dataset);
  const issues = Array.isArray(manifest?.issues) ? manifest.issues : [];
  const offset = (page - 1) * pageSize;
  const limit = offset + pageSize;
  let seen = 0;
  const out = [];
  for (const issue of issues) {
    const auctionDate = String(issue?.auction_date || "");
    if (!auctionDate) continue;
    const issueRows = await loadDatasetIssueRows(
      env,
      requestUrl,
      dataset,
      auctionDate,
      String(issue?.file || `issues/${auctionDate}.json`)
    );
    const issueMeta = dataset === "all" ? issue : (auctionMap.get(auctionDate) || issue || null);
    for (const row of issueRows) {
      if (seen >= offset && out.length < pageSize) {
        out.push(mapStaticRow(row, dataset, issueMeta));
      }
      seen += 1;
      if (seen >= limit && out.length >= pageSize) {
        return { total: Number(manifest?.total_rows || seen), rows: out };
      }
    }
  }
  return { total: Number(manifest?.total_rows || seen), rows: out };
}

export async function withApiCache(request, ctx, ttlSeconds, fn) {
  if (!ttlSeconds) return fn();
  const cache = caches.default;
  const cacheRequest = new Request(request.url, { method: "GET" });
  const cached = await cache.match(cacheRequest);
  if (cached) return cached;
  const response = await fn();
  if (response.ok) ctx.waitUntil(cache.put(cacheRequest, response.clone()));
  return response;
}

export async function httpPostJson(env, url, payload, timeoutSeconds = 20) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), Math.max(5000, timeoutSeconds * 1000));
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, body: text, json };
  } finally {
    clearTimeout(timeout);
  }
}

export function getOpenAiConfig(env) {
  const apiKey = String(env.OPENAI_API_KEY || "").trim();
  const baseUrl = String(env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const timeoutSeconds = Number(env.OPENAI_TIMEOUT_SECONDS || 20) || 20;
  const visionModel = String(env.OPENAI_VISION_MODEL || "gpt-4.1-mini");
  return { apiKey, baseUrl, timeoutSeconds, visionModel };
}

export function getOAuthIssuer(request, env) {
  const configured = String(env.OAUTH_ISSUER || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

export function getOAuthScopeCatalog() {
  return [OAUTH_SCOPE_VISION];
}

export function buildOAuthProtectedResourceMetadata(request, env, resourcePath = "/api/vision_plate") {
  const issuer = getOAuthIssuer(request, env);
  const normalizedPath = `/${String(resourcePath || "/api/vision_plate").replace(/^\/+/, "")}`;
  return {
    resource: `${issuer}${normalizedPath}`,
    authorization_servers: [issuer],
    scopes_supported: getOAuthScopeCatalog(),
    bearer_methods_supported: ["header"],
  };
}

export function buildOAuthAuthorizationServerMetadata(request, env) {
  const issuer = getOAuthIssuer(request, env);
  return {
    issuer,
    token_endpoint: `${issuer}/api/oauth/token`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    grant_types_supported: ["client_credentials"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    scopes_supported: getOAuthScopeCatalog(),
    service_documentation: `${issuer}/api.html`,
  };
}

export function getOAuthJwksDocument(env) {
  const raw = String(env.OAUTH_JWKS_JSON || "").trim();
  if (!raw) return { keys: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.keys)) return { keys: [] };
    return {
      keys: parsed.keys.filter((key) => key && typeof key === "object").map((key) => ({
        ...key,
        key_ops: undefined,
        d: undefined,
      })),
    };
  } catch {
    return { keys: [] };
  }
}

export function getOAuthClientMap(env) {
  const raw = String(env.OAUTH_CLIENTS_JSON || "").trim();
  if (!raw) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Map();
  }
  const entries = Array.isArray(parsed)
    ? parsed
        .filter((item) => item && typeof item === "object" && item.client_id)
        .map((item) => [String(item.client_id), item])
    : Object.entries(parsed || {}).map(([clientId, config]) => [clientId, config]);
  const out = new Map();
  for (const [clientId, config] of entries) {
    const objectConfig = typeof config === "string" ? { client_secret: config } : (config || {});
    const secret = String(objectConfig.client_secret || "").trim();
    if (!clientId || !secret) continue;
    const allowedScopes = Array.isArray(objectConfig.scopes) && objectConfig.scopes.length
      ? objectConfig.scopes.map((scope) => String(scope || "").trim()).filter(Boolean)
      : [OAUTH_SCOPE_VISION];
    out.set(String(clientId), {
      client_id: String(clientId),
      client_secret: secret,
      scopes: Array.from(new Set(allowedScopes)),
      token_ttl_seconds: Math.max(60, Math.min(3600, Number(objectConfig.token_ttl_seconds || 300) || 300)),
    });
  }
  return out;
}

export function isOAuthConfigured(env) {
  return getOAuthClientMap(env).size > 0
    && getOAuthJwksDocument(env).keys.length > 0
    && String(env.OAUTH_JWT_PRIVATE_JWK || "").trim() !== "";
}

export function getSecuritySigningKey(env) {
  const seed = String(env.APP_SECURITY_TOKEN_SECRET || env.OPENAI_API_KEY || env.MYSQL_PASSWORD || "platehk-worker");
  return encoder.encode(cheapHashHex(`${seed}|platehk|vision-session`));
}

function getOAuthPrivateJwk(env) {
  const raw = String(env.OAUTH_JWT_PRIVATE_JWK || "").trim();
  if (!raw) throw new ApiError("oauth_not_configured", 503);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || parsed.kty !== "RSA") {
      throw new Error("invalid_jwk");
    }
    return parsed;
  } catch {
    throw new ApiError("oauth_not_configured", 503);
  }
}

function getOAuthPublicJwk(env, kid = "") {
  const jwks = getOAuthJwksDocument(env);
  const key = jwks.keys.find((item) => String(item?.kid || "") === String(kid || "")) || jwks.keys[0];
  if (!key || key.kty !== "RSA") throw new ApiError("oauth_not_configured", 503);
  return key;
}

async function getOAuthSigningKey(env) {
  const privateJwk = getOAuthPrivateJwk(env);
  const cacheKey = JSON.stringify(privateJwk);
  if (OAUTH_SIGNING_CACHE.has(cacheKey)) return OAUTH_SIGNING_CACHE.get(cacheKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  OAUTH_SIGNING_CACHE.set(cacheKey, key);
  return key;
}

async function getOAuthVerifyKey(env, kid = "") {
  const publicJwk = getOAuthPublicJwk(env, kid);
  const cacheKey = JSON.stringify(publicJwk);
  if (OAUTH_VERIFY_CACHE.has(cacheKey)) return OAUTH_VERIFY_CACHE.get(cacheKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  OAUTH_VERIFY_CACHE.set(cacheKey, key);
  return key;
}

function normalizeScopeRequest(rawScope, allowedScopes) {
  const requested = String(rawScope || "").trim();
  if (!requested) return allowedScopes.slice();
  const deduped = Array.from(new Set(requested.split(/\s+/).map((scope) => scope.trim()).filter(Boolean)));
  if (!deduped.length) return allowedScopes.slice();
  for (const scope of deduped) {
    if (!allowedScopes.includes(scope)) throw new ApiError("invalid_scope", 400);
  }
  return deduped;
}

export async function issueOAuthAccessToken(request, env, client, requestedScope = "") {
  const issuer = getOAuthIssuer(request, env);
  const privateJwk = getOAuthPrivateJwk(env);
  const scope = normalizeScopeRequest(requestedScope, client.scopes);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + client.token_ttl_seconds;
  const header = {
    alg: "RS256",
    typ: "at+jwt",
    kid: String(privateJwk.kid || getOAuthPublicJwk(env).kid || "platehk-oauth-rs256"),
  };
  const payload = {
    iss: issuer,
    sub: client.client_id,
    aud: `${issuer}/api/vision_plate`,
    client_id: client.client_id,
    scope: scope.join(" "),
    iat: now,
    nbf: now,
    exp,
    jti: randomHex(16),
  };
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signingKey = await getOAuthSigningKey(env);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    signingKey,
    encoder.encode(signingInput),
  );
  return {
    access_token: `${signingInput}.${base64urlEncode(new Uint8Array(signature))}`,
    token_type: "Bearer",
    expires_in: client.token_ttl_seconds,
    scope: payload.scope,
  };
}

export async function requireOAuthAccessToken(request, env, requiredScope = OAUTH_SCOPE_VISION) {
  const headerValue = String(request.headers.get("authorization") || "").trim();
  if (!/^bearer\s+/i.test(headerValue)) throw new ApiError("oauth_token_required", 403);
  const token = headerValue.replace(/^bearer\s+/i, "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) throw new ApiError("oauth_token_invalid", 403);
  let header;
  let payload;
  try {
    header = JSON.parse(base64urlDecodeToString(parts[0]));
    payload = JSON.parse(base64urlDecodeToString(parts[1]));
  } catch {
    throw new ApiError("oauth_token_invalid", 403);
  }
  if (!header || header.alg !== "RS256") throw new ApiError("oauth_token_invalid", 403);
  const verifyKey = await getOAuthVerifyKey(env, String(header.kid || ""));
  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    verifyKey,
    base64urlDecodeBytes(parts[2]),
    encoder.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new ApiError("oauth_token_invalid", 403);
  const issuer = getOAuthIssuer(request, env);
  const now = Math.floor(Date.now() / 1000);
  if (String(payload.iss || "") !== issuer) throw new ApiError("oauth_token_invalid", 403);
  if (Number(payload.nbf || 0) > now || Number(payload.exp || 0) < now) throw new ApiError("oauth_token_expired", 403);
  const audience = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud || "")];
  if (!audience.includes(`${issuer}/api/vision_plate`)) throw new ApiError("oauth_token_invalid", 403);
  const scopeSet = new Set(String(payload.scope || "").split(/\s+/).filter(Boolean));
  if (requiredScope && !scopeSet.has(requiredScope)) throw new ApiError("insufficient_scope", 403);
  return payload;
}

export async function issueVisionSessionToken(request, env) {
  const exp = Math.floor(Date.now() / 1000) + 300;
  const nonce = randomHex(16);
  const payload = {
    n: nonce,
    exp,
    fp: clientFingerprint(request),
    ua: userAgentFingerprint(request),
  };
  const payloadEnc = base64urlEncode(JSON.stringify(payload));
  const signature = await hmacSha256(getSecuritySigningKey(env), payloadEnc);
  const token = `${payloadEnc}.${base64urlEncode(signature)}`;
  const cookie = buildVisionCookie(nonce, exp);
  return { token, expires_at: exp, cookie };
}

export async function requireVisionSessionToken(request, env, token) {
  const raw = String(token || "").trim();
  if (!raw.includes(".")) throw new ApiError("vision_token_required", 403);
  const [payloadEnc, sigEnc] = raw.split(".", 2);
  const expectedSig = base64urlEncode(await hmacSha256(getSecuritySigningKey(env), payloadEnc));
  if (expectedSig !== sigEnc) throw new ApiError("vision_token_invalid", 403);
  const payloadText = base64urlDecodeToString(payloadEnc);
  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    throw new ApiError("vision_token_invalid", 403);
  }
  if (!payload || typeof payload !== "object") throw new ApiError("vision_token_invalid", 403);
  if (Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) throw new ApiError("vision_token_expired", 403);
  const cookieNonce = parseCookie(request.headers.get("cookie") || "")["__Host-platehk_vision"] || "";
  if (!cookieNonce || cookieNonce !== payload.n) throw new ApiError("vision_token_invalid", 403);
  if (String(payload.fp || "") !== clientFingerprint(request)) throw new ApiError("vision_token_invalid", 403);
  if (String(payload.ua || "") !== userAgentFingerprint(request)) throw new ApiError("vision_token_invalid", 403);
  return payload;
}

export function buildVisionCookie(nonce, exp) {
  return `__Host-platehk_vision=${nonce}; Expires=${new Date(exp * 1000).toUTCString()}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

export function parseCookie(raw) {
  const out = {};
  for (const part of String(raw || "").split(";")) {
    const [key, ...rest] = part.split("=");
    if (!key || !rest.length) continue;
    out[key.trim()] = rest.join("=").trim();
  }
  return out;
}

export function randomHex(bytes) {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return Array.from(raw, (v) => v.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256(keyBytes, text) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(String(text)));
  return new Uint8Array(sig);
}

export function base64urlEncode(input) {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64urlDecodeBytes(input) {
  const padded = String(input).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function base64urlDecodeToString(input) {
  return new TextDecoder().decode(base64urlDecodeBytes(input));
}

export function cheapHashHex(text) {
  let hash = 2166136261;
  const input = String(text);
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export class ApiError extends Error {
  constructor(code, status = 400, context = null, retryAfter = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.context = context;
    this.retryAfter = retryAfter;
  }
}

export async function handleApiError(error) {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return tooManyRequests(error.code, error.retryAfter || 60);
    }
    return jsonResponse({ error: error.code }, error.status);
  }
  console.error("[worker-api]", error);
  return jsonResponse({ error: "server_error" }, 500);
}
