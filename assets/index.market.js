window.createPlateMarketFlow = function createPlateMarketFlow({
  normalizePlate,
  getCurrentLang,
  marketSignalEl,
  brokerModalEl,
  brokerCloseEl,
  brokerFormEl,
  brokerPlateEl,
  brokerBudgetEl,
  brokerContactMethodEl,
  brokerContactEl,
  brokerNoteEl,
  brokerConsentEl,
  brokerSubmitEl,
  brokerStatusEl,
}) {
  const COPY = {
    zh: {
      kicker: "外部放售訊號",
      title: (plate) => `${plate} 或可洽購`,
      body: "我們在第三方平台發現近期放售訊號。Plate.hk 可先核實是否仍可交易，再以買方代表身份私下接洽及議價。",
      price: "目前叫價",
      priceRange: "目前叫價範圍",
      priceContact: "部分放售須另議價格",
      offerCount: (count) => `${count} 個近期訊號`,
      observed: (date) => `最近核對：${date}`,
      disclaimer: "第三方刊登可能已過期、資料有誤或不符合轉移規則；這不是可買到或可轉名的保證。",
      inquire: "委託我們核實及議價",
      pending: "買方服務設定中",
      source: "查看 28car 來源刊登",
      dialogTitle: "保密買方委託",
      dialogIntro: "我們會在初步接洽時保密你的身份。若交易需要披露資料，我們會先取得你的同意。",
      plateLabel: "目標車牌",
      budgetLabel: "最高預算（HKD）",
      methodLabel: "聯絡方式",
      contactLabel: "電郵或電話",
      contactPlaceholder: "輸入可聯絡你的資料",
      methodEmail: "電郵",
      methodWhatsapp: "WhatsApp",
      methodPhone: "電話",
      noteLabel: "補充資料（選填）",
      notePlaceholder: "例如期限、交易偏好或可接受條件",
      consent: "我同意 Plate.hk 為處理此委託而儲存及使用上述資料，並已閱讀私隱政策及使用條款。",
      submit: "提交保密委託",
      submitting: "提交中…",
      success: (id) => `已收到委託。參考編號：${id}`,
      unavailable: "委託服務暫時未完成設定，請稍後再試。",
      invalid: "請檢查預算、聯絡資料及同意選項。",
      failed: "未能提交，請稍後再試。",
      close: "關閉",
    },
    en: {
      kicker: "External sale signal",
      title: (plate) => `${plate} may be obtainable`,
      body: "We found a recent offer signal on a third-party platform. Plate.hk can verify that it is still actionable, then approach and negotiate as your confidential buyer representative.",
      price: "Current asking price",
      priceRange: "Current asking range",
      priceContact: "Some offers require a price enquiry",
      offerCount: (count) => `${count} recent signal${count === 1 ? "" : "s"}`,
      observed: (date) => `Last checked: ${date}`,
      disclaimer: "Third-party listings may be stale, inaccurate, or incompatible with transfer rules. This is not a guarantee of availability or transferability.",
      inquire: "Ask us to verify & negotiate",
      pending: "Buyer service setup pending",
      source: "View the source listing on 28car",
      dialogTitle: "Confidential buyer mandate",
      dialogIntro: "We keep your identity private during the initial approach. If a transaction requires disclosure, we will obtain your consent first.",
      plateLabel: "Target plate",
      budgetLabel: "Maximum budget (HKD)",
      methodLabel: "Contact method",
      contactLabel: "Email or phone",
      contactPlaceholder: "How should we reach you?",
      methodEmail: "Email",
      methodWhatsapp: "WhatsApp",
      methodPhone: "Phone",
      noteLabel: "Additional context (optional)",
      notePlaceholder: "For example, timing, transaction preferences, or acceptable terms",
      consent: "I agree that Plate.hk may store and use this information to handle the mandate, and I have read the Privacy Policy and Terms of Use.",
      submit: "Submit confidential mandate",
      submitting: "Submitting…",
      success: (id) => `Mandate received. Reference: ${id}`,
      unavailable: "The mandate service is not fully configured yet. Please try again later.",
      invalid: "Check the budget, contact details, and consent option.",
      failed: "Submission failed. Please try again later.",
      close: "Close",
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

  function hideSignal() {
    currentSignal = null;
    marketSignalEl.hidden = true;
    marketSignalEl.innerHTML = "";
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
        <h2>${escapeHtml(copy.title(plate))}</h2>
        <p>${escapeHtml(copy.body)}</p>
        <div class="market-facts">
          <span><strong>${escapeHtml(prices.label)}:</strong> ${escapeHtml(prices.value)}</span>
          <span>${escapeHtml(copy.offerCount(Number(currentSignal.offer_count || 1)))}</span>
          ${observed ? `<span>${escapeHtml(copy.observed(observed))}</span>` : ""}
          ${contactPrice}
        </div>
        <p class="market-disclaimer">${escapeHtml(copy.disclaimer)}</p>
      </div>
      <div class="market-actions">
        <button class="market-inquire-btn" type="button" data-market-inquire ${enabled ? "" : "disabled"}>
          ${escapeHtml(enabled ? copy.inquire : copy.pending)}
        </button>
        ${sourceLink}
      </div>
    `;
    marketSignalEl.hidden = false;
  }

  function renderModalLanguage() {
    const copy = text();
    brokerModalEl.querySelector("[data-broker-title]").textContent = copy.dialogTitle;
    brokerModalEl.querySelector("[data-broker-intro]").textContent = copy.dialogIntro;
    brokerModalEl.querySelector("[data-broker-plate-label]").textContent = copy.plateLabel;
    brokerModalEl.querySelector("[data-broker-budget-label]").textContent = copy.budgetLabel;
    brokerModalEl.querySelector("[data-broker-method-label]").textContent = copy.methodLabel;
    brokerModalEl.querySelector("[data-broker-contact-label]").textContent = copy.contactLabel;
    brokerModalEl.querySelector("[data-broker-note-label]").textContent = copy.noteLabel;
    brokerModalEl.querySelector("[data-broker-consent-copy]").childNodes[0].textContent = `${copy.consent} `;
    brokerBudgetEl.setAttribute("aria-label", copy.budgetLabel);
    brokerContactEl.placeholder = copy.contactPlaceholder;
    brokerNoteEl.placeholder = copy.notePlaceholder;
    brokerContactMethodEl.options[0].textContent = copy.methodEmail;
    brokerContactMethodEl.options[1].textContent = copy.methodWhatsapp;
    brokerContactMethodEl.options[2].textContent = copy.methodPhone;
    brokerSubmitEl.textContent = copy.submit;
    brokerCloseEl.setAttribute("aria-label", copy.close);
  }

  function openModal() {
    if (!currentSignal?.availability_detected || !currentSignal.inquiry_enabled) return;
    previouslyFocused = document.activeElement;
    brokerFormEl.querySelectorAll("input, select, textarea, button[type='submit']").forEach((element) => {
      element.disabled = false;
    });
    brokerFormEl.reset();
    brokerPlateEl.value = normalizePlate(currentSignal.plate);
    brokerStatusEl.textContent = "";
    brokerStatusEl.classList.remove("success");
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

  async function submitInquiry(event) {
    event.preventDefault();
    if (!currentSignal?.availability_detected) return;
    const copy = text();
    brokerStatusEl.textContent = "";
    if (!brokerFormEl.reportValidity()) return;
    brokerSubmitEl.disabled = true;
    brokerSubmitEl.textContent = copy.submitting;
    try {
      const response = await fetch("./api/broker_inquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plate: normalizePlate(currentSignal.plate),
          listing_id: String(currentSignal.listing_id || ""),
          budget_hkd: Number(brokerBudgetEl.value),
          contact_method: brokerContactMethodEl.value,
          contact: brokerContactEl.value.trim(),
          note: brokerNoteEl.value.trim(),
          privacy_consent: brokerConsentEl.checked,
          company_website: brokerFormEl.elements.company_website.value,
          lang: getCurrentLang() === "en" ? "en" : "zh",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.error === "broker_inquiry_not_configured") throw new Error("not_configured");
        if (response.status === 400) throw new Error("invalid");
        throw new Error("failed");
      }
      brokerStatusEl.textContent = copy.success(String(payload.inquiry_id || "received"));
      brokerStatusEl.classList.add("success");
      brokerFormEl.querySelectorAll("input, select, textarea, button[type='submit']").forEach((element) => {
        element.disabled = true;
      });
    } catch (error) {
      brokerStatusEl.classList.remove("success");
      brokerStatusEl.textContent = error.message === "not_configured"
        ? copy.unavailable
        : error.message === "invalid" ? copy.invalid : copy.failed;
      brokerSubmitEl.disabled = false;
      brokerSubmitEl.textContent = copy.submit;
    }
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
  brokerCloseEl.addEventListener("click", closeModal);
  brokerModalEl.addEventListener("click", (event) => {
    if (event.target === brokerModalEl) closeModal();
  });
  brokerFormEl.addEventListener("submit", submitInquiry);
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
