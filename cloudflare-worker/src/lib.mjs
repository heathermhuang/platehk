const ISOLATE_RATE_LIMITS = new Map();
const encoder = new TextEncoder();
const STATIC_JSON_CACHE = new Map();

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
  const doubleLine = Array.isArray(row?.double_line)
    ? row.double_line
    : (row?.double_top !== undefined || row?.double_bottom !== undefined)
      ? [row.double_top || "", row.double_bottom || ""]
      : null;
  return {
    dataset_key: String(datasetKey || row?.dataset || ""),
    auction_date: String(row?.auction_date || ""),
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
    if (!row?.auction_date) continue;
    out.set(String(row.auction_date), row);
  }
  STATIC_JSON_CACHE.set(cacheKey, out);
  return out;
}

export async function loadDatasetPreset(env, requestUrl, dataset) {
  const rows = await getStaticJson(env, requestUrl, `./api/v1/${dataset}/preset.amount_desc.top1000.json`);
  return Array.isArray(rows) ? rows : [];
}

export async function loadDatasetIssueRows(env, requestUrl, dataset, auctionDate) {
  const rows = await getStaticJson(env, requestUrl, `./api/v1/${dataset}/issues/${auctionDate}.json`);
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
    const issueRows = await loadDatasetIssueRows(env, requestUrl, dataset, auctionDate);
    for (const row of issueRows) {
      if (seen >= offset && out.length < pageSize) {
        out.push(mapStaticRow(row, dataset, auctionMap.get(auctionDate) || null));
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

export function getSecuritySigningKey(env) {
  const seed = String(env.APP_SECURITY_TOKEN_SECRET || env.OPENAI_API_KEY || env.MYSQL_PASSWORD || "platehk-worker");
  return encoder.encode(cheapHashHex(`${seed}|platehk|vision-session`));
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

export function base64urlDecodeToString(input) {
  const padded = String(input).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
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
