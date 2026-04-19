import {
  ApiError,
  apiJsonResponse,
  badRequest,
  buildPagedDateDescRows,
  compareSearchRows,
  enforcePageSize,
  enforcePublicReadRateLimit,
  enforceRateLimit,
  enforceSearchWindow,
  getOAuthClientMap,
  getOpenAiConfig,
  getOAuthJwksDocument,
  getStaticJson,
  handleApiError,
  issueVisionSessionToken,
  issueOAuthAccessToken,
  issueLookupKey,
  issueShardPath,
  jsonResponse,
  loadDatasetAllRows,
  loadDatasetAuctionMap,
  loadDatasetIndex,
  loadDatasetIssueManifest,
  loadDatasetIssueRows,
  loadDatasetPreset,
  loadDatasetSlimRows,
  mapStaticRow,
  normalizeQuery,
  notFound,
  plateNormForRow,
  readJsonBody,
  requireFormUrlencodedContentType,
  requireGetLike,
  requireJsonContentType,
  requireMethod,
  requireOAuthAccessToken,
  requireVisionSessionToken,
  sameOriginError,
  validDataset,
  validIssueId,
  withApiCache,
  httpPostJson,
} from "./lib.mjs";

function oauthErrorResponse(error, status = 400, description = "", extraHeaders = {}) {
  const payload = { error };
  if (description) payload.error_description = description;
  return apiJsonResponse(JSON.stringify(payload), status, extraHeaders);
}

function parseClientBasicAuth(request) {
  const header = String(request.headers.get("authorization") || "").trim();
  if (!/^basic\s+/i.test(header)) return { clientId: "", clientSecret: "" };
  try {
    const decoded = atob(header.replace(/^basic\s+/i, ""));
    const idx = decoded.indexOf(":");
    if (idx === -1) return { clientId: "", clientSecret: "" };
    return {
      clientId: decoded.slice(0, idx),
      clientSecret: decoded.slice(idx + 1),
    };
  } catch {
    return { clientId: "", clientSecret: "" };
  }
}

async function readTokenForm(request) {
  const mediaErr = requireFormUrlencodedContentType(request);
  if (mediaErr) return { error: mediaErr, form: null };
  const raw = await request.text();
  if (raw.length > 8192) throw new ApiError("payload_too_large", 400);
  return {
    error: null,
    form: new URLSearchParams(raw),
  };
}

function timingSafeEqual(a, b) {
  const av = new TextEncoder().encode(String(a || ""));
  const bv = new TextEncoder().encode(String(b || ""));
  let mismatch = av.length === bv.length ? 0 : 1;
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i += 1) {
    mismatch |= (av[i] || 0) ^ (bv[i] || 0);
  }
  return mismatch === 0;
}

function duplicateKeyForRow(row) {
  const amount = row.amount_hkd == null ? null : Number(row.amount_hkd);
  if (row.date_precision === "day" && row.auction_date) {
    return JSON.stringify([plateNormForRow(row), amount, String(row.auction_date)]);
  }
  return JSON.stringify([plateNormForRow(row), amount]);
}

async function loadOverlapKeyLookup(env, request) {
  const decoded = await getStaticJson(env, request.url, "./data/all.tvrm_legacy_overlap.json");
  const lookup = { coarse: new Set(), exact: new Set() };
  for (const key of decoded?.keys || []) lookup.coarse.add(key);
  for (const key of decoded?.exact_keys || []) lookup.exact.add(key);
  return lookup;
}

async function dedupeAllIndexRows(env, request, rows) {
  const lookup = await loadOverlapKeyLookup(env, request);
  return rows.filter((row) => {
    if (row.dataset_key !== "tvrm_legacy") return true;
    const bucket = row.date_precision === "day" ? "exact" : "coarse";
    return !lookup[bucket].has(duplicateKeyForRow(row));
  });
}

async function loadAllPrefix1Rows(env, request, query, sort) {
  const decoded = await getStaticJson(env, request.url, "./data/all.prefix1.top200.json");
  const bucket = decoded?.[query];
  if (!bucket || !Array.isArray(bucket.rows)) return { total: 0, rows: [] };
  const rows = await dedupeAllIndexRows(env, request, bucket.rows);
  rows.sort((a, b) => compareSearchRows(a, b, sort, query));
  return { total: rows.length, rows };
}

