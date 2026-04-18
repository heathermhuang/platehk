window.createPlateIndexIssueFlow = function createPlateIndexIssueFlow({
  t,
  escapeHtml,
  normalizePlate,
  normalizePdfUrl,
  computeIssueTotal,
  datasetLabelForKey,
  issueLabelForDate,
  updateIssueTotal,
  loadDataset,
  applyLanguage,
  applyFilters,
  buildIssueOptions,
  getIssueMeta,
  buildStateSearch,
  updateUrlState,
  clearSearchDebounce,
  resetSearchSession,
  qEl,
  datasetEl,
  issueEl,
  sortEl,
  statusEl,
  issuePanelEl,
  getCurrentDataset,
  getIssueDatesDesc,
  getAuctionsByDate,
  getLoadedIssues,
  getCurrentPage,
  setCurrentPage,
  getPageSize,
}) {
  function currentIssueIndex(selectedIssue) {
    return getIssueDatesDesc().indexOf(selectedIssue);
  }

  function currentIssueSourceHref(selectedIssue) {
    const meta = getAuctionsByDate()[selectedIssue];
    if (!meta) return "";
    return normalizePdfUrl(meta.source_url || meta.pdf_url || "");
  }

  function currentIssueTotalMetricText(selectedIssue) {
    if (!selectedIssue) return "HK$-";
    const meta = getAuctionsByDate()[selectedIssue];
    let amount = meta?.total_sale_proceeds_hkd;
    if (amount == null) {
      const rows = getLoadedIssues().get(selectedIssue) || [];
      amount = computeIssueTotal(rows);
    }
    if (amount == null) return "HK$-";
    return `HK$${Number(amount).toLocaleString("en-HK")}`;
  }

  function issueSummaryText(selectedIssue, totalCount, q = "") {
    if (!selectedIssue) return "";
    const label = issueLabelForDate(selectedIssue);
    if (q) return t("issuePanelSummaryFiltered")(q, Number(totalCount || 0).toLocaleString());
    if (getCurrentDataset() === "tvrm_legacy") return t("issuePanelSummaryLegacy")(label);
    return t("issuePanelSummaryIssue")(label, datasetLabelForKey(getCurrentDataset()));
  }

  function issueViewHref(issueKey = "", datasetKey = getCurrentDataset()) {
    const search = buildStateSearch({ dataset: datasetKey, issue: issueKey || "", q: "", sort: "amount_desc" });
    return search ? `${location.pathname}?${search}` : location.pathname;
  }

  async function copyIssueLink(selectedIssue) {
    const href = new URL(issueViewHref(selectedIssue), location.href).toString();
    try {
      await navigator.clipboard.writeText(href);
      statusEl.textContent = t("issuePanelCopied");
    } catch {
      statusEl.textContent = href;
    }
  }

  function renderIssuePanel({ selectedIssue = "", totalCount = 0, q = normalizePlate(qEl.value) } = {}) {
    if (!selectedIssue || getCurrentDataset() === "all") {
      document.body.classList.remove("issue-mode-active");
      issuePanelEl.hidden = true;
      issuePanelEl.innerHTML = "";
      return;
    }
    document.body.classList.add("issue-mode-active");
    const issueDatesDesc = getIssueDatesDesc();
    const idx = currentIssueIndex(selectedIssue);
    const prevIssue = idx >= 0 && idx + 1 < issueDatesDesc.length ? issueDatesDesc[idx + 1] : "";
    const nextIssue = idx > 0 ? issueDatesDesc[idx - 1] : "";
    const sourceHref = currentIssueSourceHref(selectedIssue);
    const label = issueLabelForDate(selectedIssue);
    const rawIssueCount = Number(getIssueMeta(selectedIssue)?.count || totalCount || 0);
    const issueCount = rawIssueCount.toLocaleString();
    const visibleCount = Number(totalCount || rawIssueCount || 0).toLocaleString();
    const pageLabel = `${getCurrentPage()} / ${Math.max(1, Math.ceil((rawIssueCount || 1) / getPageSize()))}`;
    const currentDataset = getCurrentDataset();
    const badges = [
      currentDataset === "tvrm_legacy" ? t("issuePanelBadgeLegacy") : t("issuePanelBadgeIssue"),
      q ? t("issuePanelBadgeFiltered") : "",
    ].filter(Boolean);
    issuePanelEl.hidden = false;
    issuePanelEl.innerHTML = `
      <div class="issue-panel-head">
        <div>
          <div class="issue-kicker">${escapeHtml(t("issuePanelKicker"))}</div>
          <div class="issue-title">${escapeHtml(label)}</div>
          <div class="issue-subtitle">${escapeHtml(datasetLabelForKey(currentDataset))}</div>
          <div class="issue-summary">${escapeHtml(issueSummaryText(selectedIssue, totalCount, q))}</div>
          <div class="issue-badges">
            ${badges.map((badge) => `<span class="badge">${escapeHtml(badge)}</span>`).join("")}
          </div>
        </div>
        <div class="issue-actions">
          ${sourceHref ? `<a class="issue-link-btn" href="${sourceHref}" target="_blank" rel="noopener">${escapeHtml(t("issuePanelSource"))}</a>` : ""}
          <button class="issue-link-btn" type="button" id="copyIssueLinkBtn">${escapeHtml(t("issuePanelShare"))}</button>
          <a class="issue-link-btn secondary" href="${issueViewHref("", currentDataset)}" id="issueBackLink">${escapeHtml(t("issuePanelBack"))}</a>
        </div>
      </div>
      <div class="issue-metrics">
        <div class="fact"><div class="k">${escapeHtml(t("issuePanelRows"))}</div><div class="v">${escapeHtml(issueCount)}</div></div>
        <div class="fact"><div class="k">${escapeHtml(t("issuePanelVisible"))}</div><div class="v">${escapeHtml(visibleCount)}</div></div>
        <div class="fact"><div class="k">${escapeHtml(t("issuePanelPage"))}</div><div class="v">${escapeHtml(pageLabel)}</div></div>
        <div class="fact"><div class="k">${escapeHtml(t("issuePanelDataset"))}</div><div class="v">${escapeHtml(datasetLabelForKey(currentDataset))}</div></div>
        <div class="fact"><div class="k">${escapeHtml(t("issuePanelTotal"))}</div><div class="v">${escapeHtml(currentIssueTotalMetricText(selectedIssue))}</div></div>
      </div>
      <div class="issue-nav">
        <div class="issue-nav-group">
          ${prevIssue ? `<a class="issue-link-btn secondary" href="${issueViewHref(prevIssue, currentDataset)}" data-issue-nav="${escapeHtml(prevIssue)}">${escapeHtml(t("issuePanelPrev"))}</a>` : ""}
          ${nextIssue ? `<a class="issue-link-btn secondary" href="${issueViewHref(nextIssue, currentDataset)}" data-issue-nav="${escapeHtml(nextIssue)}">${escapeHtml(t("issuePanelNext"))}</a>` : ""}
        </div>
      </div>
    `;
    const copyBtn = document.getElementById("copyIssueLinkBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        copyIssueLink(selectedIssue).catch(() => {});
      });
    }
  }

  function issueTargetForRow(row) {
    const datasetKey = row && row.dataset_key ? row.dataset_key : getCurrentDataset();
    const issueKey = row && row.auction_date ? String(row.auction_date) : "";
    if (!datasetKey || datasetKey === "all" || !issueKey) return null;
    return { datasetKey, issueKey };
  }

  function issueHrefForRow(row) {
    const target = issueTargetForRow(row);
    if (!target) return "#";
    const search = buildStateSearch({
      dataset: target.datasetKey,
      issue: target.issueKey,
      q: "",
    });
    return search ? `${location.pathname}?${search}` : location.pathname;
  }

  async function openIssueByKey(datasetKey, issueKey) {
    if (!datasetKey || !issueKey) return;
    clearSearchDebounce();
    resetSearchSession();
    qEl.value = "";
    setCurrentPage(1);
    statusEl.textContent = t("loading");
    if (getCurrentDataset() !== datasetKey) {
      datasetEl.value = datasetKey;
      await loadDataset(datasetKey);
      applyLanguage();
    } else {
      buildIssueOptions();
    }
    issueEl.value = issueKey;
    updateIssueTotal(issueKey);
    updateUrlState({ dataset: datasetKey, issue: issueKey, q: "" });
    await applyFilters({ resetPage: true });
  }

  async function openIssueFromRow(row) {
    const target = issueTargetForRow(row);
    if (!target) return;
    await openIssueByKey(target.datasetKey, target.issueKey);
  }

  async function switchDataset(datasetKey, { preserveQuery = true } = {}) {
    clearSearchDebounce();
    statusEl.textContent = t("loading");
    resetSearchSession();
    datasetEl.value = datasetKey;
    await loadDataset(datasetKey);
    applyLanguage();
    if (!preserveQuery) qEl.value = "";
    updateUrlState({ dataset: datasetKey, issue: "", q: preserveQuery ? normalizePlate(qEl.value) : "" });
    await applyFilters({ resetPage: true });
  }

  async function clearIssueSelection({ preserveQuery = true } = {}) {
    clearSearchDebounce();
    resetSearchSession();
    if (!preserveQuery) qEl.value = "";
    issueEl.value = "";
    setCurrentPage(1);
    updateIssueTotal("");
    updateUrlState({ issue: "", q: preserveQuery ? normalizePlate(qEl.value) : "" });
    await applyFilters({ resetPage: true });
  }

  return {
    issueSummaryText,
    renderIssuePanel,
    buildStateSearch,
    updateUrlState,
    issueTargetForRow,
    issueHrefForRow,
    openIssueByKey,
    openIssueFromRow,
    switchDataset,
    clearIssueSelection,
  };
};
