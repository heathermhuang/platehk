window.createPlateIndexHomeViews = function createPlateIndexHomeViews(deps) {
  const {
    escapeHtml,
    t,
    datasetLabelForKey,
    issueLabelForDate,
    normalizePlate,
    DATASETS,
    datasetGuideEl,
    issueGuideEl,
    homeShelfEl,
    introEl,
    resultsContextEl,
    resultsTableWrapEl,
    resultsTableEl,
    qEl,
    issueEl,
    getCurrentDataset,
    getCurrentLang,
    getManifest,
    getIssueDatesDesc,
    getRenderedTotalCount,
  } = deps;

  function renderFactCards(facts) {
    const items = (facts || []).filter((x) => x && x.v != null && x.v !== "");
    if (!items.length) return "";
    return `
      <div class="about-facts">
        ${items
          .map(
            (item) => `
              <div class="fact">
                <div class="k">${escapeHtml(item.k)}</div>
                <div class="v">${escapeHtml(item.v)}</div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function datasetFactCards() {
    const currentDataset = getCurrentDataset();
    const manifest = getManifest();
    const facts = [];
    if (currentDataset === "all") {
      facts.push({ k: t("factVisibleRows"), v: Number(manifest.total_rows || 0).toLocaleString() });
      facts.push({ k: t("factDatasets"), v: String((DATASETS.all?.children || []).length) });
      return facts;
    }
    if (currentDataset === "tvrm_legacy") {
      facts.push({ k: t("factVisibleRows"), v: Number(manifest.total_rows || 0).toLocaleString() });
      facts.push({ k: t("factIssueRanges"), v: Number(manifest.issue_count || 0).toLocaleString() });
      const top = manifest.top_amount_hkd != null
        ? `HK$${Number(manifest.top_amount_hkd).toLocaleString("en-HK")}`
        : "";
      facts.push({ k: t("factTopPrice"), v: top });
      return facts;
    }
    if (currentDataset === "tvrm_physical" || currentDataset === "tvrm_eauction" || currentDataset === "pvrm") {
      facts.push({ k: t("factVisibleRows"), v: Number(manifest.total_rows || 0).toLocaleString() });
      facts.push({ k: t("factIssueRanges"), v: Number(manifest.issue_count || 0).toLocaleString() });
      const top = manifest.top_amount_hkd != null
        ? `HK$${Number(manifest.top_amount_hkd).toLocaleString("en-HK")}`
        : "";
      facts.push({ k: t("factTopPrice"), v: top });
    }
    return facts;
  }

  function datasetDescriptionForKey(key) {
    if (key === "all") return t("datasetDescAll");
    if (key === "tvrm_physical") return t("datasetDescTvrmPhysical");
    if (key === "tvrm_eauction") return t("datasetDescTvrmEauction");
    if (key === "tvrm_legacy") return t("datasetDescTvrmLegacy");
    return t("datasetDescPvrm");
  }

  function renderDatasetSwitcher() {
    const currentDataset = getCurrentDataset();
    const keys = ["all", "pvrm", "tvrm_physical", "tvrm_eauction", "tvrm_legacy"];
    return `
      <div class="dataset-switcher">
        <div class="dataset-switcher-head">
          <div class="dataset-switcher-title">${escapeHtml(t("datasetSwitchTitle"))}</div>
          <div class="dataset-switcher-note">${escapeHtml(t("datasetSwitchNote"))}</div>
        </div>
        <div class="dataset-switcher-grid">
          ${keys
            .map((key) => {
              const active = key === currentDataset;
              return `
                <button
                  class="dataset-switcher-card${active ? " active" : ""}"
                  type="button"
                  data-dataset-switch="${escapeHtml(key)}"
                  aria-pressed="${active ? "true" : "false"}"
                >
                  <div class="dataset-switcher-name">${escapeHtml(datasetLabelForKey(key))}</div>
                  <div class="dataset-switcher-desc">${escapeHtml(datasetDescriptionForKey(key))}</div>
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  function renderHomeCardCollapsible(cardId, title, note, bodyHtml) {
    const chevronSvg = `
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12 15.6 5.6 9.2l1.4-1.4 5 5 5-5 1.4 1.4z"></path>
      </svg>
    `;
    return `
      <details class="home-card-collapsible" data-card-id="${escapeHtml(cardId)}" open>
        <summary>
          <span class="about-sum">
            <span class="t home-card-title">${escapeHtml(title)}</span>
            <span class="s home-card-note">${escapeHtml(note)}</span>
          </span>
          <span class="about-chevron" aria-hidden="true">${chevronSvg}</span>
        </summary>
        <div class="home-card-body">${bodyHtml}</div>
      </details>
    `;
  }

  function renderDatasetGuideCard() {
    return renderHomeCardCollapsible(
      "dataset-guide",
      t("datasetGuideTitle"),
      t("datasetGuideNote"),
      `${renderFactCards(datasetFactCards())}${renderDatasetSwitcher()}`
    );
  }

  function renderIssueGuideCard() {
    const currentDataset = getCurrentDataset();
    const manifest = getManifest();
    const issueDatesDesc = getIssueDatesDesc();
    const latestIssue = issueDatesDesc[0] || "";
    const currentIssue = issueEl.value || "";
    if (currentDataset === "all") {
      return `
        <div class="home-card-head">
          <div class="home-card-title">${escapeHtml(t("issueGuideTitle"))}</div>
          <div class="home-card-note">${escapeHtml(t("issueGuideNoteAll"))}</div>
        </div>
        <div class="issue-entry-empty">${escapeHtml(t("issueGuideNoteAll"))}</div>
      `;
    }
    const latestLabel = latestIssue ? issueLabelForDate(latestIssue) : "-";
    const currentLabel = currentIssue ? issueLabelForDate(currentIssue) : t("issueGuideCurrentNone");
    return `
      <div class="home-card-head">
        <div class="home-card-title">${escapeHtml(t("issueGuideTitle"))}</div>
        <div class="home-card-note">${escapeHtml(t("issueGuideNoteDataset"))}</div>
      </div>
      <div class="issue-entry-lede">${escapeHtml(t("issueGuideNoteDataset"))}</div>
      <div class="issue-entry-stats">
        <div class="fact"><div class="k">${escapeHtml(t("issueGuideLatest"))}</div><div class="v">${escapeHtml(latestLabel)}</div></div>
        <div class="fact"><div class="k">${escapeHtml(t("issueGuideCurrent"))}</div><div class="v">${escapeHtml(currentLabel)}</div></div>
        <div class="fact"><div class="k">${escapeHtml(t("issueGuideTotalIssues"))}</div><div class="v">${escapeHtml(Number(manifest.issue_count || 0).toLocaleString())}</div></div>
      </div>
      <div class="issue-entry-actions">
        ${latestIssue ? `<button class="issue-entry-btn" type="button" data-open-issue="${escapeHtml(latestIssue)}">${escapeHtml(t("issueGuideOpenLatest"))}</button>` : ""}
        ${currentIssue ? `<button class="issue-entry-btn secondary" type="button" data-open-issue="${escapeHtml(currentIssue)}">${escapeHtml(t("issueGuideOpenCurrent"))}</button>` : ""}
        <button class="issue-entry-btn secondary" type="button" data-clear-issue="1">${escapeHtml(t("issueGuideBrowseAll"))}</button>
      </div>
    `;
  }

  function renderAllLinksCard() {
    const currentLang = getCurrentLang();
    const links = currentLang === "zh"
      ? [
          { text: t("allLinksPvrm"), href: "https://www.td.gov.hk/tc/public_services/vehicle_registration_mark/pvrm_auction/index.html" },
          { text: t("allLinksTvrm"), href: "https://www.td.gov.hk/tc/public_services/vehicle_registration_mark/tvrm_auction/index.html" },
          { text: t("allLinksEauction"), href: "https://e-auction.td.gov.hk/" },
          { text: t("allLinksHistory"), href: "https://www.td.gov.hk/en/about_us/history_of_transport_department/licensing_services/auction_of_vehicle_registration_marks__/index.html" },
        ]
      : [
          { text: t("allLinksPvrm"), href: "https://www.td.gov.hk/en/public_services/vehicle_registration_mark/pvrm_auction/index.html" },
          { text: t("allLinksTvrm"), href: "https://www.td.gov.hk/en/public_services/vehicle_registration_mark/tvrm_auction/index.html" },
          { text: t("allLinksEauction"), href: "https://e-auction.td.gov.hk/" },
          { text: t("allLinksHistory"), href: "https://www.td.gov.hk/en/about_us/history_of_transport_department/licensing_services/auction_of_vehicle_registration_marks__/index.html" },
        ];
    return renderHomeCardCollapsible(
      "all-links",
      t("allLinksTitle"),
      t("allLinksNote"),
      `
        <div class="about-links">
          <div class="link-card">
            <div>
              ${links
                .map((it) => `<a href="${it.href}" target="_blank" rel="noopener">${escapeHtml(it.text)}</a>`)
                .join("")}
            </div>
          </div>
        </div>
      `
    );
  }

  function syncHomeCardCollapseState() {
    const shouldCollapse = window.matchMedia("(max-width: 700px)").matches;
    for (const root of [datasetGuideEl, issueGuideEl]) {
      const details = root.querySelector(".home-card-collapsible");
      if (!details) continue;
      details.open = !shouldCollapse;
    }
  }

  function renderHomeCards() {
    const currentDataset = getCurrentDataset();
    datasetGuideEl.innerHTML = renderDatasetGuideCard();
    if (currentDataset === "all") {
      issueGuideEl.innerHTML = renderAllLinksCard();
      issueGuideEl.hidden = false;
      syncHomeCardCollapseState();
      return;
    }
    issueGuideEl.innerHTML = renderIssueGuideCard();
    issueGuideEl.hidden = false;
    syncHomeCardCollapseState();
  }

  function syncFocusModeChrome() {
    const currentDataset = getCurrentDataset();
    const q = normalizePlate(qEl.value);
    const selectedIssue = issueEl.value || "";
    const showTopChrome = !q && !selectedIssue;
    document.body.classList.toggle("search-focus-mode", !showTopChrome);
    homeShelfEl.hidden = !showTopChrome;
    issueGuideEl.hidden = !showTopChrome;
    introEl.hidden = currentDataset === "all" || !showTopChrome;
  }

  function renderResultsContext(totalCount = getRenderedTotalCount()) {
    const currentDataset = getCurrentDataset();
    const q = normalizePlate(qEl.value);
    const selectedIssue = issueEl.value || "";
    const countText = Number(totalCount || 0).toLocaleString();
    let kicker = "";
    let title = "";
    let subtitle = "";
    const chips = [];

    if (selectedIssue) {
      const label = issueLabelForDate(selectedIssue);
      kicker = t("resultsKickerIssue");
      title = t("resultsTitleIssue")(label);
      subtitle = t("resultsSubtitleIssue")(label, countText);
      chips.push(`${t("resultsChipIssue")}: ${label}`);
      if (q) chips.push(`${t("resultsChipQuery")}: ${q}`);
      chips.push(`${t("resultsChipRows")}: ${countText}`);
    } else if (currentDataset === "all") {
      kicker = t("resultsKickerAll");
      title = t("resultsTitleAll");
      subtitle = q ? t("resultsSubtitleAllQuery")(q, countText) : t("resultsSubtitleAllEmpty");
      if (q) chips.push(`${t("resultsChipQuery")}: ${q}`);
      if (q) chips.push(`${t("resultsChipRows")}: ${countText}`);
    } else {
      const datasetLabel = datasetLabelForKey(currentDataset);
      kicker = t("resultsKickerDataset");
      title = t("resultsTitleDataset")(datasetLabel);
      subtitle = t("resultsSubtitleDataset")(datasetLabel, countText);
      if (q) chips.push(`${t("resultsChipQuery")}: ${q}`);
      chips.push(`${t("resultsChipRows")}: ${countText}`);
    }

    resultsContextEl.hidden = false;
    resultsContextEl.innerHTML = `
      <div class="results-context-main">
        <div class="results-context-kicker">${escapeHtml(kicker)}</div>
        <div class="results-context-title">${escapeHtml(title)}</div>
        <div class="results-context-subtitle">${escapeHtml(subtitle)}</div>
      </div>
      <div class="results-context-side">
        ${chips.map((chip) => `<span class="results-chip">${escapeHtml(chip)}</span>`).join("")}
      </div>
    `;
  }

  function resultsTableMode() {
    const currentDataset = getCurrentDataset();
    const selectedIssue = issueEl.value || "";
    if (selectedIssue && currentDataset !== "all") return "issue";
    if (currentDataset !== "all") return "dataset";
    return "all";
  }

  function visibleResultsColumnCount() {
    const mode = resultsTableMode();
    if (mode === "issue") return 4;
    if (mode === "dataset") return 5;
    return 6;
  }

  function syncResultsTableMode() {
    const mode = resultsTableMode();
    resultsTableWrapEl.classList.remove("mode-all", "mode-dataset", "mode-issue");
    resultsTableWrapEl.classList.add(`mode-${mode}`);
    resultsTableEl.setAttribute("data-mode", mode);
  }

  function emptyResultsMessage() {
    const currentDataset = getCurrentDataset();
    const q = normalizePlate(qEl.value);
    const selectedIssue = issueEl.value || "";
    if (selectedIssue) {
      const label = issueLabelForDate(selectedIssue);
      return {
        main: q ? t("emptyStateQueryIssue")(label, q) : t("emptyStateIssue")(label),
        sub: q ? t("emptyStateHintSearch") : t("emptyStateHintBrowse"),
      };
    }
    if (currentDataset === "all") {
      return {
        main: q ? t("emptyStateQueryAll")(q) : t("emptyStateAll"),
        sub: q ? t("emptyStateHintSearch") : t("emptyStateHintBrowse"),
      };
    }
    const datasetLabel = datasetLabelForKey(currentDataset);
    return {
      main: q ? t("emptyStateQueryDataset")(datasetLabel, q) : t("emptyStateDataset")(datasetLabel),
      sub: q ? t("emptyStateHintSearch") : t("emptyStateHintBrowse"),
    };
  }

  return {
    renderHomeCards,
    syncFocusModeChrome,
    renderResultsContext,
    resultsTableMode,
    visibleResultsColumnCount,
    syncResultsTableMode,
    emptyResultsMessage,
  };
};
