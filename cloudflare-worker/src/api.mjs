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
  getOpenAiConfig,
  getStaticJson,
  handleApiError,
  issueVisionSessionToken,
  jsonResponse,
  loadDatasetAllRows,
  loadDatasetAuctionMap,
  loadDatasetAuctions,
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
  requireGetLike,
  requireJsonContentType,
  requireMethod,
  requireVisionSessionToken,
  sameOriginError,
  validDataset,
  withApiCache,
  httpPostJson,
} from "./lib.mjs";

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
  const [index, overlap] = await Promise.all([
    loadDatasetIndex(env, request.url),
    loadOverlapKeyLookup(env, request),
  ]);
  let total = 0;
  for (const dataset of CHILD_DATASETS) {
    total += Number(index?.datasets?.[dataset]?.total_rows || 0);
  }
  return Math.max(0, total - Number((overlap?.coarse?.size || 0) + (overlap?.exact?.size || 0)));
}

async function loadStaticIssuesPayload(env, request, dataset) {
  const [manifest, auctions, preset] = await Promise.all([
    loadDatasetIssueManifest(env, request.url, dataset),
    loadDatasetAuctions(env, request.url, dataset),
    loadDatasetPreset(env, request.url, dataset),
  ]);
  const topAmount = Array.isArray(preset) && preset.length ? Number(preset[0]?.amount_hkd || 0) || null : null;
  return {
    dataset,
    total_rows: Number(manifest?.total_rows || 0),
    issue_count: Number(manifest?.issue_count || 0),
    top_amount_hkd: topAmount,
    issues: auctions.map((row) => ({
      auction_date: String(row.auction_date || ""),
      auction_date_label: row.auction_date_label == null ? null : String(row.auction_date_label),
      date_precision: row.date_precision == null ? null : String(row.date_precision),
      year_range: row.year_range == null ? null : String(row.year_range),
      is_lny: Boolean(row.is_lny),
      pdf_url: row.pdf_url || null,
      total_sale_proceeds_hkd: row.total_sale_proceeds_hkd == null ? null : Number(row.total_sale_proceeds_hkd),
    })),
  };
}