async function loadHotSearchCache(env, request, query, page, pageSize, sort) {
  if (sort !== "amount_desc") return null;
  const decoded = await getStaticJson(env, request.url, `./data/hot_search/all_amount_desc/${encodeURIComponent(query)}.json`);
  if (!decoded || !Array.isArray(decoded.rows)) return null;
  const total = Number(decoded.total || decoded.rows.length);
  const cachedRows = Number(decoded.cached_rows || decoded.rows.length);
  const offset = (page - 1) * pageSize;
  if (offset >= cachedRows && total > cachedRows) return null;
  return {
    dataset: "all",
    q: query,
    issue: null,
    sort,
    page,
    page_size: pageSize,
    total,
    rows: decoded.rows.slice(offset, offset + pageSize),
  };
}

const CHILD_DATASETS = ["pvrm", "tvrm_physical", "tvrm_eauction", "tvrm_legacy"];

function sortRowsForResults(rows, sort) {
  return rows.slice().sort((a, b) => {
    if (sort === "amount_desc" || sort === "amount_asc") {
      const av = a?.amount_hkd == null ? -1 : Number(a.amount_hkd);
      const bv = b?.amount_hkd == null ? -1 : Number(b.amount_hkd);
      if (av !== bv) return sort === "amount_desc" ? bv - av : av - bv;
    } else if (sort === "plate_asc") {
      const cmp = String(a?.single_line || "").localeCompare(String(b?.single_line || ""));
      if (cmp !== 0) return cmp;
    }
    const aDate = String(a?.auction_date || "");
    const bDate = String(b?.auction_date || "");
    if (aDate !== bDate) return sort === "amount_asc" ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
    return String(a?.single_line || "").localeCompare(String(b?.single_line || ""));
  });
}

function searchMatchRank(row, query) {
  const norm = plateNormForRow(row);
  if (!norm) return null;
  if (norm === query) return 0;
  if (norm.startsWith(query)) return 1;
  if (norm.includes(query)) return 2;
  return null;
}

function slicePage(rows, page, pageSize) {
  const offset = (page - 1) * pageSize;
  return rows.slice(offset, offset + pageSize);
}

async function loadAllVisibleTotal(env, request) {
  const index = await loadDatasetIndex(env, request.url);
  const allTotal = Number(index?.datasets?.all?.total_rows || 0);
  if (allTotal > 0) return allTotal;
  const overlap = await loadOverlapKeyLookup(env, request);
  let total = 0;
  for (const dataset of CHILD_DATASETS) {
    total += Number(index?.datasets?.[dataset]?.total_rows || 0);
  }
  return Math.max(0, total - Number((overlap?.coarse?.size || 0) + (overlap?.exact?.size || 0)));
}

async function loadStaticIssuesPayload(env, request, dataset) {
  const [manifest, auctionMap, preset] = await Promise.all([
    loadDatasetIssueManifest(env, request.url, dataset),
    loadDatasetAuctionMap(env, request.url, dataset),
    loadDatasetPreset(env, request.url, dataset),
  ]);
  const topAmount = Array.isArray(preset) && preset.length ? Number(preset[0]?.amount_hkd || 0) || null : null;
  const issues = Array.isArray(manifest?.issues) ? manifest.issues : [];
  return {
    dataset,
    total_rows: Number(manifest?.total_rows || 0),
    issue_count: Number(manifest?.issue_count || 0),
    top_amount_hkd: topAmount,
    issues: issues.map((issue) => {
      const auctionMeta = auctionMap.get(issueLookupKey(dataset, issue)) || null;
      return {
        ...(dataset === "all"
          ? {
              auction_key: issue.auction_key == null ? null : String(issue.auction_key),
              dataset_key: issue.dataset_key == null ? null : String(issue.dataset_key),
            }
          : {}),
        auction_date: String(issue.auction_date || ""),
        auction_date_label: issue.auction_date_label == null
          ? (auctionMeta?.auction_date_label == null ? null : String(auctionMeta.auction_date_label))
          : String(issue.auction_date_label),
        date_precision: issue.date_precision == null
          ? (auctionMeta?.date_precision == null ? null : String(auctionMeta.date_precision))
          : String(issue.date_precision),
        year_range: issue.year_range == null
          ? (auctionMeta?.year_range == null ? null : String(auctionMeta.year_range))
          : String(issue.year_range),
        is_lny: issue.is_lny != null ? Boolean(issue.is_lny) : Boolean(auctionMeta?.is_lny),
        pdf_url: issue.pdf_url || auctionMeta?.pdf_url || null,
        total_sale_proceeds_hkd: issue.total_sale_proceeds_hkd == null
          ? (auctionMeta?.total_sale_proceeds_hkd == null ? null : Number(auctionMeta.total_sale_proceeds_hkd))
          : Number(issue.total_sale_proceeds_hkd),
        count: issue.count == null ? null : Number(issue.count),
        file: issue.file == null ? null : String(issue.file),
      };
    }),
  };
}

