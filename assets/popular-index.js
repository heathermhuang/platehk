(() => {
  const query = document.getElementById("popularQuery");
  const count = document.getElementById("popularCount");
  const showAllButton = document.getElementById("popularShowAll");
  const cards = [...document.querySelectorAll("[data-popular-card]")];
  if (!query || !count || !showAllButton || !cards.length) return;

  const lang = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh";
  let visibleLimit = 0;
  const initialLimit = matchMedia("(max-width: 620px)").matches ? 40 : 80;
  const normalize = (value) => String(value || "").toUpperCase().replace(/\s+/g, "");

  function render() {
    const term = normalize(query.value);
    const matches = [...document.querySelectorAll("[data-popular-card]")].filter((card) => normalize(card.querySelector(".plate")?.textContent).includes(term));
    visibleLimit ||= initialLimit;
    const visible = new Set(matches.slice(0, visibleLimit));

    for (const card of cards) card.hidden = !visible.has(card);
    count.textContent = term
      ? (lang === "en" ? `${matches.length} results` : `${matches.length} 個結果`)
      : (lang === "en" ? `Showing ${Math.min(visibleLimit,matches.length)} of ${cards.length}` : `顯示 ${Math.min(visibleLimit,matches.length)} / ${cards.length} 個`);
    showAllButton.hidden = visibleLimit >= matches.length;
    showAllButton.textContent=lang === "en" ? `Load more (${Math.max(0,matches.length-visibleLimit)} remaining)` : `顯示更多（尚餘 ${Math.max(0,matches.length-visibleLimit)} 個）`;
  }

  query.addEventListener("input",()=>{visibleLimit=initialLimit;render();});
  showAllButton.addEventListener("click", () => {
    visibleLimit += initialLimit;
    render();
  });
  render();
  document.documentElement.classList.add("popular-ready");
})();
