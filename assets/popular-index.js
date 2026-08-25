(() => {
  const query = document.getElementById("popularQuery");
  const count = document.getElementById("popularCount");
  const showAllButton = document.getElementById("popularShowAll");
  const cards = [...document.querySelectorAll("[data-popular-card]")];
  if (!query || !count || !showAllButton || !cards.length) return;

  const lang = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh";
  let expanded = false;
  const initialLimit = matchMedia("(max-width: 620px)").matches ? 40 : 80;
  const normalize = (value) => String(value || "").toUpperCase().replace(/\s+/g, "");

  function render() {
    const term = normalize(query.value);
    const matches = cards.filter((card) => normalize(card.querySelector(".plate")?.textContent).includes(term));
    const visibleLimit = term || expanded ? matches.length : initialLimit;
    const visible = new Set(matches.slice(0, visibleLimit));

    for (const card of cards) card.hidden = !visible.has(card);
    count.textContent = term
      ? (lang === "en" ? `${matches.length} results` : `${matches.length} 個結果`)
      : `${Math.min(visibleLimit, matches.length)} / ${cards.length}`;
    showAllButton.hidden = Boolean(term) || expanded || cards.length <= initialLimit;
  }

  query.addEventListener("input", render);
  showAllButton.addEventListener("click", () => {
    expanded = true;
    render();
  });
  render();
  document.documentElement.classList.add("popular-ready");
})();