async function loadStaticIssuePayload(env, request, dataset, issueId) {
  const [manifest, auctionMap] = await Promise.all([
    loadDatasetIssueManifest(env, request.url, dataset),
    loadDatasetAuctionMap(env, request.url, dataset),
  ]);
  const issues = Array.isArray(manifest?.issues) ? manifest.issues : [];
  const issue = issues.find((item) => issueLookupKey(dataset, item) === issueId) || null;
  if (!issue) return null;
  const rows = await loadDatasetIssueRows(
    env,
    request.url,
    dataset,
    issueId,
    String(issue.file || issueShardPath(dataset, issueId))
  );
  const auctionMeta = dataset === "all"
    ? issue
    : (auctionMap.get(issueId) || auctionMap.get(String(issue.auction_date || "")) || issue);
  const mappedRows = rows.map((row) => mapStaticRow(row, dataset, auctionMeta));
  mappedRows.sort((a, b) => {
    const av = a.amount_hkd == null ? -1 : Number(a.amount_hkd);
    const bv = b.amount_hkd == null ? -1 : Number(b.amount_hkd);
    if (av !== bv) return bv - av;
    return String(a.single_line || "").localeCompare(String(b.single_line || ""));
  });
  return {
    dataset,
    issue: {
      ...(dataset === "all"
        ? {
            auction_key: issue.auction_key == null ? null : String(issue.auction_key),
            dataset_key: issue.dataset_key == null ? null : String(issue.dataset_key),
          }
        : {}),
      auction_date: String(issue.auction_date || ""),
      auction_date_label: issue.auction_date_label == null
        ? (auctionMeta?.auction_date_label == null ? null : String(auctionMeta.auction_date_label))
        : String(issue.auction_date_label),
      date_precision: issue.date_precision == null
        ? (auctionMeta?.date_precision == null ? null : String(auctionMeta.date_precision))
        : String(issue.date_precision),
      year_range: issue.year_range == null
        ? (auctionMeta?.year_range == null ? null : String(auctionMeta.year_range))
        : String(issue.year_range),
      is_lny: issue.is_lny != null ? Boolean(issue.is_lny) : Boolean(auctionMeta?.is_lny),
      pdf_url: issue.pdf_url || auctionMeta?.pdf_url || null,
      total_sale_proceeds_hkd: issue.total_sale_proceeds_hkd == null
        ? (auctionMeta?.total_sale_proceeds_hkd == null ? null : Number(auctionMeta.total_sale_proceeds_hkd))
        : Number(issue.total_sale_proceeds_hkd),
    },
    rows: mappedRows,
  };
}

async function loadStaticDatasetResults(env, request, dataset, sort, page, pageSize) {
  const manifest = await loadDatasetIssueManifest(env, request.url, dataset);
  const total = Number(manifest?.total_rows || 0);
  if (sort === "amount_desc" && page <= 5) {
    const [preset, auctionMap] = await Promise.all([
      loadDatasetPreset(env, request.url, dataset),
      loadDatasetAuctionMap(env, request.url, dataset),
    ]);
    return {
      total,
      rows: slicePage(
        preset.map((row) => mapStaticRow(row, dataset, auctionMap.get(String(row?.auction_date || "")) || null)),
        page,
        pageSize,
      ),
    };
  }
  if (sort === "date_desc") {
    return buildPagedDateDescRows(env, request.url, dataset, page, pageSize);
  }
  const [rows, auctionMap] = await Promise.all([
    loadDatasetAllRows(env, request.url, dataset),
    loadDatasetAuctionMap(env, request.url, dataset),
  ]);
  const mapped = rows.map((row) => mapStaticRow(row, dataset, auctionMap.get(String(row?.auction_date || "")) || null));
  const sorted = sortRowsForResults(mapped, sort);
  return { total, rows: slicePage(sorted, page, pageSize) };
}

