(() => {
  const page = document.body?.dataset.infoPage || "";
  const language = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh";

  const withLanguage = (path) => {
    const url = new URL(path, location.origin);
    if (language === "en") url.searchParams.set("lang", "en");
    return `${url.pathname}${url.search}`;
  };

  const navItems = [
    { key: "search", path: "/", label: "搜尋 Search" },
    { key: "plates", path: "/plates/index.html", label: "熱門車牌 Popular" },
    { key: "about", path: "/about.html", label: "資料說明 Guide" },
    { key: "audit", path: "/audit.html", label: "資料審核 Audit" },
    { key: "api", path: "/api.html", label: "開發者 API" },
  ];
  const navHasCurrent = navItems.some((item) => item.key === page);
  const footerCurrent = (key) => !navHasCurrent && key === page ? ' aria-current="page"' : "";

  const headerHost = document.querySelector("[data-info-shell-header]") || document.createElement("div");
  if (!headerHost.isConnected) document.body.prepend(headerHost);
  headerHost.innerHTML = `
    <a class="info-skip-link" href="#main-content">跳到內容 / Skip to content</a>
    <header class="info-site-header">
      <a class="info-brand" href="${withLanguage("/")}" aria-label="Plate.hk 香港車牌拍賣資料庫首頁">
        <img src="/assets/logo.svg" alt="" width="44" height="44" />
        <span>
          <strong>Plate.hk</strong>
          <small>香港車牌拍賣資料庫</small>
        </span>
      </a>
      <nav class="info-nav" aria-label="資料頁導覽 / Information pages">
        ${navItems.map((item) => {
          const current = item.key === page;
          return `<a href="${withLanguage(item.path)}"${current ? ' aria-current="page"' : ""}>${item.label}</a>`;
        }).join("")}
      </nav>
    </header>`;

  const footerHost = document.querySelector("[data-info-shell-footer]") || document.createElement("div");
  if (!footerHost.isConnected) document.body.append(footerHost);
  footerHost.innerHTML = `
    <footer class="info-site-footer">
      <div class="info-footer-intro">
        <a class="info-footer-brand" href="${withLanguage("/")}">Plate.hk</a>
        <p>獨立整理香港運輸署公開車牌拍賣紀錄。資料有差異時，以官方來源為準。</p>
        <p lang="en">An independent index of public Hong Kong plate-auction records. Official sources prevail.</p>
      </div>
      <div class="info-footer-group">
        <strong>資料 Data</strong>
        <a href="${withLanguage("/about.html")}"${footerCurrent("about")}>資料說明</a>
        <a href="${withLanguage("/audit.html")}"${footerCurrent("audit")}>資料審核</a>
        <a href="${withLanguage("/changelog.html")}"${footerCurrent("changelog")}>更新日誌</a>
      </div>
      <div class="info-footer-group">
        <strong>開發者 Developers</strong>
        <a href="${withLanguage("/api.html")}"${footerCurrent("api")}>API 文檔</a>
        <a href="${withLanguage("/mcp.html")}"${footerCurrent("mcp")}>MCP 文件</a>
        <a href="/llms.txt">llms.txt</a>
        <a href="https://github.com/heathermhuang/platehk" target="_blank" rel="noopener">GitHub</a>
      </div>
      <div class="info-footer-group">
        <strong>政策與聯絡 Legal</strong>
        <a href="${withLanguage("/terms.html")}"${footerCurrent("terms")}>使用條款</a>
        <a href="${withLanguage("/privacy.html")}"${footerCurrent("privacy")}>私隱政策</a>
        <a href="https://forms.gle/1YFfSmraLp27YneU9" target="_blank" rel="noopener">反饋表格</a>
      </div>
    </footer>`;
})();
