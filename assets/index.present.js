window.createPlateIndexPresenters = function createPlateIndexPresenters({
  t,
  escapeHtml,
  auctionMetaKeyForRow,
  isLnyMeta,
  resolveDisplayDateLabel,
  datasetLabelForKey,
  issueLabelForDate,
  issueHrefForRow,
  normalizePdfUrl,
  computeIssueTotal,
  loadIssue,
  renderIssuePanel,
  renderSearchHistory,
  searchNoteEl,
  searchAssistEl,
  issueTotalEl,
  getCurrentLang,
  getCurrentDataset,
  getAuctionsByDate,
  getLoadedIssues,
  getRenderedTotalCount,
  getIssueTotalToken,
  bumpIssueTotalToken,
}) {
  function formatLastUpdated(dateObj) {
    if (!dateObj || Number.isNaN(dateObj.getTime())) return "";
    if (getCurrentLang() === "zh") {
      return `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
    }
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${dateObj.getDate()} ${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  }

  function formatPrice(row) {
    if (row.amount_hkd === null || row.amount_hkd === undefined) {
      return `<span class="price na">${t("unresolved")}</span>`;
    }
    const amount = `HK$${Number(row.amount_hkd).toLocaleString("en-HK")}`;
    if (row.result_status === "assigned_special_fee") {
      return `<span class="price-value">${amount}</span> <span class="badge">${escapeHtml(t("resultAssignedSpecialFee"))}</span>`;
    }
    return `<span class="price-value">${amount}</span>`;
  }

  function formatPriceText(row) {
    if (row.amount_hkd === null || row.amount_hkd === undefined) return t("unresolved");
    const amount = `HK$${Number(row.amount_hkd).toLocaleString("en-HK")}`;
    if (row.result_status === "assigned_special_fee") {
      return `${amount} (${t("resultAssignedSpecialFee")})`;
    }
    return amount;
  }

  function updateIssueTotal(selectedIssue) {
    if (!selectedIssue) {
      issueTotalEl.textContent = "";
      renderIssuePanel({ selectedIssue: "", totalCount: getRenderedTotalCount() });
      return;
    }
    const meta = getAuctionsByDate()[selectedIssue];
    if (!meta) {
      issueTotalEl.textContent = "";
      renderIssuePanel({ selectedIssue, totalCount: getRenderedTotalCount() });
      return;
    }
    let label = t("totalProceedsLabel");
    if (getCurrentDataset() === "tvrm_physical") label = t("totalProceedsLabelPhysical");
    if (getCurrentDataset() === "tvrm_eauction") label = t("totalProceedsLabelEauction");
    if (getCurrentDataset() === "tvrm_legacy") label = t("totalProceedsLabelLegacy");
    const linkHref = normalizePdfUrl(meta.source_url || meta.pdf_url || "");
    const linkText = /\.xls[x]?$/i.test(String(meta.source_url || meta.pdf_url || ""))
      ? t("fromSourceFile")
      : t("fromPdf");
    if (meta.total_sale_proceeds_hkd == null) {
      const token = bumpIssueTotalToken();
      const cachedRows = getLoadedIssues().get(selectedIssue);
      if (cachedRows) {
        const computed = computeIssueTotal(cachedRows);
        if (computed != null) {
          const amount = `HK$${Number(computed).toLocaleString("en-HK")}`;
          const suffix = t("totalProceedsComputed");
          const link = linkHref
            ? ` <a href="${linkHref}" target="_blank" rel="noopener">${escapeHtml(linkText)}</a>`
            : "";
          issueTotalEl.innerHTML = `${escapeHtml(label)}：<strong>${amount}</strong> ${escapeHtml(suffix)}${link}`;
          renderIssuePanel({ selectedIssue, totalCount: getRenderedTotalCount() });
          return;
        }
      }
      issueTotalEl.textContent = `${label}：${t("totalProceedsCalculating")}`;
      loadIssue(selectedIssue)
        .then((rows) => {
          if (token !== getIssueTotalToken()) return;
          const computed = computeIssueTotal(rows);
          if (computed == null) {
            issueTotalEl.textContent = `${label}：${t("totalProceedsUnavailable")}`;
            return;
          }
          const amount = `HK$${Number(computed).toLocaleString("en-HK")}`;
          const suffix = t("totalProceedsComputed");
          const link = linkHref
            ? ` <a href="${linkHref}" target="_blank" rel="noopener">${escapeHtml(linkText)}</a>`
            : "";
          issueTotalEl.innerHTML = `${escapeHtml(label)}：<strong>${amount}</strong> ${escapeHtml(suffix)}${link}`;
          renderIssuePanel({ selectedIssue, totalCount: getRenderedTotalCount() });
        })
        .catch(() => {
          if (token !== getIssueTotalToken()) return;
          issueTotalEl.textContent = `${label}：${t("totalProceedsUnavailable")}`;
          renderIssuePanel({ selectedIssue, totalCount: getRenderedTotalCount() });
        });
      return;
    }
    const amount = `HK$${Number(meta.total_sale_proceeds_hkd).toLocaleString("en-HK")}`;
    const link = linkHref
      ? ` <a href="${linkHref}" target="_blank" rel="noopener">${escapeHtml(linkText)}</a>`
      : "";
    issueTotalEl.innerHTML = `${escapeHtml(label)}：<strong>${amount}</strong>${link}`;
    renderIssuePanel({ selectedIssue, totalCount: getRenderedTotalCount() });
  }

  function formatDoubleLine(v) {
    if (!v) return `<div class="plate na">(n/a)</div>`;
    let lines = [];
    if (Array.isArray(v)) lines = v;
    else lines = String(v).split(/\n+/);
    lines = lines.map((x) => String(x || "").trim()).filter(Boolean);
    if (!lines.length) return `<div class="plate na">(n/a)</div>`;
    return `<div class="plate double"><div class="double-plate">${lines.map((x) => `<span>${escapeHtml(x)}</span>`).join("")}</div></div>`;
  }

  function formatSingleLine(v) {
    if (!v) return `<div class="plate na">(n/a)</div>`;
    return `<div class="plate">${escapeHtml(v)}</div>`;
  }

  function formatAuctionDate(row) {
    const meta = getAuctionsByDate()[auctionMetaKeyForRow(row)];
    const base = resolveDisplayDateLabel({
      label: (meta && meta.auction_date_label) || (row && row.auction_date_label) || "",
      auctionDate: row && row.auction_date,
      datePrecision: (row && row.date_precision) || (meta && meta.date_precision) || "",
      datasetKey: row && row.dataset_key ? row.dataset_key : getCurrentDataset(),
    });
    const decorated = (meta && meta.is_lny) || isLnyMeta(row) ? `${base} 🧧` : base;
    return decorated;
  }

  function formatRowCategory(row) {
    const key = row && row.dataset_key ? row.dataset_key : getCurrentDataset();
    return datasetLabelForKey(key);
  }

  function renderDateCell(row, idx) {
    const issueHref = issueHrefForRow(row);
    return `
      <div class="cell-stack">
        <a class="issue-jump-link cell-main" href="${issueHref}" data-row-index="${idx}">${escapeHtml(formatAuctionDate(row))}</a>
      </div>
    `;
  }

  function renderCategoryCell(row) {
    return `
      <div class="cell-stack">
        <span class="category-pill">${escapeHtml(formatRowCategory(row))}</span>
      </div>
    `;
  }

  function rowLink(row) {
    if (!row) return "#";
    if (getCurrentLang() === "zh" && row.pdf_url_zh) return row.pdf_url_zh;
    if (getCurrentLang() === "en" && row.pdf_url_en) return row.pdf_url_en;
    if (getCurrentLang() === "zh" && row.source_url) return row.source_url;
    if (getCurrentLang() === "en" && row.source_url_en) return row.source_url_en;
    if (row.pdf_url) return normalizePdfUrl(row.pdf_url);
    if (row.source_url_en) return row.source_url_en;
    if (row.source_url) return row.source_url;
    return "#";
  }

  function linkTextForRow(row) {
    const href = String(row?.source_url || row?.pdf_url || "");
    return /\.xls[x]?$/i.test(href) ? t("viewSource") : t("viewPdf");
  }

  function plateDisplayText(row) {
    const single = String(row?.single_line || "").trim();
    if (single) return single;
    const dbl = Array.isArray(row?.double_line) ? row.double_line : String(row?.double_line || "").split(/\n+/);
    return dbl.map((x) => String(x || "").trim()).filter(Boolean).join(" ");
  }

  function renderSearchAssist({ totalCount = 0, selectedIssue = "", q = "" } = {}) {
    let note = "";
    if (!q) {
      note = selectedIssue
        ? t("searchNoteIssue")(issueLabelForDate(selectedIssue))
        : getCurrentDataset() === "all"
          ? t("searchNoteAllEmpty")
          : t("searchNoteDatasetEmpty");
    } else if (q.length <= 2 && getCurrentDataset() === "all") {
      note = t("searchNoteShort");
    } else {
      note = t("searchNoteQuery")(totalCount.toLocaleString());
    }
    searchNoteEl.textContent = note;
    const hasHistory = renderSearchHistory();
    searchAssistEl.hidden = !note && !hasHistory;
  }

  return {
    formatLastUpdated,
    formatPrice,
    formatPriceText,
    updateIssueTotal,
    formatDoubleLine,
    formatSingleLine,
    formatAuctionDate,
    formatRowCategory,
    renderDateCell,
    renderCategoryCell,
    rowLink,
    linkTextForRow,
    plateDisplayText,
    renderSearchAssist,
  };
};