async function loadStaticAllResults(env, request, sort, page, pageSize) {
  const manifest = await loadDatasetIssueManifest(env, request.url, "all");
  if (sort === "amount_desc" && page <= 5) {
    const rows = await loadDatasetPreset(env, request.url, "all");
    return {
      total: Number(manifest?.total_rows || rows.length),
      rows: slicePage(rows, page, pageSize),
    };
  }
  if (sort === "date_desc") {
    return buildPagedDateDescRows(env, request.url, "all", page, pageSize);
  }
  const rows = await loadDatasetAllRows(env, request.url, "all");
  const mapped = rows.map((row) => mapStaticRow(row, "all", null));
  const sorted = sortRowsForResults(mapped, sort);
  return { total: Number(manifest?.total_rows || sorted.length), rows: slicePage(sorted, page, pageSize) };
}

async function searchStaticDataset(env, request, dataset, query, issue, sort, mode, page, pageSize) {
  const auctionMap = await loadDatasetAuctionMap(env, request.url, dataset);
  const rows = issue
    ? await loadDatasetIssueRows(env, request.url, dataset, issue)
    : (mode === "exact_prefix"
        ? await loadDatasetSlimRows(env, request.url, dataset)
        : await loadDatasetAllRows(env, request.url, dataset));
  const matched = [];
  for (const row of rows) {
    const mapped = mapStaticRow(row, dataset, auctionMap.get(String(row?.auction_date || "")) || null);
    const rank = searchMatchRank(mapped, query);
    if (rank == null) continue;
    if (mode === "exact_prefix" || query.length <= 2) {
      if (rank > 1) continue;
    }
    matched.push(mapped);
  }
  matched.sort((a, b) => compareSearchRows(a, b, sort, query));
  return {
    dataset,
    q: query,
    issue: issue || null,
    mode: mode || null,
    sort,
    page,
    page_size: pageSize,
    total: matched.length,
    rows: slicePage(matched, page, pageSize),
  };
}

async function searchStaticAll(env, request, query, issue, sort, mode, page, pageSize) {
  if (issue) {
    const issuePayload = await loadStaticIssuePayload(env, request, "all", issue);
    if (!issuePayload) {
      return {
        dataset: "all",
        q: query,
        issue,
        mode: mode || null,
        sort,
        page,
        page_size: pageSize,
        total: 0,
        rows: [],
      };
    }
    const matched = [];
    for (const row of issuePayload.rows || []) {
      const rank = searchMatchRank(row, query);
      if (rank == null) continue;
      if (mode === "exact_prefix" || query.length <= 2) {
        if (rank > 1) continue;
      }
      matched.push(row);
    }
    matched.sort((a, b) => compareSearchRows(a, b, sort, query));
    return {
      dataset: "all",
      q: query,
      issue,
      mode: mode || null,
      sort,
      page,
      page_size: pageSize,
      total: matched.length,
      rows: slicePage(matched, page, pageSize),
    };
  }
  const hotPayload = await loadHotSearchCache(env, request, query, page, pageSize, sort);
  if (hotPayload) return hotPayload;
  if (query.length === 1) {
    const prefixPayload = await loadAllPrefix1Rows(env, request, query, sort);
    return {
      dataset: "all",
      q: query,
      issue: null,
      mode: mode || null,
      sort,
      page,
      page_size: pageSize,
      total: Number(prefixPayload.total || 0),
      rows: slicePage(prefixPayload.rows, page, pageSize),
    };
  }
  const rows = await loadDatasetAllRows(env, request.url, "all");
  const matched = [];
  for (const row of rows) {
    const mapped = mapStaticRow(row, "all", null);
    const rank = searchMatchRank(mapped, query);
    if (rank == null) continue;
    if (mode === "exact_prefix" || query.length <= 2) {
      if (rank > 1) continue;
    }
    matched.push(mapped);
  }
  matched.sort((a, b) => compareSearchRows(a, b, sort, query));
  return {
    dataset: "all",
    q: query,
    issue: null,
    mode: mode || null,
    sort,
    page,
    page_size: pageSize,
    total: matched.length,
    rows: slicePage(matched, page, pageSize),
  };
}

