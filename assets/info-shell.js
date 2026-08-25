(() => {
  const page = document.body?.dataset.infoPage || "";
  const currentLanguage = () => new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh";
  const COPY = {
    zh: {
      skip: "跳到內容",
      homeLabel: "Plate.hk 香港車牌拍賣資料庫首頁",
      brandSubtitle: "香港車牌拍賣資料庫",
      navLabel: "資料頁導覽",
      nav: { search: "搜尋", plates: "熱門車牌", about: "資料說明", audit: "資料審核", api: "開發者" },
      intro: "獨立整理香港運輸署公開車牌拍賣紀錄。資料有差異時，以官方來源為準。",
      groups: { data: "資料", developers: "開發者", legal: "政策與聯絡" },
      links: { about: "資料說明", audit: "資料審核", changelog: "更新日誌", api: "API 文檔", mcp: "MCP 文件", terms: "使用條款", privacy: "私隱政策", feedback: "反饋表格" },
    },
    en: {
      skip: "Skip to content",
      homeLabel: "Plate.hk vehicle registration marks database home",
      brandSubtitle: "Vehicle Registration Marks Database",
      navLabel: "Information page navigation",
      nav: { search: "Search", plates: "Popular Plates", about: "Data Guide", audit: "Data Audit", api: "Developers" },
      intro: "An independent index of public Hong Kong plate-auction records. Official sources prevail.",
      groups: { data: "Data", developers: "Developers", legal: "Legal & Contact" },
      links: { about: "Data Guide", audit: "Data Audit", changelog: "Changelog", api: "API Docs", mcp: "MCP Docs", terms: "Terms of Use", privacy: "Privacy Policy", feedback: "Feedback Form" },
    },
  };

  const withLanguage = (path, lang) => {
    const url = new URL(path, location.origin);
    url.searchParams.set("lang", lang);
    return `${url.pathname}${url.search}`;
  };
  const navItems = [
    { key: "search", path: "/" },
    { key: "plates", path: "/plates/index.html" },
    { key: "about", path: "/about.html" },
    { key: "audit", path: "/audit.html" },
    { key: "api", path: "/api.html" },
  ];
  const headerHost = document.querySelector("[data-info-shell-header]") || document.createElement("div");
  if (!headerHost.isConnected) document.body.prepend(headerHost);
  const footerHost = document.querySelector("[data-info-shell-footer]") || document.createElement("div");
  if (!footerHost.isConnected) document.body.append(footerHost);

  function setLanguage(next) {
    const url = new URL(location.href);
    url.searchParams.set("lang", next);
    location.assign(`${url.pathname}${url.search}${url.hash}`);
  }

  function renderShell() {
    const lang = currentLanguage();
    const t = COPY[lang];
    document.documentElement.lang = lang === "en" ? "en" : "zh-HK";
    const navHasCurrent = navItems.some((item) => item.key === page);
    const footerCurrent = (key) => !navHasCurrent && key === page ? ' aria-current="page"' : "";
    headerHost.innerHTML = `
      <a class="info-skip-link" href="#main-content">${t.skip}</a>
      <header class="info-site-header">
        <a class="info-brand" href="${withLanguage("/", lang)}" aria-label="${t.homeLabel}">
          <img src="/assets/logo.svg" alt="" width="44" height="44" />
          <span><strong>Plate.hk</strong><small>${t.brandSubtitle}</small></span>
        </a>
        <div class="info-header-actions">
          <nav class="info-nav" aria-label="${t.navLabel}">
            ${navItems.map((item) => `<a href="${withLanguage(item.path, lang)}"${item.key === page ? ' aria-current="page"' : ""}>${t.nav[item.key]}</a>`).join("")}
          </nav>
          <div class="lang-toggle info-lang-toggle" role="group" aria-label="Language">
            <button id="infoLangZh" type="button" aria-pressed="${lang === "zh"}">繁</button>
            <button id="infoLangEn" type="button" aria-pressed="${lang === "en"}">EN</button>
          </div>
        </div>
      </header>`;
    footerHost.innerHTML = `
      <footer class="info-site-footer">
        <div class="info-footer-intro">
          <a class="info-footer-brand" href="${withLanguage("/", lang)}">Plate.hk</a>
          <p>${t.intro}</p>
        </div>
        <div class="info-footer-group"><strong>${t.groups.data}</strong>
          <a href="${withLanguage("/about.html", lang)}"${footerCurrent("about")}>${t.links.about}</a>
          <a href="${withLanguage("/audit.html", lang)}"${footerCurrent("audit")}>${t.links.audit}</a>
          <a href="${withLanguage("/changelog.html", lang)}"${footerCurrent("changelog")}>${t.links.changelog}</a>
        </div>
        <div class="info-footer-group"><strong>${t.groups.developers}</strong>
          <a href="${withLanguage("/api.html", lang)}"${footerCurrent("api")}>${t.links.api}</a>
          <a href="${withLanguage("/mcp.html", lang)}"${footerCurrent("mcp")}>${t.links.mcp}</a>
          <a href="/llms.txt">llms.txt</a>
          <a href="https://github.com/heathermhuang/platehk" target="_blank" rel="noopener">GitHub</a>
        </div>
        <div class="info-footer-group"><strong>${t.groups.legal}</strong>
          <a href="${withLanguage("/terms.html", lang)}"${footerCurrent("terms")}>${t.links.terms}</a>
          <a href="${withLanguage("/privacy.html", lang)}"${footerCurrent("privacy")}>${t.links.privacy}</a>
          <a href="https://forms.gle/1YFfSmraLp27YneU9" target="_blank" rel="noopener">${t.links.feedback}</a>
        </div>
      </footer>`;
    headerHost.querySelector("#infoLangZh")?.addEventListener("click", () => setLanguage("zh"));
    headerHost.querySelector("#infoLangEn")?.addEventListener("click", () => setLanguage("en"));
  }

  renderShell();
  addEventListener("popstate", renderShell);
})();