async function loadStaticIssuePayload(env, request, dataset, auctionDate) {
  const [auctionMap, rows] = await Promise.all([
    loadDatasetAuctionMap(env, request.url, dataset),
    loadDatasetIssueRows(env, request.url, dataset, auctionDate),
  ]);
  const issue = auctionMap.get(auctionDate);
  if (!issue) return null;
  const mappedRows = rows.map((row) => mapStaticRow(row, dataset, issue));
  mappedRows.sort((a, b) => {
    const av = a.amount_hkd == null ? -1 : Number(a.amount_hkd);
    const bv = b.amount_hkd == null ? -1 : Number(b.amount_hkd);
    if (av !== bv) return bv - av;
    return String(a.single_line || "").localeCompare(String(b.single_line || ""));
  });
  return {
    dataset,
    issue: {
      auction_date: String(issue.auction_date || ""),
      auction_date_label: issue.auction_date_label == null ? null : String(issue.auction_date_label),
      date_precision: issue.date_precision == null ? null : String(issue.date_precision),
      year_range: issue.year_range == null ? null : String(issue.year_range),
      is_lny: Boolean(issue.is_lny),
      pdf_url: issue.pdf_url || null,
      total_sale_proceeds_hkd: issue.total_sale_proceeds_hkd == null ? null : Number(issue.total_sale_proceeds_hkd),
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
  if (sort === "amount_desc" && page <= 5) {
    const [rows, total] = await Promise.all([
      getStaticJson(env, request.url, "./data/all.preset.amount_desc.top1000.json"),
      loadAllVisibleTotal(env, request),
    ]);
    const deduped = await dedupeAllIndexRows(env, request, Array.isArray(rows) ? rows : []);
    return { total, rows: slicePage(deduped, page, pageSize) };
  }
  let merged = [];
  if (sort === "date_desc") {
    const datasets = await Promise.all(CHILD_DATASETS.map((dataset) => loadStaticDatasetResults(env, request, dataset, sort, 1, 999999)));
    merged = datasets.flatMap((payload) => payload.rows || []);
  } else {
    const datasets = await Promise.all(CHILD_DATASETS.map(async (dataset) => {
      const [rows, auctionMap] = await Promise.all([
        loadDatasetAllRows(env, request.url, dataset),
        loadDatasetAuctionMap(env, request.url, dataset),
      ]);
      return rows.map((row) => mapStaticRow(row, dataset, auctionMap.get(String(row?.auction_date || "")) || null));
    }));
    merged = datasets.flat();
  }
  const deduped = await dedupeAllIndexRows(env, request, merged);
  const sorted = sortRowsForResults(deduped, sort);
  return { total: await loadAllVisibleTotal(env, request), rows: slicePage(sorted, page, pageSize) };
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

async function searchStaticAll(env, request, query, sort, mode, page, pageSize) {
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
  const payloads = await Promise.all(CHILD_DATASETS.map((dataset) => searchStaticDataset(env, request, dataset, query, "", sort, mode, 1, 999999)));
  const merged = payloads.flatMap((payload) => payload.rows || []);
  const deduped = await dedupeAllIndexRows(env, request, merged);
  deduped.sort((a, b) => compareSearchRows(a, b, sort, query));
  return {
    dataset: "all",
    q: query,
    issue: null,
    mode: mode || null,
    sort,
    page,
    page_size: pageSize,
    total: deduped.length,
    rows: slicePage(deduped, page, pageSize),
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
  if (!validDataset(dataset)) return badRequest("invalid dataset");
  enforcePublicReadRateLimit(request, `issues:${dataset}`, 180, 2400);
  return withApiCache(request, ctx, 300, async () => jsonResponse(await loadStaticIssuesPayload(env, request, dataset)));
}

async function handleIssue(request, env, ctx) {
  const methodErr = requireGetLike(request);
  if (methodErr) return methodErr;
  const url = new URL(request.url);
  const dataset = String(url.searchParams.get("dataset") || "");
  const auctionDate = String(url.searchParams.get("auction_date") || "");
  if (!validDataset(dataset)) return badRequest("invalid dataset");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(auctionDate)) return badRequest("invalid auction_date");
  enforcePublicReadRateLimit(request, `issue:${dataset}`, 240, 3200);
  return withApiCache(request, ctx, 300, async () => {
    const payload = await loadStaticIssuePayload(env, request, dataset, auctionDate);
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
  if (issue && !/^\d{4}-\d{2}-\d{2}$/.test(issue)) return badRequest("invalid issue");
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
      ? await searchStaticAll(env, request, query, sort, mode, page, pageSize)
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

async function handleVisionPlate(request, env) {
  const methodErr = requireMethod(request, "POST");
  if (methodErr) return methodErr;
  const mediaErr = requireJsonContentType(request);
  if (mediaErr) return mediaErr;
  const originErr = sameOriginError(request);
  if (originErr) return originErr;
  enforceRateLimit(`vision_plate:minute:${request.headers.get("cf-connecting-ip") || "unknown"}`, 45, 60);
  enforceRateLimit(`vision_plate:hour:${request.headers.get("cf-connecting-ip") || "unknown"}`, 600, 3600);

  const { apiKey, baseUrl, timeoutSeconds, visionModel } = getOpenAiConfig(env);
  if (!apiKey || !/^https:\/\//i.test(baseUrl)) return jsonResponse({ error: "vision_not_configured" }, 503);

  const req = await readJsonBody(request);
  const imageDataUrl = String(req.image_data_url || "");
  const lang = String(req.lang || "zh") === "en" ? "en" : "zh";
  const m = imageDataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return badRequest("invalid_image_data_url");
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  if (bytes.length > 5 * 1024 * 1024) return badRequest("image_too_large");
  await requireVisionSessionToken(request, env, String(req.vision_token || ""));

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
    if (route === "vision_session") return handleVisionSession(request, env, ctx);
    if (route === "vision_plate") return handleVisionPlate(request, env, ctx);
    return notFound("not_found");
  } catch (error) {
    return handleApiError(error);
  }
}