async function handleHealth(request, env, ctx) {
  const methodErr = requireGetLike(request);
  if (methodErr) return methodErr;
  return withApiCache(request, ctx, 5, async () => jsonResponse({ ok: true }));
}

async function handleIssues(request, env, ctx) {
  const methodErr = requireGetLike(request);
  if (methodErr) return methodErr;
  const url = new URL(request.url);
  const dataset = String(url.searchParams.get("dataset") || "");
  if (!validDataset(dataset, true)) return badRequest("invalid dataset");
  enforcePublicReadRateLimit(request, `issues:${dataset}`, 180, 2400);
  return withApiCache(request, ctx, 300, async () => jsonResponse(await loadStaticIssuesPayload(env, request, dataset)));
}

async function handleIssue(request, env, ctx) {
  const methodErr = requireGetLike(request);
  if (methodErr) return methodErr;
  const url = new URL(request.url);
  const dataset = String(url.searchParams.get("dataset") || "");
  const issueId = String(url.searchParams.get("auction_date") || "");
  if (!validDataset(dataset, true)) return badRequest("invalid dataset");
  if (!validIssueId(dataset, issueId)) return badRequest("invalid auction_date");
  enforcePublicReadRateLimit(request, `issue:${dataset}`, 240, 3200);
  return withApiCache(request, ctx, 300, async () => {
    const payload = await loadStaticIssuePayload(env, request, dataset, issueId);
    if (!payload) return notFound("issue not found");
    return jsonResponse(payload);
  });
}

async function handleResults(request, env, ctx) {
  const methodErr = requireGetLike(request);
  if (methodErr) return methodErr;
  const url = new URL(request.url);
  const dataset = String(url.searchParams.get("dataset") || "");
  const sort = String(url.searchParams.get("sort") || "date_desc");
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Number(url.searchParams.get("page_size") || 200);
  if (!validDataset(dataset, true)) return badRequest("invalid dataset");
  if (!["amount_desc", "amount_asc", "date_desc", "plate_asc"].includes(sort)) return badRequest("invalid sort");
  if (!Number.isInteger(page) || page < 1) return badRequest("invalid paging");
  enforcePageSize("results", pageSize, 200);
  enforcePublicReadRateLimit(request, `results:${dataset}`, dataset === "all" ? 90 : 180, dataset === "all" ? 900 : 1800);

  return withApiCache(request, ctx, 180, async () => {
    const payload = dataset === "all"
      ? await loadStaticAllResults(env, request, sort, page, pageSize)
      : await loadStaticDatasetResults(env, request, dataset, sort, page, pageSize);
    return jsonResponse({
      dataset,
      sort,
      page,
      page_size: pageSize,
      total: Number(payload.total || 0),
      rows: payload.rows || [],
    });
  });
}

function buildSearchBranch(datasetClause, issueClause, dedupeClause, matchCondition, rank) {
  return `
    SELECT
      r.id,
      r.dataset,
      r.auction_date,
      a.auction_date_label,
      a.is_lny,
      r.single_line,
      r.double_top,
      r.double_bottom,
      r.amount_hkd,
      r.pdf_url,
      ${rank} AS match_rank
    FROM vrm_result r
    LEFT JOIN vrm_auction a
      ON a.dataset = r.dataset
     AND a.auction_date = r.auction_date
    WHERE ${datasetClause}
      ${issueClause}
      AND ${matchCondition}
      ${dedupeClause}
  `;
}

