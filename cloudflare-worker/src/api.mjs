import {
  ApiError,
  apiJsonResponse,
  badRequest,
  buildPagedDateDescRows,
  buildPagedSortedRows,
  compareSearchRows,
  enforcePageSize,
  enforcePublicReadRateLimit,
  enforceRateLimit,
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

async function loadAllPrefix1Rows(env, request, query, page, pageSize, sort) {
  const decoded = await getStaticJson(env, request.url, "./data/all.prefix1.top200.json");
  const bucket = decoded?.[query];
  if (!bucket || !Array.isArray(bucket.rows)) return null;
  const cachedRows = bucket.rows.length;
  const total = Number(bucket.total || cachedRows);
  const offset = (page - 1) * pageSize;
  if (offset >= cachedRows && total > cachedRows) return null;
  const rows = await dedupeAllIndexRows(env, request, bucket.rows);
  rows.sort((a, b) => compareSearchRows(a, b, sort, query));
  return { total, rows };
}

function rowsFromIndexPayload(decoded) {
  if (Array.isArray(decoded)) {
    return {
      total: decoded.length,
      cachedRows: decoded.length,
      rows: decoded,
    };
  }
  if (!decoded || typeof decoded !== "object" || !Array.isArray(decoded.rows)) {
    return null;
  }
  return {
    total: Number(decoded.total || decoded.rows.length),
    cachedRows: Number(decoded.cached_rows || decoded.rows.length),
    rows: decoded.rows,
  };
}

function inflateCompleteSearchIndexRow(compact, meta) {
  if (!Array.isArray(compact) || compact.length < 5) return null;
  const rowMeta = Array.isArray(meta?.row_metadata?.[compact[0]])
    ? meta.row_metadata[compact[0]]
    : null;
  const resultState = Array.isArray(meta?.result_states?.[compact[4]])
    ? meta.result_states[compact[4]]
    : [null, null];
  if (!rowMeta) return null;
  return {
    dataset_key: rowMeta[0] == null ? "" : String(rowMeta[0]),
    auction_key: rowMeta[1] == null ? "" : String(rowMeta[1]),
    auction_date: rowMeta[2] == null ? "" : String(rowMeta[2]),
    auction_date_label: rowMeta[3] == null ? null : String(rowMeta[3]),
    date_precision: rowMeta[4] == null ? null : String(rowMeta[4]),
    year_range: rowMeta[5] == null ? null : String(rowMeta[5]),
    is_lny: Boolean(rowMeta[6]),
    single_line: compact[1] || null,
    double_line: Array.isArray(compact[2]) ? compact[2] : null,
    amount_hkd: compact[3] == null ? null : Number(compact[3]),
    pdf_url: rowMeta[7] || null,
    source_url: rowMeta[8] || null,
    source_format: rowMeta[9] || null,
    source_type: rowMeta[10] || null,
    source_sheet: rowMeta[11] || null,
    result_status: resultState[0] || null,
    result_text: resultState[1] || null,
  };
}

async function loadCompleteSearchIndexRows(env, request, query) {
  const base = "./api/v1/all/search-index";
  const meta = await getStaticJson(env, request.url, `${base}/meta.json`);
  if (!meta || meta.schema_version !== 1) return null;

  let path = "";
  if (query.length === 1) {
    const charCount = Number(meta?.char_counts?.[query] || 0);
    if (!charCount) return [];
    path = `${base}/char1/${encodeURIComponent(query)}.json`;
  } else {
    const tokens = [...new Set(Array.from(
      { length: query.length - 1 },
      (_, idx) => query.slice(idx, idx + 2),
    ))];
    const available = tokens
      .map((token) => [token, Number(meta?.bigram_counts?.[token] || 0)])
      .filter(([, count]) => count > 0)
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    if (available.length !== tokens.length) return [];
    path = `${base}/bigram/${encodeURIComponent(available[0][0])}.json`;
  }

  // The asset layer already caches these shards. Keeping every decoded shard
  // in isolate memory would let diverse searches grow the process without a
  // bound, so only the small shared metadata table stays in the JS cache.
  const payload = await getStaticJson(env, request.url, path, { cache: false });
  if (!payload || !Array.isArray(payload.rows)) return null;
  return payload.rows
    .map((row) => inflateCompleteSearchIndexRow(row, meta))
    .filter(Boolean);
}

async function searchCompleteIndex(env, request, dataset, query, sort, mode, page, pageSize) {
  const indexedRows = await loadCompleteSearchIndexRows(env, request, query);
  if (indexedRows == null) return null;
  const datasetRows = dataset === "all"
    ? await dedupeAllIndexRows(env, request, indexedRows)
    : indexedRows.filter((row) => row.dataset_key === dataset);
  const matched = sortSearchMatches(collectSearchMatches(datasetRows, query, mode), sort, query);
  return buildPagedSearchPayload(dataset, query, null, mode, sort, page, pageSize, matched);
}

async function loadAllPrefix2Rows(env, request, query, page, pageSize, sort) {
  if (sort !== "amount_desc") return null;
  const decoded = rowsFromIndexPayload(
    await getStaticJson(env, request.url, `./data/all.prefix2/${encodeURIComponent(query)}.json`)
  );
  if (!decoded) return null;
  const offset = (page - 1) * pageSize;
  if (offset >= decoded.cachedRows && decoded.total > decoded.cachedRows) return null;
  const rows = await dedupeAllIndexRows(env, request, decoded.rows);
  rows.sort((a, b) => compareSearchRows(a, b, sort, query));
  return { total: decoded.total, rows };
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

function isLocalDevelopmentRequest(request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function rowMatchesSearch(row, query, mode) {
  const rank = searchMatchRank(row, query);
  if (rank == null) return false;
  if (mode === "exact_prefix") {
    return rank <= 1;
  }
  return true;
}

function collectSearchMatches(rows, query, mode, mapRow = (row) => row) {
  const matched = [];
  for (const row of rows || []) {
    const mapped = mapRow(row);
    if (rowMatchesSearch(mapped, query, mode)) matched.push(mapped);
  }
  return matched;
}

function sortSearchMatches(rows, sort, query) {
  rows.sort((a, b) => compareSearchRows(a, b, sort, query));
  return rows;
}

function buildSearchPayload(dataset, query, issue, mode, sort, page, pageSize, total, rows) {
  return {
    dataset,
    q: query,
    issue: issue || null,
    mode: mode || null,
    sort,
    page,
    page_size: pageSize,
    total,
    rows,
  };
}

function buildPagedSearchPayload(dataset, query, issue, mode, sort, page, pageSize, rows, total = rows.length) {
  return buildSearchPayload(dataset, query, issue, mode, sort, page, pageSize, total, slicePage(rows, page, pageSize));
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
  const [manifest, auctionMap, preset, index] = await Promise.all([
    loadDatasetIssueManifest(env, request.url, dataset),
    loadDatasetAuctionMap(env, request.url, dataset),
    loadDatasetPreset(env, request.url, dataset),
    loadDatasetIndex(env, request.url),
  ]);
  const topAmount = Array.isArray(preset) && preset.length ? Number(preset[0]?.amount_hkd || 0) || null : null;
  const issues = Array.isArray(manifest?.issues) ? manifest.issues : [];
  return {
    dataset,
    generated_at: manifest?.generated_at || index?.generated_at || null,
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
  try {
    return await buildPagedSortedRows(env, request.url, dataset, sort, page, pageSize);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "results_index_unavailable" || !isLocalDevelopmentRequest(request)) {
      throw error;
    }
    const [rows, auctionMap] = await Promise.all([
      loadDatasetAllRows(env, request.url, dataset),
      loadDatasetAuctionMap(env, request.url, dataset),
    ]);
    const mapped = rows.map((row) => mapStaticRow(row, dataset, auctionMap.get(String(row?.auction_date || "")) || null));
    return { total, rows: slicePage(sortRowsForResults(mapped, sort), page, pageSize) };
  }
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
  try {
    return await buildPagedSortedRows(env, request.url, "all", sort, page, pageSize);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "results_index_unavailable" || !isLocalDevelopmentRequest(request)) {
      throw error;
    }
    const rows = await loadDatasetAllRows(env, request.url, "all");
    const mapped = rows.map((row) => mapStaticRow(row, "all", null));
    return {
      total: Number(manifest?.total_rows || mapped.length),
      rows: slicePage(sortRowsForResults(mapped, sort), page, pageSize),
    };
  }
}

async function searchStaticDataset(env, request, dataset, query, issue, sort, mode, page, pageSize) {
  if (!issue) {
    const indexedPayload = await searchCompleteIndex(env, request, dataset, query, sort, mode, page, pageSize);
    if (indexedPayload) return indexedPayload;
    if (!isLocalDevelopmentRequest(request)) throw new ApiError("search_index_unavailable", 503);
  }
  const auctionMap = await loadDatasetAuctionMap(env, request.url, dataset);
  const rows = issue
    ? await loadDatasetIssueRows(env, request.url, dataset, issue)
    : (mode === "exact_prefix"
        ? await loadDatasetSlimRows(env, request.url, dataset)
        : await loadDatasetAllRows(env, request.url, dataset));
  const matched = sortSearchMatches(
    collectSearchMatches(
      rows,
      query,
      mode,
      (row) => mapStaticRow(row, dataset, auctionMap.get(String(row?.auction_date || "")) || null),
    ),
    sort,
    query,
  );
  return buildPagedSearchPayload(dataset, query, issue, mode, sort, page, pageSize, matched);
}

async function searchStaticAll(env, request, query, issue, sort, mode, page, pageSize) {
  if (issue) {
    const issuePayload = await loadStaticIssuePayload(env, request, "all", issue);
    if (!issuePayload) return buildPagedSearchPayload("all", query, issue, mode, sort, page, pageSize, [], 0);
    const matched = sortSearchMatches(collectSearchMatches(issuePayload.rows, query, mode), sort, query);
    return buildPagedSearchPayload("all", query, issue, mode, sort, page, pageSize, matched);
  }
  const indexedPayload = await searchCompleteIndex(env, request, "all", query, sort, mode, page, pageSize);
  if (indexedPayload) return indexedPayload;
  if (!isLocalDevelopmentRequest(request)) throw new ApiError("search_index_unavailable", 503);
  const hotPayload = await loadHotSearchCache(env, request, query, page, pageSize, sort);
  if (hotPayload) return hotPayload;
  if (query.length === 1 && sort === "amount_desc") {
    const prefixPayload = await loadAllPrefix1Rows(env, request, query, page, pageSize, sort);
    if (prefixPayload) {
      return buildPagedSearchPayload(
        "all",
        query,
        null,
        mode,
        sort,
        page,
        pageSize,
        prefixPayload.rows,
        Number(prefixPayload.total || 0),
      );
    }
  }
  if (query.length === 2) {
    const prefix2Payload = await loadAllPrefix2Rows(env, request, query, page, pageSize, sort);
    if (prefix2Payload) {
      return buildPagedSearchPayload(
        "all",
        query,
        null,
        mode,
        sort,
        page,
        pageSize,
        prefix2Payload.rows,
        Number(prefix2Payload.total || 0),
      );
    }
  }
  const rows = await loadDatasetAllRows(env, request.url, "all");
  const matched = sortSearchMatches(
    collectSearchMatches(rows, query, mode, (row) => mapStaticRow(row, "all", null)),
    sort,
    query,
  );
  return buildPagedSearchPayload("all", query, null, mode, sort, page, pageSize, matched);
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

const MARKET_SIGNAL_DIR = "./_market/28car";

function marketCacheUrl(request, shard) {
  return new URL(`/_market-cache/${shard}`, request.url).toString();
}

async function loadMarketSignalShard(request, env, shard) {
  if (!/^[A-Z0-9]$/.test(shard)) return null;
  const payload = await getStaticJson(env, marketCacheUrl(request, shard), `${MARKET_SIGNAL_DIR}/${shard}.json`);
  if (!payload || payload.schema_version !== 1 || payload.source !== "28car") {
    return null;
  }
  return payload;
}

function activeMarketOffers(payload, plate) {
  if (!payload) return [];
  const freshHours = Math.max(1, Math.min(168, Number(payload.fresh_for_hours || 72)));
  const cutoff = Date.now() - freshHours * 60 * 60 * 1000;
  const candidates = Array.isArray(payload?.signals?.[plate]) ? payload.signals[plate] : [];
  return candidates.filter((offer) => {
    if (!offer || typeof offer !== "object") return false;
    if (!/^n\d+$/.test(String(offer.listing_id || ""))) return false;
    if (!/^https:\/\/m\.28car\.com\/num_dsp\.php\?/i.test(String(offer.source_url || ""))) return false;
    const lastSeen = Date.parse(String(offer.last_seen_at || ""));
    return Number.isFinite(lastSeen) && lastSeen >= cutoff;
  });
}

async function loadActiveMarketOffers(request, env, plate) {
  const shard = /^[A-Z0-9]/.test(plate) ? plate[0] : "";
  if (!shard) return { payload: null, offers: [] };
  const payload = await loadMarketSignalShard(request, env, shard);
  const offers = activeMarketOffers(payload, plate);
  return { payload, offers };
}

function introductionServiceBaseUrl(env) {
  try {
    const url = new URL(String(env.INTRODUCTION_SERVICE_URL || ""));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function introductionWhatsAppNumber(env) {
  const value = String(env.INTRODUCTION_WHATSAPP_NUMBER || "").replace(/\D/g, "");
  return /^\d{8,15}$/.test(value) ? value : "";
}

function publicMarketSignal(plate, payload, offers, env) {
  const introductionNumber = introductionWhatsAppNumber(env);
  const introductionEnabled = Boolean(introductionServiceBaseUrl(env) && introductionNumber);
  if (!payload || !offers.length) {
    return {
      plate,
      availability_detected: false,
      inquiry_enabled: true,
      introduction_enabled: introductionEnabled,
      ...(introductionEnabled ? { introduction_whatsapp_number: introductionNumber } : {}),
    };
  }
  const prices = [...new Set(offers
    .map((offer) => Number(offer.asking_price_hkd))
    .filter((amount) => Number.isSafeInteger(amount) && amount > 0))]
    .sort((a, b) => a - b);
  const primary = offers.find((offer) => Number(offer.asking_price_hkd) === prices[0]) || offers[0];
  const freshHours = Math.max(1, Math.min(168, Number(payload.fresh_for_hours || 72)));
  const observedAt = String(primary.last_seen_at || payload.scraped_at || "");
  const observedMs = Date.parse(observedAt);
  return {
    plate,
    availability_detected: true,
    source: "28car",
    offer_count: offers.length,
    asking_prices_hkd: prices.slice(0, 8),
    has_contact_price: offers.some((offer) => offer.price_type === "contact"),
    observed_at: observedAt,
    fresh_until: Number.isFinite(observedMs)
      ? new Date(observedMs + freshHours * 60 * 60 * 1000).toISOString()
      : null,
    listing_id: String(primary.listing_id),
    source_url: String(primary.source_url),
    source_attribution: "28car",
    inquiry_enabled: true,
    introduction_enabled: introductionEnabled,
    ...(introductionEnabled ? { introduction_whatsapp_number: introductionNumber } : {}),
  };
}

async function handleMarketSignal(request, env) {
  const methodErr = requireGetLike(request);
  if (methodErr) return methodErr;
  const url = new URL(request.url);
  const rawBatch = url.searchParams.get("plates");
  if (rawBatch !== null) {
    const originErr = sameOriginError(request);
    if (originErr) return originErr;
    const requested = rawBatch.split(",");
    if (!requested.length || requested.length > 200) return badRequest("plates must contain 1 to 200 exact plates");
    const plates = [];
    const seen = new Set();
    for (const rawPlate of requested) {
      const plate = normalizeQuery(rawPlate);
      if (!plate) return badRequest("plates contains an empty plate");
      if (plate.length > 16) return badRequest("plate too long");
      if (seen.has(plate)) continue;
      seen.add(plate);
      plates.push(plate);
    }
    enforcePublicReadRateLimit(request, "market-signal-batch", 30, 300);
    const shards = [...new Set(plates.map((plate) => plate[0]))];
    const shardEntries = await Promise.all(shards.map(async (shard) => [
      shard,
      await loadMarketSignalShard(request, env, shard),
    ]));
    const payloads = new Map(shardEntries);
    const signals = plates
      .map((plate) => {
        const payload = payloads.get(plate[0]) || null;
        return publicMarketSignal(plate, payload, activeMarketOffers(payload, plate), env);
      })
      .filter((signal) => signal.availability_detected);
    return jsonResponse({ plates_requested: plates.length, signals });
  }
  const plate = normalizeQuery(url.searchParams.get("plate") || "");
  if (!plate) return badRequest("plate is required");
  if (plate.length > 16) return badRequest("plate too long");
  enforcePublicReadRateLimit(request, "market-signal", 90, 600);
  const { payload, offers } = await loadActiveMarketOffers(request, env, plate);
  return jsonResponse(publicMarketSignal(plate, payload, offers, env));
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

const MAINLAND_PLATE_PROVINCE_CHARS = "京津沪滬渝冀豫云雲辽遼黑湘皖鲁魯新苏蘇浙赣贛鄂桂甘晋晉蒙陕陝吉闽閩贵貴粤粵青藏川宁寧琼瓊";

function visionPlateTypeFromModel(value) {
  const type = String(value || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (type === "macau" || type === "macao") return "macau";
  if (type === "mainland" || type === "mainland_china" || type === "china" || type === "prc") return "mainland_china";
  if (type === "not_hk" || type === "non_hk" || type === "not_hong_kong" || type === "unknown") return "not_hk";
  if (type === "hong_kong" || type === "hk") return "hong_kong";
  return "";
}

function visionBooleanOrNull(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").toLowerCase().trim();
  if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
  if (normalized === "false" || normalized === "no" || normalized === "0") return false;
  return null;
}

function visionContainsMainlandPlateSignal(value) {
  const text = String(value || "").toUpperCase().replace(/[\s.\-·–—]+/gu, "");
  const provinceRe = new RegExp(`[${MAINLAND_PLATE_PROVINCE_CHARS}][A-Z][A-Z0-9]{4,6}[港澳]?`, "u");
  const suffixRe = /[港澳]$/u;
  const provinceOnlyRe = new RegExp(`[${MAINLAND_PLATE_PROVINCE_CHARS}]`, "u");
  return provinceRe.test(text) || (suffixRe.test(text) && provinceOnlyRe.test(text));
}

function visionContainsMacauPlateSignal(value) {
  const text = String(value || "").toUpperCase();
  if (/(?:^|[^A-Z0-9])M[A-Z]?\s*[-·–—]\s*\d{2}\s*[-·–—]\s*\d{2}(?:[^A-Z0-9]|$)/u.test(text)) return true;
  const hasMacauContext = /MACAU|MACAO|澳門|澳门/u.test(text);
  return hasMacauContext && /(?:^|[^A-Z0-9])M[A-Z]?\s*\d{4}(?:[^A-Z0-9]|$)/u.test(text);
}

function visionNonHongKongPlateType(plateText, rawText, note, modelType, isHongKongPlate) {
  const type = visionPlateTypeFromModel(modelType);
  if (type === "macau" || type === "mainland_china") return type;
  const plateNorm = normalizeQuery(plateText);
  const rawNorm = normalizeQuery(rawText);
  if (visionContainsMainlandPlateSignal(plateText)) return "mainland_china";
  if (visionContainsMacauPlateSignal(plateText)) return "macau";
  const scanRawForForeign = !plateNorm || plateNorm === rawNorm || isHongKongPlate === false;
  const rawContext = `${rawText || ""} ${note || ""}`;
  if (scanRawForForeign && visionContainsMainlandPlateSignal(rawContext)) return "mainland_china";
  if (scanRawForForeign && visionContainsMacauPlateSignal(rawContext)) return "macau";
  if (isHongKongPlate === false) return "not_hk";
  return "";
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
    ? "Read the Hong Kong vehicle registration mark from this cropped plate image. If multiple plates are visible, choose the Hong Kong plate only and ignore Macau plates such as M-12-34 or MA-12-34 and Mainland China plates such as 粤Z1234港, 粵Z1234澳, or province-character plates. Return JSON only with keys: plate, confidence, raw_text, reasoning_note, plate_type, is_hong_kong_plate. Hong Kong registration marks do not use the letters I, O, or Q. Normalize HK marks by removing spaces, converting I to 1, converting O to 0, and dropping Q. Example: visible text like IRIS LAM should normalize as 1R1SLAM. If no Hong Kong plate is visible, return an empty plate, confidence 0, plate_type macau/mainland_china/not_hk, and is_hong_kong_plate false."
    : "讀取這張已裁切的香港車牌圖像；如同時出現多個車牌，只選香港車牌，並忽略澳門車牌（例如 M-12-34 或 MA-12-34）及內地車牌（例如 粤Z1234港、粵Z1234澳 或省份漢字開頭的車牌）。只回傳 JSON，鍵為 plate、confidence、raw_text、reasoning_note、plate_type、is_hong_kong_plate。香港車牌不使用英文字母 I、O、Q。香港車牌正規化規則：移除空格，把 I 轉成 1，把 O 轉成 0，刪除 Q。例如畫面像 IRIS LAM 時，plate 應正規化為 1R1SLAM。如畫面沒有香港車牌，plate 請回傳空字串、confidence 為 0、plate_type 為 macau/mainland_china/not_hk，並把 is_hong_kong_plate 設為 false。";
  const resp = await httpPostJson(env, `${baseUrl}/responses`, {
    model: visionModel,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: imageDataUrl, detail: "high" },
      ],
    }],
    max_output_tokens: 190,
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
  const rawPlateText = String(parsed.plate || "");
  const rawTextOriginal = String(parsed.raw_text || rawPlateText);
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence || 0)));
  const note = String(parsed.reasoning_note || "").slice(0, 160);
  const plateType = visionPlateTypeFromModel(parsed.plate_type || "");
  const isHongKongPlate = visionBooleanOrNull(parsed.is_hong_kong_plate);
  const ignoredPlateType = visionNonHongKongPlateType(rawPlateText, rawTextOriginal, note, plateType, isHongKongPlate);
  if (ignoredPlateType) {
    return jsonResponse({
      plate: "",
      raw_text: normalizeQuery(rawTextOriginal),
      confidence: 0,
      note: note || ignoredPlateType,
      model: visionModel,
      plate_type: ignoredPlateType,
      is_hong_kong_plate: false,
      ignored_plate_type: ignoredPlateType,
    });
  }
  const plate = normalizeQuery(rawPlateText);
  const rawText = normalizeQuery(rawTextOriginal);
  return jsonResponse({
    plate,
    raw_text: rawText,
    confidence,
    note,
    model: visionModel,
    plate_type: plateType || (plate ? "hong_kong" : "unknown"),
    is_hong_kong_plate: Boolean(plate) && plateType !== "not_hk",
  });
}

export async function handleApiRequest(request, env, ctx) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\//, "");
  try {
    if (route.startsWith("v1/") || route === "openapi.yaml") return await env.ASSETS.fetch(request);
    if (route === "health") return await handleHealth(request, env, ctx);
    if (route === "issues") return await handleIssues(request, env, ctx);
    if (route === "issue") return await handleIssue(request, env, ctx);
    if (route === "results") return await handleResults(request, env, ctx);
    if (route === "search") return await handleSearch(request, env, ctx);
    if (route === "market_signal") return await handleMarketSignal(request, env, ctx);
    if (route === "oauth/token") return await handleOauthToken(request, env, ctx);
    if (route === "vision_session") return await handleVisionSession(request, env, ctx);
    if (route === "vision_plate") return await handleVisionPlate(request, env, ctx);
    return notFound("not_found");
  } catch (error) {
    return handleApiError(error);
  }
}
