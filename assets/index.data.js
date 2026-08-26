window.createPlateIndexDataFlow = function createPlateIndexDataFlow({
  normalizePlate,
  t,
  withTimeout,
  composeAuctionKey,
  buildAuctionsByDateMap,
  render,
  updateIssueTotal,
  applyLanguage,
  buildIssueOptions,
}) {
  function parseDatasetGeneratedAt(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const raw = value.trim();
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (dateOnly) {
      const year = Number(dateOnly[1]);
      const month = Number(dateOnly[2]);
      const day = Number(dateOnly[3]);
      const parsed = new Date(year, month - 1, day);
      return parsed.getFullYear() === year
        && parsed.getMonth() === month - 1
        && parsed.getDate() === day
        ? parsed
        : null;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function cancelActiveFilterRequest() {
    if (!activeFilterRequestController) return;
    try {
      activeFilterRequestController.abort();
    } catch {}
    activeFilterRequestController = null;
  }

  function isAbortError(err) {
    const msg = String(err && err.message ? err.message : err || "").toLowerCase();
    return err?.name === "AbortError" || msg.includes("abort");
  }

  function isExactPlateMatch(row, q) {
    if (!q) return false;
    const s = normalizePlate(row.single_line);
    const d = normalizePlate(row.double_line);
    return s === q || d === q;
  }

  function setSearchProgress(loaded, totalIssues) {
    if (!totalIssues || loaded < 0) {
      searchProgressEl.classList.remove("visible");
      return;
    }
    const pct = Math.max(0, Math.min(100, Math.round((loaded / totalIssues) * 100)));
    searchProgressEl.classList.add("visible");
    searchProgressBarEl.value = pct;
    searchProgressTextEl.textContent = t("searchProgress")(loaded, totalIssues);
  }

  function duplicateKeyForRow(row) {
    const normalized = normalizePlate(row?.single_line || row?.double_line);
    const amount = row?.amount_hkd == null ? null : Number(row.amount_hkd);
    if (row?.date_precision === "day" && row?.auction_date) {
      return JSON.stringify([normalized, amount, String(row.auction_date)]);
    }
    return JSON.stringify([normalized, amount]);
  }

  async function loadAllTvrmLegacyOverlapKeys() {
    if (allTvrmLegacyOverlapKeys) return allTvrmLegacyOverlapKeys;
    if (loadingAllTvrmLegacyOverlapKeys) return loadingAllTvrmLegacyOverlapKeys;
    loadingAllTvrmLegacyOverlapKeys = fetchJsonStrict(`./data/all.tvrm_legacy_overlap.json`, { cache: "force-cache" })
      .then((obj) => {
        allTvrmLegacyOverlapKeys = {
          coarseKeys: new Set(Array.isArray(obj?.keys) ? obj.keys : []),
          exactKeys: new Set(Array.isArray(obj?.exact_keys) ? obj.exact_keys : []),
          rowsToDrop: Number(obj?.rows_to_drop || 0),
        };
        loadingAllTvrmLegacyOverlapKeys = null;
        return allTvrmLegacyOverlapKeys;
      })
      .catch((err) => {
        loadingAllTvrmLegacyOverlapKeys = null;
        throw err;
      });
    return loadingAllTvrmLegacyOverlapKeys;
  }

  function dedupeAllRows(rows, overlapInfo = allTvrmLegacyOverlapKeys) {
    if (!overlapInfo) return rows;
    return (rows || []).filter((row) => {
      if (row?.dataset_key !== "tvrm_legacy") return true;
      const bucket = row?.date_precision === "day" ? overlapInfo.exactKeys : overlapInfo.coarseKeys;
      return !bucket?.has(duplicateKeyForRow(row));
    });
  }

  const API_STATE = { available: false, checked: false, basePath: "" };
  let allDatasetSummaryPromise = null;
  let allAmountDescPresetPromise = null;

  function isFileMode() {
    try {
      return typeof location !== "undefined" && location.protocol === "file:";
    } catch {
      return false;
    }
  }

  async function resolveApiBase() {
    if (!API_STATE.basePath) API_STATE.basePath = "./api";
    return API_STATE.basePath;
  }

  function isOfflineNow() {
    try {
      return typeof navigator !== "undefined" && navigator.onLine === false;
    } catch {
      return false;
    }
  }

  async function detectServerApi() {
    if (API_STATE.checked) return API_STATE.available;
    if (isFileMode()) {
      API_STATE.available = true;
      API_STATE.checked = true;
      return true;
    }
    if (isOfflineNow()) {
      API_STATE.available = false;
      return false;
    }
    API_STATE.checked = true;
    API_STATE.available = true;
    return API_STATE.available;
  }

  async function staticApiJson(endpoint, params, signal) {
    const dataset = params.get("dataset") || currentDataset || "all";
    const base = `./api/v1/${dataset}`;
    const offlineRoot = typeof window !== "undefined" ? window.PLATE_INDEX_OFFLINE_DATA : null;
    const offline = isFileMode()
      ? offlineRoot?.datasets?.[dataset]
      : null;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (endpoint === "issues") {
      if (offline?.manifest) return offline.manifest;
      return await fetchJsonStrict(`${base}/issues.manifest.json`, { cache: "force-cache", signal });
    }

    if (endpoint === "issue") {
      const key = params.get("auction_date") || "";
      if (!key) return { rows: [] };
      if (offline?.presetAmountDesc) {
        const rows = offline.presetAmountDesc.filter((row) => (
          String(row.auction_key || "") === key
          || String(row.auction_date || "") === key
        ));
        return { rows };
      }
      const manifestPayload = await fetchJsonStrict(`${base}/issues.manifest.json`, { cache: "force-cache", signal });
      const meta = (manifestPayload.issues || []).find((issue) => (
        String(issue.auction_key || "") === key
        || String(issue.auction_date || "") === key
      ));
      const file = String(meta?.file || "");
      if (!file) return { rows: [] };
      const rows = await fetchJsonStrict(`${base}/${file}`, { cache: "force-cache", signal });
      return { rows: Array.isArray(rows) ? rows : [] };
    }

    if (endpoint === "results") {
      const sortMode = params.get("sort") || "amount_desc";
      const page = Math.max(1, Number(params.get("page") || 1));
      const requestedPageSize = Math.max(1, Number(params.get("page_size") || pageSize));
      const manifestPayload = offline?.manifest
        || await fetchJsonStrict(`${base}/issues.manifest.json`, { cache: "force-cache", signal });
      let rows = [];
      if (offline?.presetAmountDesc) {
        rows = sortRows(offline.presetAmountDesc, sortMode);
      } else if (sortMode === "amount_desc") {
        rows = await fetchJsonStrict(`${base}/preset.amount_desc.top1000.json`, { cache: "force-cache", signal });
      } else if (dataset !== "all") {
        rows = await fetchJsonStrict(`${base}/results.slim.json`, { cache: "force-cache", signal });
        rows = sortRows(Array.isArray(rows) ? rows : [], sortMode);
      }
      const total = Number(manifestPayload.total_rows || rows.length || 0);
      const start = (page - 1) * requestedPageSize;
      return {
        page,
        page_size: requestedPageSize,
        total,
        rows: (Array.isArray(rows) ? rows : []).slice(start, start + requestedPageSize),
      };
    }

    if (endpoint === "search") {
      const q = normalizePlate(params.get("q") || "");
      const sortMode = params.get("sort") || "amount_desc";
      const page = Math.max(1, Number(params.get("page") || 1));
      const requestedPageSize = Math.max(1, Number(params.get("page_size") || pageSize));
      const manifestPayload = offline?.manifest
        || await fetchJsonStrict(`${base}/issues.manifest.json`, { cache: "force-cache", signal });
      const sourceRows = offline?.presetAmountDesc
        || await fetchJsonStrict(`${base}/preset.amount_desc.top1000.json`, { cache: "force-cache", signal });
      const rows = sortRows((Array.isArray(sourceRows) ? sourceRows : []).filter((row) => {
        if (!q) return true;
        return normalizePlate(row.single_line).includes(q) || normalizePlate(row.double_line).includes(q);
      }), sortMode, q);
      const start = (page - 1) * requestedPageSize;
      return {
        page,
        page_size: requestedPageSize,
        total: rows.length || Number(manifestPayload.total_rows || 0),
        rows: rows.slice(start, start + requestedPageSize),
      };
    }

    throw new Error(`Unsupported static API endpoint: ${endpoint}`);
  }

  async function fetchApiJson(endpoint, params, signal) {
    if (isFileMode()) {
      return await staticApiJson(endpoint, params, signal);
    }
    const apiBase = (await resolveApiBase()) || "./api";
    const resp = await fetch(`${apiBase}/${endpoint}?${params.toString()}`, { cache: "no-store", signal });
    if (!resp.ok) {
      const retryAfter = Number(resp.headers.get("Retry-After") || 0) || 0;
      const contentType = String(resp.headers.get("Content-Type") || "").toLowerCase();
      let errorCode = "";
      let message = "";
      if (contentType.includes("application/json")) {
        const payload = await resp.json().catch(() => null);
        if (payload && typeof payload === "object") {
          errorCode = String(payload.error || "");
          message = String(payload.message || payload.error || "");
        }
      } else {
        message = await resp.text();
      }
      const err = new Error(message || `HTTP ${resp.status}`);
      err.status = resp.status;
      err.code = errorCode;
      err.retryAfter = retryAfter;
      throw err;
    }
    return await resp.json();
  }

  async function loadAllDatasetSummary() {
    if (allDatasetSummaryPromise) return allDatasetSummaryPromise;
    allDatasetSummaryPromise = fetchJsonStrict("./api/v1/index.json", { cache: "force-cache" })
      .then((payload) => {
        const datasets = payload?.datasets || {};
        if (datasets.all) {
          return {
            totalRows: Number(datasets.all.total_rows || 0),
            issueCount: Number(datasets.all.issue_count || 0),
          };
        }
        const childKeys = Array.isArray(DATASETS.all?.children) ? DATASETS.all.children : [];
        let totalRows = 0;
        let issueCount = 0;
        for (const key of childKeys) {
          const meta = datasets[key] || {};
          totalRows += Number(meta.total_rows || 0);
          issueCount += Number(meta.issue_count || 0);
        }
        return { totalRows, issueCount };
      })
      .catch((err) => {
        allDatasetSummaryPromise = null;
        throw err;
      });
    return allDatasetSummaryPromise;
  }

  async function loadAllAmountDescPresetRows() {
    if (allAmountDescPresetPromise) return allAmountDescPresetPromise;
    allAmountDescPresetPromise = fetchJsonStrict("./data/all.preset.amount_desc.top1000.json", { cache: "force-cache" })
      .then((rows) => (Array.isArray(rows) ? rows : []))
      .catch((err) => {
        allAmountDescPresetPromise = null;
        throw err;
      });
    return allAmountDescPresetPromise;
  }

  function readableApiError(err) {
    if ((err?.status === 429 || err?.code === "rate_limited")) {
      return t("apiRateLimited")(Number(err?.retryAfter || 0) || 0);
    }
    if (err?.code === "invalid_paging") {
      return t("apiInvalidPaging");
    }
    return err?.message || String(err);
  }

  async function apiSearch({ dataset, q, issue, sortMode, page, pageSize, signal }) {
    const params = new URLSearchParams();
    params.set("dataset", dataset);
    params.set("q", q);
    if (issue) params.set("issue", issue);
    params.set("sort", sortMode);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    return await fetchApiJson("search", params, signal);
  }

  async function apiResults({ dataset, sortMode, page, pageSize, signal }) {
    const params = new URLSearchParams();
    params.set("dataset", dataset);
    params.set("sort", sortMode);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    return await fetchApiJson("results", params, signal);
  }

  function sortRows(rows, sortMode, q = "") {
    return rows.slice().sort((a, b) => {
      const aPlate = String(a?.single_line ?? "");
      const bPlate = String(b?.single_line ?? "");
      if (q) {
        const aExact = isExactPlateMatch(a, q);
        const bExact = isExactPlateMatch(b, q);
        if (aExact !== bExact) return aExact ? -1 : 1;
      }
      if (sortMode === "amount_desc" || sortMode === "amount_asc") {
        const av0 = a?.amount_hkd == null ? -1 : Number(a.amount_hkd);
        const bv0 = b?.amount_hkd == null ? -1 : Number(b.amount_hkd);
        const av = Number.isFinite(av0) ? av0 : -1;
        const bv = Number.isFinite(bv0) ? bv0 : -1;
        if (av !== bv) return sortMode === "amount_desc" ? bv - av : av - bv;
      }
      if (sortMode === "plate_asc") {
        return aPlate.localeCompare(bPlate);
      }
      const aDate = String(a?.auction_date ?? "");
      const bDate = String(b?.auction_date ?? "");
      if (aDate !== bDate) {
        return aDate < bDate ? 1 : -1;
      }
      return aPlate.localeCompare(bPlate);
    });
  }

  async function apiAllResultsMerged({ sortMode, page, pageSize, signal }) {
    return apiResults({
      dataset: "all",
      sortMode,
      page,
      pageSize,
      signal,
    });
  }

  async function apiIssues(dataset) {
    const params = new URLSearchParams();
    params.set("dataset", dataset);
    return await fetchApiJson("issues", params);
  }

  async function apiIssue(dataset, auctionDate, signal) {
    const params = new URLSearchParams();
    params.set("dataset", dataset);
    params.set("auction_date", auctionDate);
    return await fetchApiJson("issue", params, signal);
  }

  function getLoadedRowsCount() {
    let count = 0;
    for (const rows of loadedIssues.values()) count += rows.length;
    return count;
  }

  async function loadIssue(dateIso) {
    if (!dateIso) return [];
    if (failedIssues.has(dateIso)) return [];
    if (loadedIssues.has(dateIso)) return loadedIssues.get(dateIso);
    if (loadingIssues.has(dateIso)) {
      const pending = loadingIssues.get(dateIso);
      try {
        return await withTimeout(pending, 12000, "issue load timeout");
      } catch {
        failedIssues.add(dateIso);
        loadingIssues.delete(dateIso);
        loadedIssues.set(dateIso, []);
        return [];
      }
    }

    const p = withTimeout(apiIssue(currentDataset, dateIso), 12000, "issue api timeout")
      .then((payload) => {
        const rows = Array.isArray(payload?.rows) ? payload.rows : [];
        const taggedRows = rows.map((row) => ({
          ...row,
          dataset_key: row.dataset_key || currentDataset,
          auction_key:
            row.auction_key
            || (
              currentDataset === "all"
                ? composeAuctionKey(row.dataset_key || currentDataset, row.auction_date)
                : row.auction_date
            ),
        }));
        loadedIssues.set(dateIso, taggedRows);
        loadingIssues.delete(dateIso);
        return taggedRows;
      })
      .catch(() => {
        loadingIssues.delete(dateIso);
        failedIssues.add(dateIso);
        loadedIssues.set(dateIso, []);
        return [];
      });
    loadingIssues.set(dateIso, p);
    return p;
  }

  async function ensureLoadedForAllPage(pageNo) {
    const need = pageNo * pageSize;
    if (getLoadedRowsCount() >= need) return;
    for (const dateIso of issueDatesDesc) {
      if (getLoadedRowsCount() >= need) break;
      await loadIssue(dateIso);
    }
  }

  function preloadNextPageShard() {
    const q = normalizePlate(qEl.value);
    const selectedIssue = issueEl.value || "";
    const sortMode = sortEl.value;
    if (selectedIssue) return;
    if (q) return;
    if (sortMode !== "date_desc") return;
    ensureLoadedForAllPage(currentPage + 1).catch(() => {});
  }

  async function ensureAllIssuesLoaded(version, progressFn) {
    let scanned = 0;
    for (const dateIso of issueDatesDesc) {
      await loadIssue(dateIso);
      scanned += 1;
      if (progressFn) progressFn(scanned, issueDatesDesc.length);
      if (version !== renderVersion) return false;
    }
    return true;
  }

  async function applyFilters({ resetPage = true } = {}) {
    const version = ++renderVersion;
    const q = normalizePlate(qEl.value);
    const selectedIssue = issueEl.value || "";
    const sortMode = sortEl.value;
    cancelActiveFilterRequest();
    const requestController = new AbortController();
    activeFilterRequestController = requestController;
    if (!q || selectedIssue) cancelActiveSearchWorker();
    setSearchProgress(-1, 0);
    if (resetPage) currentPage = 1;

    const serverApiOk = await detectServerApi();
    if (!serverApiOk) {
      const offlineMsg = isOfflineNow() ? t("apiSearchOfflineFallback") : t("apiSearchUnavailable");
      statusEl.textContent = offlineMsg;
      bottomPrevEl.textContent = t("prevPage");
      bottomNextEl.textContent = t("nextPage");
      bottomPrevEl.disabled = true;
      bottomNextEl.disabled = true;
      bottomInfoEl.textContent = t("bottomAll")(1, 1);
      updateIssueTotal(selectedIssue || "");
      render([], 0, offlineMsg);
      return;
    }

    statusEl.textContent = t("loading");

    try {
      if (q) {
        const res = await apiSearch({
          dataset: currentDataset,
          q,
          issue: selectedIssue || "",
          sortMode,
          page: currentPage,
          pageSize,
          signal: requestController.signal,
        });
        if (version !== renderVersion) return;

        const total = Number(res.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (currentPage > totalPages && total > 0) {
          currentPage = totalPages;
          if (activeFilterRequestController === requestController) activeFilterRequestController = null;
          await applyFilters({ resetPage: false });
          return;
        }

        bottomPrevEl.textContent = t("prevPage");
        bottomNextEl.textContent = t("nextPage");
        bottomPrevEl.disabled = currentPage <= 1;
        bottomNextEl.disabled = currentPage >= totalPages;
        bottomInfoEl.textContent = t("bottomAll")(currentPage, totalPages);
        updateIssueTotal(selectedIssue || "");
        render(
          sortRows(res.rows || [], sortMode, q),
          total,
          selectedIssue ? t("modeIssue")(total.toLocaleString(), currentPage, totalPages) : t("modeAll")(currentPage, totalPages)
        );
        statusEl.textContent = t("statusFmt")(
          Number(manifest.total_rows || 0).toLocaleString(),
          total.toLocaleString(),
          ""
        );
        rememberSearchQuery(q);
        if (activeFilterRequestController === requestController) activeFilterRequestController = null;
        return;
      }

      if (!selectedIssue) {
        const res =
          currentDataset === "all"
            ? await apiAllResultsMerged({
                sortMode,
                page: currentPage,
                pageSize,
                signal: requestController.signal,
              })
            : await apiResults({
                dataset: currentDataset,
                sortMode,
                page: currentPage,
                pageSize,
                signal: requestController.signal,
              });
        if (version !== renderVersion) return;

        const total = Number(res.total || manifest.total_rows || 0);
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (currentPage > totalPages && total > 0) {
          currentPage = totalPages;
          if (activeFilterRequestController === requestController) activeFilterRequestController = null;
          await applyFilters({ resetPage: false });
          return;
        }

        bottomPrevEl.textContent = t("prevPage");
        bottomNextEl.textContent = t("nextPage");
        bottomPrevEl.disabled = currentPage <= 1;
        bottomNextEl.disabled = currentPage >= totalPages;
        bottomInfoEl.textContent = t("bottomAll")(currentPage, totalPages);
        updateIssueTotal("");
        render(res.rows || [], total, t("modeAll")(currentPage, totalPages));
        if (activeFilterRequestController === requestController) activeFilterRequestController = null;
        return;
      }

      await loadIssue(selectedIssue);
      if (version !== renderVersion) return;
      let out = loadedIssues.get(selectedIssue) || [];
      out = sortRows(out, sortMode, q);
      const totalCount = out.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      if (currentPage > totalPages) currentPage = totalPages;
      const start = (currentPage - 1) * pageSize;
      const pageRows = out.slice(start, start + pageSize);
      bottomPrevEl.textContent = t("prevPage");
      bottomNextEl.textContent = t("nextPage");
      bottomPrevEl.disabled = currentPage <= 1;
      bottomNextEl.disabled = currentPage >= totalPages;
      bottomInfoEl.textContent = t("bottomAll")(currentPage, totalPages);
      updateIssueTotal(selectedIssue);
      render(pageRows, totalCount, t("modeIssue")(totalCount.toLocaleString(), currentPage, totalPages));
      if (activeFilterRequestController === requestController) activeFilterRequestController = null;
    } catch (err) {
      if (activeFilterRequestController === requestController) activeFilterRequestController = null;
      if (isAbortError(err)) return;
      if (version !== renderVersion) return;
      bottomPrevEl.textContent = t("prevPage");
      bottomNextEl.textContent = t("nextPage");
      bottomPrevEl.disabled = true;
      bottomNextEl.disabled = true;
      bottomInfoEl.textContent = t("bottomAll")(1, 1);
      updateIssueTotal(selectedIssue || "");
      render([], 0, t("loadFailed")(readableApiError(err)));
    }
  }

  async function loadDataset(datasetKey) {
    currentDataset = datasetKey in DATASETS ? datasetKey : "all";
    localStorage.setItem("dataset", currentDataset);

    manifest = { generated_at: null, total_rows: 0, issue_count: 0, issues: [], top_amount_hkd: null };
    lastUpdatedDate = null;
    auctionsByDate = {};
    loadedIssues.clear();
    loadingIssues.clear();
    failedIssues.clear();
    presetAmountDescRows = [];
    issueDatesDesc = [];
    currentPage = 1;
    issueEl.value = "";
    issueTotalEl.textContent = "";

    if (currentDataset === "tvrm_legacy" && !allTvrmLegacyOverlapKeys) {
      try {
        await loadAllTvrmLegacyOverlapKeys();
      } catch {}
    }

    const payload = await apiIssues(currentDataset);
    lastUpdatedDate = parseDatasetGeneratedAt(payload.generated_at);
    manifest = {
      generated_at: lastUpdatedDate ? payload.generated_at.trim() : null,
      total_rows: Number(payload.total_rows || 0),
      issue_count: Number(payload.issue_count || 0),
      issues: Array.isArray(payload.issues) ? payload.issues : [],
      top_amount_hkd: payload.top_amount_hkd == null ? null : Number(payload.top_amount_hkd),
    };
    auctionsByDate = buildAuctionsByDateMap(payload.issues || []);
  }

  return {
    cancelActiveFilterRequest,
    loadIssue,
    applyFilters,
    loadDataset,
    preloadNextPageShard,
    ensureAllIssuesLoaded,
  };
};