async function handleSearch(request, env, ctx) {
  const methodErr = requireGetLike(request);
  if (methodErr) return methodErr;
  const url = new URL(request.url);
  const dataset = String(url.searchParams.get("dataset") || "");
  const rawQuery = String(url.searchParams.get("q") || "");
  const issue = String(url.searchParams.get("issue") || "");
  const sort = String(url.searchParams.get("sort") || "amount_desc");
  const mode = String(url.searchParams.get("mode") || "");
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Number(url.searchParams.get("page_size") || 200);
  if (!validDataset(dataset, true)) return badRequest("invalid dataset");
  const query = normalizeQuery(rawQuery);
  if (!query) return badRequest("q is required");
  if (query.length > 16) return badRequest("q too long");
  if (!Number.isInteger(page) || page < 1) return badRequest("invalid paging");
  enforcePageSize("search", pageSize, 200);
  enforceSearchWindow(dataset, query, page);
  if (issue && !validIssueId(dataset, issue)) return badRequest("invalid issue");
  if (!["amount_desc", "amount_asc", "date_desc", "plate_asc"].includes(sort)) return badRequest("invalid sort");
  if (!["", "exact_prefix"].includes(mode)) return badRequest("invalid mode");

  let minuteLimit = dataset === "all" ? 180 : 300;
  let hourLimit = dataset === "all" ? 1800 : 3600;
  if (query.length <= 2) {
    minuteLimit = Math.min(minuteLimit, dataset === "all" ? 120 : 220);
    hourLimit = Math.min(hourLimit, dataset === "all" ? 1200 : 2600);
  }
  if (issue) {
    minuteLimit += 60;
    hourLimit += 600;
  }
  enforcePublicReadRateLimit(request, `search:${dataset}`, minuteLimit, hourLimit);

  const cacheTtl = !issue ? (dataset === "all" ? 600 : (query.length <= 2 ? 300 : 0)) : 0;
  return withApiCache(request, ctx, cacheTtl, async () => {
    const payload = dataset === "all"
      ? await searchStaticAll(env, request, query, issue, sort, mode, page, pageSize)
      : await searchStaticDataset(env, request, dataset, query, issue, sort, mode, page, pageSize);
    return jsonResponse(payload);
  });
}

async function handleVisionSession(request, env) {
  const methodErr = requireGetLike(request);
  if (methodErr) return methodErr;
  const originErr = sameOriginError(request);
  if (originErr) return originErr;
  enforceRateLimit(`vision_session:minute:${request.headers.get("cf-connecting-ip") || "unknown"}`, 90, 60);
  enforceRateLimit(`vision_session:hour:${request.headers.get("cf-connecting-ip") || "unknown"}`, 1200, 3600);
  const issued = await issueVisionSessionToken(request, env);
  return jsonResponse({
    token: issued.token,
    expires_at: issued.expires_at,
    expires_in: Math.max(1, issued.expires_at - Math.floor(Date.now() / 1000)),
  }, 200, { "set-cookie": issued.cookie });
}

async function handleOauthToken(request, env) {
  const methodErr = requireMethod(request, "POST");
  if (methodErr) return methodErr;
  if (!getOAuthJwksDocument(env).keys.length || !String(env.OAUTH_JWT_PRIVATE_JWK || "").trim()) {
    return oauthErrorResponse("server_error", 503, "oauth_not_configured");
  }
  const { error: formError, form } = await readTokenForm(request);
  if (formError) return formError;
  const grantType = String(form.get("grant_type") || "");
  if (grantType !== "client_credentials") {
    return oauthErrorResponse("unsupported_grant_type", 400, "Only client_credentials is supported.");
  }

  const basic = parseClientBasicAuth(request);
  const clientId = basic.clientId || String(form.get("client_id") || "").trim();
  const clientSecret = basic.clientSecret || String(form.get("client_secret") || "").trim();
  if (!clientId || !clientSecret) {
    return oauthErrorResponse(
      "invalid_client",
      401,
      "Client authentication is required.",
      { "www-authenticate": 'Basic realm="plate.hk OAuth", charset="UTF-8"' },
    );
  }

  const client = getOAuthClientMap(env).get(clientId);
  if (!client || !timingSafeEqual(client.client_secret, clientSecret)) {
    return oauthErrorResponse(
      "invalid_client",
      401,
      "Client authentication failed.",
      { "www-authenticate": 'Basic realm="plate.hk OAuth", charset="UTF-8"' },
    );
  }

  try {
    const issued = await issueOAuthAccessToken(request, env, client, String(form.get("scope") || ""));
    return jsonResponse(issued);
  } catch (error) {
    if (error instanceof ApiError && error.code === "invalid_scope") {
      return oauthErrorResponse("invalid_scope", 400, "Requested scope is not allowed for this client.");
    }
    throw error;
  }
}

