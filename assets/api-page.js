      const I18N = {
        zh: {
          pageTitle: "API 文檔 | Plate.hk",
          title: "API 文檔",
          back: "← 返回首頁",
          updated: "最後更新：2026年8月26日",
          statusLoading: "正在讀取最新資料狀態…",
          statusError: "暫時未能讀取即時狀態；API 端點仍可按下方方式使用。",
          statusLabels: ["API 索引", "審核執行", "搜尋筆數"],
          html: `
            <p>Plate.hk 提供公開 JSON 車牌拍賣搜尋 API。這是獨立資料索引，不是香港政府或運輸署 API；如資料有差異，以運輸署原始文件為準。</p>
            <div class="info-live-status" id="apiStatus" aria-live="polite"><div><strong>正在讀取最新資料狀態…</strong></div></div>
            <h2>直接搜尋車牌</h2>
            <div class="box">
              <div><code>GET https://plate.hk/api/search?dataset=all&amp;q=88&amp;page=1&amp;page_size=20&amp;sort=amount_desc</code></div>
            </div>
            <p><code>dataset</code> 可用 <code>all</code>、<code>pvrm</code>、<code>tvrm_physical</code>、<code>tvrm_eauction</code> 或 <code>tvrm_legacy</code>；<code>q</code> 是車牌搜尋字串。回應包含 <code>total</code>、分頁資料及每筆拍賣紀錄。</p>
            <p><code>curl -G 'https://plate.hk/api/search' --data-urlencode 'dataset=all' --data-urlencode 'q=88' --data-urlencode 'page_size=20'</code></p>
            <p>如要在沒有搜尋字串時按日期、金額或車牌排序瀏覽，可用 <code>GET /api/results?dataset=all&amp;sort=date_desc&amp;page=1</code>。</p>

            <h2>限制與錯誤處理</h2>
            <ul>
              <li><code>page_size</code> 必須為 1 至 200；超出範圍會回應 <code>400 invalid_paging</code>。</li>
              <li>公開讀取端點設有速率限制；收到 <code>429 rate_limited</code> 時，請按 <code>Retry-After</code> 標頭稍後重試。</li>
            </ul>

            <h2>靜態資料入口</h2>
            <p><code>Base URL: https://plate.hk/api/v1</code></p>
            <div class="box">
              <div><code>GET https://plate.hk/api/v1/index.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/issues.manifest.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/issues/{YYYY-MM-DD}.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/auctions.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/results.chunks.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/preset.amount_desc.top1000.json</code></div>
              <div><code>GET https://plate.hk/api/v1/tvrm_physical/...</code></div>
              <div><code>GET https://plate.hk/api/v1/tvrm_eauction/...</code></div>
              <div><code>GET https://plate.hk/api/v1/tvrm_legacy/...</code></div>
            </div>

            <p>另外，相機辨識頁會使用站內動態 API，把白框內裁切後的車牌圖像送到伺服器端 vision 模型判讀：</p>
            <div class="box">
              <div><code>POST https://plate.hk/api/vision_plate</code></div>
              <div><code>{"image_data_url":"data:image/jpeg;base64,...","lang":"zh"}</code></div>
            </div>
            <p>此 endpoint 不屬於公開靜態 Open Data API；它依賴伺服器端 OpenAI key，且只回傳單次車牌辨識結果。</p>

            <p><code>tvrm_legacy</code> 現在只保留 <code>1973-2006</code> 的年份區段資料；新工作簿裡 <code>2007+</code> 的逐筆正式拍賣日期已併入 <code>tvrm_physical</code> / <code>tvrm_eauction</code> 的日期分期。</p>
            <p>首頁「全部車牌」搜尋會用到少量靜態輔助檔與熱門查詢快取；若你要做類似搜尋，可額外抓取這些檔案：</p>
            <div class="box">
              <div><code>GET https://plate.hk/data/all.search.meta.json</code></div>
              <div><code>GET https://plate.hk/data/all.prefix1.top200.json</code></div>
              <div><code>GET https://plate.hk/data/hot_search/manifest.json</code></div>
            </div>
            <p>站內期數深連結使用查詢參數，例如 <code>./index.html?d=tvrm_physical&amp;issue=2026-03-01</code>；若你嵌入本站頁面，可沿用同一格式。</p>

            <h2>為什麼是靜態 API</h2>
            <ul>
              <li>公開資料不需要資料庫</li>
              <li>CDN 友好、成本低</li>
              <li>AI / 第三方可直接抓 JSON 分片</li>
            </ul>

            <h2>建議抓取方式</h2>
            <ol>
              <li>一般車牌查詢先用 <code>/api/search</code></li>
              <li>批量同步先抓 <code>issues.manifest.json</code>，取得期數與 shard 路徑</li>
              <li>需要哪一期就抓哪一期的 <code>issues/{date}.json</code></li>
            </ol>

            <h2>OpenAPI</h2>
            <p>資料 schema 以 <code>api/openapi.yaml</code> 為準。</p>

          `,
        },
        en: {
          pageTitle: "API Docs | Plate.hk",
          title: "API Docs",
          back: "← Back to Home",
          updated: "Last updated: 26 Aug 2026",
          statusLoading: "Loading the latest data status…",
          statusError: "Live status is temporarily unavailable. The API remains available through the endpoints below.",
          statusLabels: ["API index", "Audit run", "Search rows"],
          html: `
            <p>Plate.hk provides a public JSON search API for Hong Kong plate-auction records. It is an independent data index, not a Hong Kong Government or Transport Department API; the original Transport Department document prevails if data differs.</p>
            <div class="info-live-status" id="apiStatus" aria-live="polite"><div><strong>Loading the latest data status…</strong></div></div>
            <h2>Search by plate</h2>
            <div class="box">
              <div><code>GET https://plate.hk/api/search?dataset=all&amp;q=88&amp;page=1&amp;page_size=20&amp;sort=amount_desc</code></div>
            </div>
            <p><code>dataset</code> accepts <code>all</code>, <code>pvrm</code>, <code>tvrm_physical</code>, <code>tvrm_eauction</code>, or <code>tvrm_legacy</code>; <code>q</code> is the plate query. The response includes <code>total</code>, paging fields, and auction-result rows.</p>
            <p><code>curl -G 'https://plate.hk/api/search' --data-urlencode 'dataset=all' --data-urlencode 'q=88' --data-urlencode 'page_size=20'</code></p>
            <p>To browse without a query and sort by date, amount, or plate, use <code>GET /api/results?dataset=all&amp;sort=date_desc&amp;page=1</code>.</p>

            <h2>Limits and errors</h2>
            <ul>
              <li><code>page_size</code> must be between 1 and 200. Out-of-range values return <code>400 invalid_paging</code>.</li>
              <li>Public read endpoints are rate limited. On <code>429 rate_limited</code>, wait for the <code>Retry-After</code> interval before retrying.</li>
            </ul>

            <h2>Static data entrypoint</h2>
            <p><code>Base URL: https://plate.hk/api/v1</code></p>
            <div class="box">
              <div><code>GET https://plate.hk/api/v1/index.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/issues.manifest.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/issues/{YYYY-MM-DD}.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/auctions.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/results.chunks.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/preset.amount_desc.top1000.json</code></div>
              <div><code>GET https://plate.hk/api/v1/tvrm_physical/...</code></div>
              <div><code>GET https://plate.hk/api/v1/tvrm_eauction/...</code></div>
              <div><code>GET https://plate.hk/api/v1/tvrm_legacy/...</code></div>
            </div>

            <p>The camera search page also uses a dynamic server-side vision endpoint that receives only the cropped plate region inside the guide frame:</p>
            <div class="box">
              <div><code>POST https://plate.hk/api/vision_plate</code></div>
              <div><code>{"image_data_url":"data:image/jpeg;base64,...","lang":"en"}</code></div>
            </div>
            <p>This endpoint is separate from the public static Open Data API. It requires a server-side OpenAI key and returns a single plate recognition result.</p>

            <p><code>tvrm_legacy</code> now keeps only the <code>1973-2006</code> year-range dataset. Exact-dated workbook rows from <code>2007+</code> have been merged into the dated <code>tvrm_physical</code> / <code>tvrm_eauction</code> issues.</p>
            <p>The homepage <code>All Plates</code> search also uses a small set of static helper files and hot-query cache; if you want similar behavior, fetch:</p>
            <div class="box">
              <div><code>GET https://plate.hk/data/all.search.meta.json</code></div>
              <div><code>GET https://plate.hk/data/all.prefix1.top200.json</code></div>
              <div><code>GET https://plate.hk/data/hot_search/manifest.json</code></div>
            </div>
            <p>Issue deep links use query parameters such as <code>./index.html?d=tvrm_physical&amp;issue=2026-03-01</code>; embedded links can reuse the same format.</p>

            <h2>Why Static API</h2>
            <ul>
              <li>No database is required for public data</li>
              <li>CDN-friendly and low cost</li>
              <li>AI/third parties can fetch shards directly</li>
            </ul>

            <h2>Suggested Fetch Flow</h2>
            <ol>
              <li>Use <code>/api/search</code> for normal plate lookups</li>
              <li>For bulk sync, fetch <code>issues.manifest.json</code> to get all issue shards</li>
              <li>Fetch only the specific <code>issues/{date}.json</code> you need</li>
            </ol>

            <h2>OpenAPI</h2>
            <p>Schema is defined in <code>api/openapi.yaml</code>.</p>

          `,
        },
      };

      const params = new URLSearchParams(location.search);
      let lang = params.get("lang") === "en" ? "en" : "zh";
      const titleEl = document.getElementById("title");
      const updatedEl = document.getElementById("updated");
      const contentEl = document.getElementById("content");
      const backLinkEl = document.getElementById("backLink");

      function siteOrigin() {
        return typeof location !== "undefined" && location.origin
          ? location.origin
          : "https://plate.hk";
      }

      async function renderStatus(t) {
        const status = document.getElementById("apiStatus");
        if (!status) return;
        try {
          const [indexResponse, auditResponse] = await Promise.all([
            fetch("./api/v1/index.json", { cache: "no-store" }),
            fetch("./data/audit.json", { cache: "no-store" }),
          ]);
          if (!indexResponse.ok || !auditResponse.ok) throw new Error(`HTTP ${indexResponse.status}/${auditResponse.status}`);
          const [index, audit] = await Promise.all([indexResponse.json(), auditResponse.json()]);
          const searchRows = Number(index.datasets?.all?.total_rows || 0);
          const values = [index.generated_at || "—", audit.generated_at || "—", searchRows.toLocaleString("en-US")];
          status.innerHTML = t.statusLabels.map((label, index) => `<div><span>${label}</span><strong>${values[index]}</strong></div>`).join("");
        } catch {
          status.innerHTML = `<div><strong>${t.statusError}</strong></div>`;
        }
      }

      function render() {
        const t = I18N[lang];
        document.documentElement.lang = lang === "en" ? "en" : "zh-HK";
        document.title = t.pageTitle;
        titleEl.textContent = t.title;
        updatedEl.textContent = t.updated;
        contentEl.innerHTML = t.html.replaceAll("https://plate.hk", siteOrigin());
        backLinkEl.textContent = t.back;
        backLinkEl.href = `./index.html?lang=${lang}`;
        renderStatus(t);
      }

      render();
    
