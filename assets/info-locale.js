(() => {
  const lang = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh";
  document.documentElement.lang = lang === "en" ? "en" : "zh-HK";
  document.documentElement.dataset.locale = lang;
  for (const element of document.querySelectorAll("[data-copy-zh][data-copy-en]")) {
    element.textContent = element.getAttribute(`data-copy-${lang}`) || "";
  }
  for (const element of document.querySelectorAll("[data-placeholder-zh][data-placeholder-en]")) {
    element.setAttribute("placeholder", element.getAttribute(`data-placeholder-${lang}`) || "");
  }
  for (const element of document.querySelectorAll("[data-label-zh][data-label-en]")) {
    element.setAttribute("data-label", element.getAttribute(`data-label-${lang}`) || "");
  }
  for (const element of document.querySelectorAll("[data-lang-only]")) {
    element.hidden = element.getAttribute("data-lang-only") !== lang;
  }
  for (const link of document.querySelectorAll("a[data-preserve-lang]")) {
    const url = new URL(link.getAttribute("href"), location.href);
    url.searchParams.set("lang", lang);
    link.href = `${url.pathname}${url.search}${url.hash}`;
  }
  const title = document.body?.getAttribute(`data-title-${lang}`);
  if (title) document.title = title;
  dispatchEvent(new CustomEvent("platehk:localeapplied", { detail: { lang } }));
})();
