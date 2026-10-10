(() => {
  const page = document.body?.dataset.infoPage || "";
  const footerOnly = document.currentScript?.hasAttribute("data-footer-only");
  const currentLanguage = () => (location.pathname.startsWith("/auction-results/en/") || new URLSearchParams(location.search).get("lang") === "en") ? "en" : "zh";
  const COPY = {
    zh: {
      skip: "跳到內容",
      homeLabel: "Plate.hk 香港車牌拍賣資料庫首頁",
      brandSubtitle: "香港車牌拍賣資料庫",
      languageLabel: "語言",
      navLabel: "資料頁導覽",
      nav: { prices: "查歷史成交價", discover: "按預算找車牌", availability: "官方可用號碼及申請", archive: "已核對結果", auctions: "日程", shortlist: "收藏", search: "拍賣紀錄", camera: "相機搜尋", plates: "熱門車牌", about: "資料說明", audit: "資料審核", api: "開發者" },
      intro: "獨立整理香港運輸署公開車牌拍賣紀錄。資料有差異時，以官方來源為準。",
      groups: { data: "資料", developers: "開發者", legal: "政策與聯絡" },
      links: { about: "資料說明", audit: "資料審核", changelog: "更新日誌", api: "API 文檔", mcp: "MCP 文件", terms: "使用條款", privacy: "私隱政策", feedback: "反饋表格" },
    },
    en: {
      skip: "Skip to content",
      homeLabel: "Plate.hk vehicle registration marks database home",
      brandSubtitle: "Vehicle Registration Marks Database",
      languageLabel: "Language",
      navLabel: "Information page navigation",
      nav: { prices: "Historical prices", discover: "Discover by budget", availability: "Official availability and applications", archive: "Verified results", auctions: "Auctions", shortlist: "Shortlist", search: "Records", camera: "Search by camera", plates: "Popular plates", about: "Data guide", audit: "Data audit", api: "Developers" },
      intro: "An independent index of public Hong Kong plate-auction records. Official sources prevail.",
      groups: { data: "Data", developers: "Developers", legal: "Legal & Contact" },
      links: { about: "Data Guide", audit: "Data Audit", changelog: "Changelog", api: "API Docs", mcp: "MCP Docs", terms: "Terms of Use", privacy: "Privacy Policy", feedback: "Feedback Form" },
    },
  };

  const withLanguage = (path, lang) => {
    const url = new URL(path, location.origin);
    if (url.pathname.startsWith("/auction-results/")) {
      url.pathname = url.pathname.replace('/auction-results/en/', '/auction-results/');
      if (lang === 'en') url.pathname = url.pathname.replace('/auction-results/', '/auction-results/en/');
      url.searchParams.delete('lang');
    } else url.searchParams.set("lang", lang);
    return `${url.pathname}${url.search}`;
  };
  const navItems = [
    {key:"search",path:"/"}, {key:"archive",path:"/auction-results/index.html"},
    {key:"auctions",path:"/auctions.html"}, {key:"shortlist",path:"/shortlist.html"},
  ];
  const moreItems = [ {key:"prices",path:"/prices.html"}, {key:"discover",path:"/discover.html"},
    {key:"availability",path:"/availability.html"}, {key:"plates",path:"/plates/index.html"}, {key:"camera",path:"/camera.html"},
    {key:"about",path:"/about.html"}, {key:"audit",path:"/audit.html"}, {key:"api",path:"/api.html"} ];
  const headerHost = document.querySelector("[data-info-shell-header]") || document.createElement("div");
  if (!footerOnly && !headerHost.isConnected) document.body.prepend(headerHost);
  const footerHost = document.querySelector("[data-info-shell-footer]") || document.createElement("div");
  if (!footerHost.isConnected) document.body.append(footerHost);

  function setLanguage(next) {
    const url = new URL(location.href);
    if(url.pathname.startsWith("/auction-results/")) {
      url.pathname=url.pathname.replace('/auction-results/en/','/auction-results/');
      if(next==='en')url.pathname=url.pathname.replace('/auction-results/','/auction-results/en/');
      url.searchParams.delete('lang');
    } else url.searchParams.set("lang", next);
    location.assign(`${url.pathname}${url.search}${url.hash}`);
  }

  function renderShell() {
    const lang = currentLanguage();
    const t = COPY[lang];
    const htmlLang = lang === "en" ? "en" : "zh-HK";
    if (document.documentElement.lang !== htmlLang) document.documentElement.lang = htmlLang;
    const navHasCurrent = [...navItems,...moreItems].some((item) => item.key === page);
    const footerCurrent = (key) => !navHasCurrent && key === page ? ' aria-current="page"' : "";
    if (!footerOnly) headerHost.innerHTML = `
      <a class="info-skip-link" href="#main-content">${t.skip}</a>
      <header class="info-site-header">
        <a class="info-brand" href="${withLanguage("/", lang)}" aria-label="${t.homeLabel}">
          <img src="/assets/logo.svg" alt="" width="44" height="44" />
          <span><strong>Plate.hk</strong><small>${t.brandSubtitle}</small></span>
        </a>
        <div class="info-header-actions">
          <nav class="info-nav" aria-label="${t.navLabel}">
            ${navItems.map((item) => `<a href="${withLanguage(item.path, lang)}"${item.key === page ? ' aria-current="page"' : ""}>${t.nav[item.key]}</a>`).join("")}<details class="site-more"><summary>${lang==='en'?'More':'更多'}</summary><div>${moreItems.map(item=>`<a href="${withLanguage(item.path,lang)}"${item.key===page?' aria-current="page"':''}>${t.nav[item.key]}</a>`).join('')}</div></details>
          </nav>
          <div class="lang-toggle info-lang-toggle" role="group" aria-label="${t.languageLabel}">
            ${page==='archive' ? `<a class="info-lang-option" href="${withLanguage(location.pathname,'zh') + location.hash}" hreflang="zh-HK" aria-label="繁體中文"${lang==='zh'?' aria-current="true"':''}>繁</a><a class="info-lang-option" href="${withLanguage(location.pathname,'en') + location.hash}" hreflang="en" aria-label="English"${lang==='en'?' aria-current="true"':''}>EN</a>` : `<button id="infoLangZh" type="button" aria-pressed="${lang === "zh"}">繁</button><button id="infoLangEn" type="button" aria-pressed="${lang === "en"}">EN</button>`}
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
    if (footerOnly) for (const legacy of document.querySelectorAll('.policy-links, .footer-links')) legacy.hidden = true;
  }

  renderShell();
  addEventListener("popstate", renderShell);
  if (footerOnly) new MutationObserver(renderShell).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
})();
