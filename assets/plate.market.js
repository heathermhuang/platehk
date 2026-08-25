(() => {
  const card = document.querySelector("[data-market-card][data-plate]");
  if (!card) return;
  const plate = String(card.dataset.plate || "").replace(/[^A-Z0-9]/g, "");
  if (!plate) return;
  const lang = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh";
  const t = lang === "en" ? {
    priceRequest: "Price on request",
    kicker: "External sale signal",
    obtainable: "may be obtainable",
    plateLabel: "Plate",
    asking: "Current asking price: ",
    body: "Plate.hk can first verify whether the listing is still active, then contact and negotiate confidentially for a buyer. Third-party data may be stale or wrong and does not guarantee availability or transferability.",
    mandate: "Verify and negotiate on WhatsApp",
    source: "View the 28car listing",
  } : {
    priceRequest: "價格另議",
    kicker: "外部放售訊號",
    obtainable: "或可洽購",
    plateLabel: "車牌",
    asking: "目前叫價：",
    body: "Plate.hk 可先核實刊登是否仍然有效，再代表買方保密接洽及議價。第三方資料可能過期或有誤，並不保證可買到或可轉名。",
    mandate: "WhatsApp 委託核實及議價",
    source: "查看 28car 來源刊登",
  };

  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const validSourceUrl = (value) => {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" && url.hostname === "m.28car.com" ? url : null;
    } catch {
      return null;
    }
  };
  const money = (amount) => `HK$${Number(amount).toLocaleString("en-HK")}`;
  const whatsappIcon = () => {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "whatsapp-icon");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("viewBox", "0 0 24 24");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M12.04 2a9.84 9.84 0 0 0-8.48 14.8L2 22l5.33-1.52A9.96 9.96 0 1 0 12.04 2Zm0 17.98a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.16.9.92-3.08-.2-.31a8 8 0 1 1 6.87 3.8Zm4.45-6.03c-.24-.12-1.44-.7-1.66-.79-.22-.08-.38-.12-.54.12-.16.24-.62.79-.76.95-.14.16-.28.18-.52.06-.24-.12-1.02-.37-1.94-1.2a7.3 7.3 0 0 1-1.34-1.66c-.14-.24-.02-.37.1-.49.11-.1.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.58 4.1 3.62.58.24 1.02.39 1.37.5.58.18 1.1.16 1.51.1.46-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z");
    icon.append(path);
    return icon;
  };

  fetch(new URL(`../api/market_signal?plate=${encodeURIComponent(plate)}`, location.href), { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((signal) => {
      const sourceUrl = validSourceUrl(signal?.source_url);
      if (!signal?.availability_detected || signal.plate !== plate || !sourceUrl) return;
      const prices = Array.isArray(signal.asking_prices_hkd)
        ? signal.asking_prices_hkd.filter((value) => Number.isSafeInteger(value) && value > 0).sort((a, b) => a - b)
        : [];
      const price = prices.length
        ? (prices[0] === prices.at(-1) ? money(prices[0]) : `${money(prices[0])}–${money(prices.at(-1))}`)
        : t.priceRequest;

      const copy = node("div");
      copy.append(node("div", "market-kicker", t.kicker));
      const title = node("h2", "market-title");
      const plateBadge = node("span", "plate", plate);
      plateBadge.setAttribute("aria-label", `${t.plateLabel} ${plate}`);
      title.append(plateBadge, document.createTextNode(" "), node("span", "", t.obtainable));
      copy.append(title);
      const priceLine = node("div", "market-price", t.asking);
      priceLine.append(node("strong", "", price));
      copy.append(priceLine);
      copy.append(node("p", "", t.body));

      const actions = node("div", "market-actions");
      if (signal.inquiry_enabled === true) {
        const mandate = node("a", "btn primary whatsapp-action");
        mandate.href = `../?lang=${lang}&q=${encodeURIComponent(plate)}&broker=1`;
        mandate.append(whatsappIcon(), node("span", "", t.mandate));
        actions.append(mandate);
      }
      const source = node("a", "", t.source);
      source.href = sourceUrl.toString();
      source.target = "_blank";
      source.rel = "nofollow noopener noreferrer";
      actions.append(source);

      card.replaceChildren(copy, actions);
      card.hidden = false;
    })
    .catch(() => {});
})();
