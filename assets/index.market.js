window.createPlateMarketFlow = function createPlateMarketFlow({
  normalizePlate,
  getCurrentLang,
  rowsEl,
  marketSignalEl,
  brokerModalEl,
  brokerCloseEl,
  brokerFormEl,
  brokerPlateEl,
  brokerBudgetEl,
  brokerNoteEl,
  brokerSubmitEl,
}) {
  const WHATSAPP_NUMBER = "85268591577";
  const COPY = {
    zh: {
      kicker: "外部放售訊號",
      titleSuffix: "或可洽購",
      plateLabelText: (plate) => `車牌 ${plate}`,
      body: "我們在第三方平台發現近期放售訊號。Plate.hk 可先核實是否仍可交易，再以買方代表身份私下接洽及議價。",
      price: "目前叫價",
      priceRange: "目前叫價範圍",
      priceContact: "部分放售須另議價格",
      observed: (date) => `最近核對：${date}`,
      disclaimer: "第三方刊登可能已過期、資料有誤或不符合轉移規則；這不是可買到或可轉名的保證。",
      inquire: "WhatsApp 委託核實及議價",
      source: "查看 28car 來源刊登",
      dialogTitle: "WhatsApp 保密洽購",
      dialogIntro: "告訴我們你的預算和要求，我們會為你準備 WhatsApp 訊息。",
      plateLabel: "目標車牌",
      budgetLabel: "最高預算（HKD）",
      noteLabel: "補充資料（選填）",
      notePlaceholder: "例如期限、交易偏好或可接受條件",
      whatsappNote: "按下後只會開啟 WhatsApp 草稿；你在 WhatsApp 按「傳送」前，資料不會傳送給 Plate.hk。",
      submit: "在 WhatsApp 繼續",
      close: "關閉",
      message: ({ plate, asking, budget, note, sourceUrl }) => [
        `你好 Plate.hk，我有興趣洽購車牌 ${plate}。`,
        `目前叫價：${asking}`,
        `我的最高預算：${budget}`,
        note ? `補充資料：${note}` : "",
        "請先核實放售是否仍然有效，並代表我保密接洽及議價。",
        sourceUrl ? `來源：${sourceUrl}` : "",
      ].filter(Boolean).join("\n"),
    },
    en: {
      kicker: "External sale signal",
      titleSuffix: "may be obtainable",
      plateLabelText: (plate) => `Plate ${plate}`,
      body: "We found a recent offer signal on a third-party platform. Plate.hk can verify that it is still actionable, then approach and negotiate as your confidential buyer representative.",
      price: "Current asking price",
      priceRange: "Current asking range",
      priceContact: "Some offers require a price enquiry",
      observed: (date) => `Last checked: ${date}`,
      disclaimer: "Third-party listings may be stale, inaccurate, or incompatible with transfer rules. This is not a guarantee of availability or transferability.",
      inquire: "Ask via WhatsApp",
      source: "View the source listing on 28car",
      dialogTitle: "Confidential WhatsApp enquiry",
      dialogIntro: "Add your budget and any context, and we will prepare the WhatsApp message for you.",
      plateLabel: "Target plate",
      budgetLabel: "Maximum budget (HKD)",
      noteLabel: "Additional context (optional)",
      notePlaceholder: "For example, timing, transaction preferences, or acceptable terms",
      whatsappNote: "This opens a WhatsApp draft only. Nothing is sent to Plate.hk until you press Send in WhatsApp.",
      submit: "Continue in WhatsApp",
      close: "Close",
      message: ({ plate, asking, budget, note, sourceUrl }) => [
        `Hi Plate.hk, I am interested in buying plate ${plate}.`,
        `Current asking price: ${asking}`,
        `My maximum budget: ${budget}`,
        note ? `Additional context: ${note}` : "",
        "Please verify that the listing is active and negotiate confidentially for me.",
        sourceUrl ? `Source: ${sourceUrl}` : "",
      ].filter(Boolean).join("\n"),
    },
  };

  let currentSignal = null;
  let lastLookupKey = "";
  let lookupSequence = 0;
  let previouslyFocused = null;
  let autoOpenHandled = false;

  function text() {
    return COPY[getCurrentLang() === "en" ? "en" : "zh"];
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function whatsappIcon() {
    return '<svg class="whatsapp-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12.04 2a9.84 9.84 0 0 0-8.48 14.8L2 22l5.33-1.52A9.96 9.96 0 1 0 12.04 2Zm0 17.98a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.16.9.92-3.08-.2-.31a8 8 0 1 1 6.87 3.8Zm4.45-6.03c-.24-.12-1.44-.7-1.66-.79-.22-.08-.38-.12-.54.12-.16.24-.62.79-.76.95-.14.16-.28.18-.52.06-.24-.12-1.02-.37-1.94-1.2a7.3 7.3 0 0 1-1.34-1.66c-.14-.24-.02-.37.1-.49.11-.1.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.58 4.1 3.62.58.24 1.02.39 1.37.5.58.18 1.1.16 1.51.1.46-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z"/></svg>';
  }

  function validSourceUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" && url.hostname === "m.28car.com" ? url.toString() : "";
    } catch {
      return "";
    }
  }

  function formatMoney(amount) {
    return `HK$${Number(amount).toLocaleString("en-HK")}`;
  }

  function formatObserved(value) {
    const date = new Date(String(value || ""));
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat(getCurrentLang() === "en" ? "en-HK" : "zh-HK", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Hong_Kong",
    }).format(date);
  }

  function priceSummary(signal) {
    const prices = Array.isArray(signal.asking_prices_hkd)
      ? signal.asking_prices_hkd.filter((value) => Number.isSafeInteger(value) && value > 0)
      : [];
    if (!prices.length) return { label: text().price, value: text().priceContact };
    const minimum = Math.min(...prices);
    const maximum = Math.max(...prices);
    return {
      label: minimum === maximum ? text().price : text().priceRange,
      value: minimum === maximum ? formatMoney(minimum) : `${formatMoney(minimum)}–${formatMoney(maximum)}`,
    };
  }

  function clearRowActions() {
    rowsEl.querySelectorAll(".row-market-btn").forEach((button) => button.remove());
  }

  function syncRowActions() {
    clearRowActions();
    if (!currentSignal?.availability_detected || currentSignal.inquiry_enabled !== true) return;
    const copy = text();
    const plate = normalizePlate(currentSignal.plate);
    rowsEl.querySelectorAll(`tr[data-plate="${plate}"] .row-actions`).forEach((actions) => {
      const button = document.createElement("button");
      button.className = "icon-btn row-market-btn";
      button.type = "button";
      button.dataset.marketInquire = "";
      button.title = copy.inquire;
      button.setAttribute("aria-label", `${copy.inquire}: ${plate}`);
      button.innerHTML = whatsappIcon();
      actions.append(button);
    });
  }

  function hideSignal() {
    currentSignal = null;
    marketSignalEl.hidden = true;
    marketSignalEl.innerHTML = "";
    clearRowActions();
    closeModal();
  }

  function renderSignal() {
    if (!currentSignal?.availability_detected) {
      hideSignal();
      return;
    }
    const copy = text();
    const plate = normalizePlate(currentSignal.plate);
    const prices = priceSummary(currentSignal);
    const observed = formatObserved(currentSignal.observed_at);
    const sourceUrl = validSourceUrl(currentSignal.source_url);
    const sourceLink = sourceUrl
      ? `<a class="market-source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(copy.source)}</a>`
      : "";
    const contactPrice = currentSignal.has_contact_price && currentSignal.asking_prices_hkd?.length
      ? `<span class="market-contact-price">${escapeHtml(copy.priceContact)}</span>`
      : "";
    const enabled = currentSignal.inquiry_enabled === true;
    marketSignalEl.innerHTML = `
      <div class="market-signal-copy">
        <div class="market-kicker">${escapeHtml(copy.kicker)}</div>
        <h2 class="market-title"><span class="market-plate" aria-label="${escapeHtml(copy.plateLabelText(plate))}">${escapeHtml(plate)}</span><span> ${escapeHtml(copy.titleSuffix)}</span></h2>
        <p>${escapeHtml(copy.body)}</p>
        <div class="market-facts">
          <span><strong>${escapeHtml(prices.label)}:</strong> ${escapeHtml(prices.value)}</span>
          ${observed ? `<span>${escapeHtml(copy.observed(observed))}</span>` : ""}
          ${contactPrice}
        </div>
        <p class="market-disclaimer">${escapeHtml(copy.disclaimer)}</p>
      </div>
      <div class="market-actions">
        <button class="market-inquire-btn" type="button" data-market-inquire ${enabled ? "" : "disabled"}>
          ${whatsappIcon()}<span>${escapeHtml(copy.inquire)}</span>
        </button>
        ${sourceLink}
      </div>
    `;
    marketSignalEl.hidden = false;
    syncRowActions();
  }

  function renderModalLanguage() {
    const copy = text();
    brokerModalEl.querySelector("[data-broker-title]").textContent = copy.dialogTitle;
    brokerModalEl.querySelector("[data-broker-intro]").textContent = copy.dialogIntro;
    brokerModalEl.querySelector("[data-broker-plate-label]").textContent = copy.plateLabel;
    brokerModalEl.querySelector("[data-broker-budget-label]").textContent = copy.budgetLabel;
    brokerModalEl.querySelector("[data-broker-note-label]").textContent = copy.noteLabel;
    brokerModalEl.querySelector("[data-broker-whatsapp-note]").textContent = copy.whatsappNote;
    brokerBudgetEl.setAttribute("aria-label", copy.budgetLabel);
    brokerNoteEl.placeholder = copy.notePlaceholder;
    brokerSubmitEl.querySelector("[data-broker-submit-copy]").textContent = copy.submit;
    brokerCloseEl.setAttribute("aria-label", copy.close);
  }

  function openModal() {
    if (!currentSignal?.availability_detected || !currentSignal.inquiry_enabled) return;
    previouslyFocused = document.activeElement;
    brokerFormEl.reset();
    brokerPlateEl.value = normalizePlate(currentSignal.plate);
    renderModalLanguage();
    brokerModalEl.hidden = false;
    brokerModalEl.classList.add("open");
    brokerModalEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("broker-modal-open");
    window.setTimeout(() => brokerBudgetEl.focus(), 0);
  }

  function closeModal() {
    if (!brokerModalEl || brokerModalEl.hidden) return;
    brokerModalEl.classList.remove("open");
    brokerModalEl.hidden = true;
    brokerModalEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("broker-modal-open");
    if (previouslyFocused && typeof previouslyFocused.focus === "function") previouslyFocused.focus();
    previouslyFocused = null;
  }

  function openWhatsApp(event) {
    event.preventDefault();
    if (!currentSignal?.availability_detected || !brokerFormEl.reportValidity()) return;
    const copy = text();
    const prices = priceSummary(currentSignal);
    const message = copy.message({
      plate: normalizePlate(currentSignal.plate),
      asking: prices.value,
      budget: formatMoney(Number(brokerBudgetEl.value)),
      note: brokerNoteEl.value.trim(),
      sourceUrl: validSourceUrl(currentSignal.source_url),
    });
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function update({ query, rows }) {
    const plate = normalizePlate(query);
    const exactInDatabase = Boolean(plate) && Array.isArray(rows) && rows.some((row) => {
      const value = row?.single_line || (Array.isArray(row?.double_line) ? row.double_line : "");
      return normalizePlate(value) === plate;
    });
    if (!exactInDatabase) {
      lastLookupKey = "";
      lookupSequence += 1;
      hideSignal();
      return;
    }
    if (lastLookupKey === plate) {
      if (currentSignal) renderSignal();
      return;
    }
    lastLookupKey = plate;
    const sequence = ++lookupSequence;
    try {
      const response = await fetch(`./api/market_signal?plate=${encodeURIComponent(plate)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (sequence !== lookupSequence || lastLookupKey !== plate) return;
      if (!payload?.availability_detected) {
        hideSignal();
        return;
      }
      currentSignal = payload;
      renderSignal();
      const shouldAutoOpen = !autoOpenHandled && new URLSearchParams(location.search).get("broker") === "1";
      autoOpenHandled = true;
      if (shouldAutoOpen && currentSignal.inquiry_enabled) openModal();
    } catch {
      if (sequence === lookupSequence) hideSignal();
    }
  }

  marketSignalEl.addEventListener("click", (event) => {
    if (event.target.closest("[data-market-inquire]")) openModal();
  });
  rowsEl.addEventListener("click", (event) => {
    if (event.target.closest("[data-market-inquire]")) openModal();
  });
  brokerCloseEl.addEventListener("click", closeModal);
  brokerModalEl.addEventListener("click", (event) => {
    if (event.target === brokerModalEl) closeModal();
  });
  brokerFormEl.addEventListener("submit", openWhatsApp);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !brokerModalEl.hidden) closeModal();
  });

  return {
    update,
    applyLanguage() {
      if (currentSignal) renderSignal();
      if (!brokerModalEl.hidden) renderModalLanguage();
    },
    closeModal,
  };
};
