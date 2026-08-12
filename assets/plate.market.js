(() => {
  const card = document.querySelector("[data-market-card][data-plate]");
  if (!card) return;
  const plate = String(card.dataset.plate || "").replace(/[^A-Z0-9]/g, "");
  if (!plate) return;

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
        : "價格另議 / Price on request";

      const copy = node("div");
      copy.append(node("div", "market-kicker", "外部放售訊號 / External sale signal"));
      copy.append(node("h2", "", "這個車牌或可洽購 / This plate may be obtainable"));
      const priceLine = node("div", "market-price", "目前叫價 / Asking: ");
      priceLine.append(node("strong", "", price));
      copy.append(priceLine);
      copy.append(node("p", "", "Plate.hk 可先核實刊登是否仍然有效，再代表買方保密接洽及議價。第三方資料可能過期或有誤，並不保證可買到或可轉名。"));

      const actions = node("div", "market-actions");
      if (signal.inquiry_enabled === true) {
        const mandate = node("a", "btn primary", "委託核實及議價");
        mandate.href = `../?lang=zh&q=${encodeURIComponent(plate)}&broker=1`;
        actions.append(mandate);
      }
      const source = node("a", "", "查看 28car 來源刊登");
      source.href = sourceUrl.toString();
      source.target = "_blank";
      source.rel = "nofollow noopener noreferrer";
      actions.append(source);

      card.replaceChildren(copy, actions);
      card.hidden = false;
    })
    .catch(() => {});
})();
