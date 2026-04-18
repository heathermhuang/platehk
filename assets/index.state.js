window.createPlateIndexStateFlow = function createPlateIndexStateFlow({
  normalizePlate,
  t,
  qEl,
  datasetEl,
  issueEl,
  sortEl,
  langZhEl,
  langEnEl,
  resetEl,
  searchHistoryEl,
  getCurrentLang,
  setCurrentLang,
  getCurrentDataset,
  cancelActiveFilterRequest,
  resetSearchSession,
  setCurrentPage,
  onError,
}) {
  let searchDebounceTimer = null;

  function clearSearchDebounce() {
    if (!searchDebounceTimer) return;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }

  function normalizeLiveQueryValue(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/I/g, "1")
      .replace(/O/g, "0")
      .replace(/Q/g, "");
  }

  function buildStateSearch({ dataset, issue, q, sort, lang } = {}) {
    const params = new URLSearchParams();
    const nextLang = lang || getCurrentLang();
    const nextDataset = dataset || getCurrentDataset() || "all";
    const nextIssue = issue != null ? issue : (issueEl.value || "");
    const nextQuery = q != null ? normalizePlate(q) : normalizePlate(qEl.value);
    const nextSort = sort || sortEl.value || "amount_desc";
    if (nextLang === "zh" || nextLang === "en") params.set("lang", nextLang);
    if (nextDataset && nextDataset !== "all") params.set("d", nextDataset);
    if (nextIssue && nextDataset !== "all") params.set("issue", nextIssue);
    if (nextQuery) params.set("q", nextQuery);
    if (nextSort && nextSort !== "amount_desc") params.set("sort", nextSort);
    return params.toString();
  }

  function updateUrlState(nextState = {}) {
    const search = buildStateSearch(nextState);
    const next = search ? `${location.pathname}?${search}` : location.pathname;
    history.replaceState({}, "", next);
  }

  function parseInitialState() {
    const params = new URLSearchParams(location.search);
    const lang = params.get("lang");
    const dataset = params.get("d") || "all";
    const issue = params.get("issue") || "";
    const q = normalizePlate(params.get("q") || "");
    const sort = params.get("sort") || "amount_desc";
    return {
      lang: lang === "en" || lang === "zh" ? lang : "",
      dataset,
      issue,
      q,
      sort: ["date_desc", "amount_desc", "amount_asc", "plate_asc"].includes(sort) ? sort : "amount_desc",
    };
  }

  function runFilterRefresh(applyFilters, { resetPage = true, nextUrlState = null } = {}) {
    clearSearchDebounce();
    cancelActiveFilterRequest();
    resetSearchSession();
    if (nextUrlState) updateUrlState(nextUrlState);
    else updateUrlState();
    return applyFilters({ resetPage }).catch((err) => {
      onError(err);
    });
  }

  function bindControlEvents({
    applyFilters,
    switchDataset,
    applyLanguage,
    clearSearchHistory,
    renderSearchAssist,
    getRenderedTotalCount,
  }) {
    searchHistoryEl.addEventListener("click", (ev) => {
      const clearBtn = ev.target.closest("[data-history-clear]");
      if (clearBtn) {
        ev.preventDefault();
        clearSearchHistory();
        renderSearchAssist({
          totalCount: getRenderedTotalCount(),
          selectedIssue: issueEl.value || "",
          q: normalizePlate(qEl.value),
        });
        return;
      }
      const historyBtn = ev.target.closest("[data-history-query]");
      if (!historyBtn) return;
      ev.preventDefault();
      qEl.value = historyBtn.getAttribute("data-history-query") || "";
      runFilterRefresh(applyFilters, { resetPage: true });
    });

    qEl.addEventListener("input", () => {
      const normalized = normalizeLiveQueryValue(qEl.value);
      if (normalized !== qEl.value) qEl.value = normalized;
      clearSearchDebounce();
      cancelActiveFilterRequest();
      searchDebounceTimer = setTimeout(() => {
        searchDebounceTimer = null;
        resetSearchSession();
        updateUrlState();
        applyFilters({ resetPage: true }).catch((err) => {
          onError(err);
        });
      }, 250);
    });

    issueEl.addEventListener("change", () => {
      runFilterRefresh(applyFilters, { resetPage: true });
    });

    sortEl.addEventListener("change", () => {
      runFilterRefresh(applyFilters, { resetPage: true });
    });

    datasetEl.addEventListener("change", () => {
      clearSearchDebounce();
      cancelActiveFilterRequest();
      switchDataset(datasetEl.value).catch((err) => {
        onError(err);
      });
    });

    function setLang(newLang, updateUrl = true) {
      if (newLang !== "en" && newLang !== "zh") return;
      if (getCurrentLang() === newLang) return;
      setCurrentLang(newLang);
      applyLanguage();
      applyFilters({ resetPage: false }).catch((err) => {
        onError(err);
      });
      if (updateUrl) {
        updateUrlState({ lang: newLang });
      }
    }

    langZhEl.addEventListener("click", () => setLang("zh"));
    langEnEl.addEventListener("click", () => setLang("en"));

    resetEl.addEventListener("click", () => {
      clearSearchDebounce();
      cancelActiveFilterRequest();
      qEl.value = "";
      issueEl.value = "";
      sortEl.value = "amount_desc";
      setCurrentPage(1);
      resetSearchSession();
      updateUrlState({ q: "", issue: "", sort: "amount_desc" });
      applyFilters({ resetPage: true }).catch((err) => {
        onError(err);
      });
    });
  }

  return {
    clearSearchDebounce,
    buildStateSearch,
    updateUrlState,
    parseInitialState,
    bindControlEvents,
  };
};