async function handleVisionPlate(request, env) {
  const methodErr = requireMethod(request, "POST");
  if (methodErr) return methodErr;
  const mediaErr = requireJsonContentType(request);
  if (mediaErr) return mediaErr;
  const hasBearerToken = /^bearer\s+/i.test(String(request.headers.get("authorization") || ""));
  if (!hasBearerToken) {
    const originErr = sameOriginError(request);
    if (originErr) return originErr;
    enforceRateLimit(`vision_plate:minute:${request.headers.get("cf-connecting-ip") || "unknown"}`, 45, 60);
    enforceRateLimit(`vision_plate:hour:${request.headers.get("cf-connecting-ip") || "unknown"}`, 600, 3600);
  }

  const { apiKey, baseUrl, timeoutSeconds, visionModel } = getOpenAiConfig(env);
  if (!apiKey || !/^https:\/\//i.test(baseUrl)) return jsonResponse({ error: "vision_not_configured" }, 503);

  const req = await readJsonBody(request);
  const imageDataUrl = String(req.image_data_url || "");
  const lang = String(req.lang || "zh") === "en" ? "en" : "zh";
  const m = imageDataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return badRequest("invalid_image_data_url");
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  if (bytes.length > 5 * 1024 * 1024) return badRequest("image_too_large");
  if (hasBearerToken) {
    const token = await requireOAuthAccessToken(request, env);
    enforceRateLimit(`vision_plate_oauth_client:minute:${String(token.client_id || token.sub || "unknown")}`, 90, 60);
    enforceRateLimit(`vision_plate_oauth_client:hour:${String(token.client_id || token.sub || "unknown")}`, 1200, 3600);
  } else {
    await requireVisionSessionToken(request, env, String(req.vision_token || ""));
  }

  const prompt = lang === "en"
    ? "Read the Hong Kong vehicle registration mark from this cropped plate image. Return JSON only with keys: plate, confidence, raw_text, reasoning_note. Normalize by removing spaces, converting I to 1, O to 0, and dropping Q. If uncertain, still return your best guess and lower confidence."
    : "讀取這張已裁切的香港車牌圖像，只回傳 JSON，鍵為 plate、confidence、raw_text、reasoning_note。正規化規則：移除空格，把 I 轉成 1，把 O 轉成 0，刪除 Q。如不完全確定，也請回傳最佳猜測並降低 confidence。";
  const resp = await httpPostJson(env, `${baseUrl}/responses`, {
    model: visionModel,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: imageDataUrl, detail: "high" },
      ],
    }],
    max_output_tokens: 140,
  }, timeoutSeconds);
  if (resp.status < 200 || resp.status >= 300 || !resp.json) {
    console.error("[vision_plate] upstream_error", resp.status, String(resp.body).slice(0, 800));
    return jsonResponse({ error: "vision_upstream_error" }, 502);
  }
  let outputText = String(resp.json.output_text || "").trim();
  if (!outputText) {
    const chunks = [];
    for (const item of resp.json.output || []) {
      for (const content of item.content || []) {
        if (content.type === "output_text" && content.text) chunks.push(String(content.text));
      }
    }
    outputText = chunks.join("\n").trim();
  }
  if (!outputText) return jsonResponse({ error: "vision_empty_output" }, 502);
  const jsonStart = outputText.indexOf("{");
  const jsonEnd = outputText.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
    outputText = outputText.slice(jsonStart, jsonEnd + 1);
  }
  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    return jsonResponse({ error: "vision_invalid_output" }, 502);
  }
  const plate = normalizeQuery(parsed.plate || "");
  const rawText = normalizeQuery(parsed.raw_text || plate);
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence || 0)));
  const note = String(parsed.reasoning_note || "").slice(0, 160);
  return jsonResponse({
    plate,
    raw_text: rawText,
    confidence,
    note,
    model: visionModel,
  });
}

export async function handleApiRequest(request, env, ctx) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\//, "").replace(/\.php$/, "");
  try {
    if (route.startsWith("v1/") || route === "openapi.yaml") return env.ASSETS.fetch(request);
    if (route === "health") return handleHealth(request, env, ctx);
    if (route === "issues") return handleIssues(request, env, ctx);
    if (route === "issue") return handleIssue(request, env, ctx);
    if (route === "results") return handleResults(request, env, ctx);
    if (route === "search") return handleSearch(request, env, ctx);
    if (route === "oauth/token") return handleOauthToken(request, env, ctx);
    if (route === "vision_session") return handleVisionSession(request, env, ctx);
    if (route === "vision_plate") return handleVisionPlate(request, env, ctx);
    return notFound("not_found");
  } catch (error) {
    return handleApiError(error);
  }
}
