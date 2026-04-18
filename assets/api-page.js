      const I18N = {
        zh: {
          pageTitle: "API 文檔 | Plate.hk",
          title: "API 文檔",
          back: "← 返回首頁",
          updated: "最後更新：2026年3月20日",
          html: `
            <p>本專案提供靜態 Open Data API（適合純靜態部署與 CDN）。</p>
            <p><code>Base URL: https://plate.hk/api/v1</code></p>
            <div class="box">
              <div><code>GET https://plate.hk/api/v1/index.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/issues.manifest.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/issues/{YYYY-MM-DD}.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/auctions.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/preset.amount_desc.top1000.json</code></div>
              <div><code>GET https://plate.hk/api/v1/tvrm_physical/...</code></div>
              <div><code>GET https://plate.hk/api/v1/tvrm_eauction/...</code></div>
              <div><code>GET https://plate.hk/api/v1/tvrm_legacy/...</code></div>
            </div>

            <p>另外，相機辨識頁會使用站內動態 API，把白框內裁切後的車牌圖像送到伺服器端 vision 模型判讀：</p>
            <div class="box">
              <div><code>POST https://plate.hk/api/vision_plate.php</code></div>
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
              <li>不需要資料庫、不需要伺服器</li>
              <li>CDN 友好、成本低</li>
              <li>AI / 第三方可直接抓 JSON 分片</li>
            </ul>

            <h2>建議抓取方式</h2>
            <ol>
              <li>先抓 <code>issues.manifest.json</code>，取得期數與 shard 路徑</li>
              <li>需要哪一期就抓哪一期的 <code>issues/{date}.json</code></li>
              <li>需要搜尋時自行建立索引（以 normalized plate 為 key）</li>
            </ol>

            <h2>OpenAPI</h2>
            <p>資料 schema 以 <code>api/openapi.yaml</code> 為準。</p>

          `,
        },
        en: {
          pageTitle: "API Docs | Plate.hk",
          title: "API Docs",
          back: "← Back to Home",
          updated: "Last updated: 20 Mar 2026",
          html: `
            <p>This project ships a static Open Data API suitable for CDN/static hosting.</p>
            <p><code>Base URL: https://plate.hk/api/v1</code></p>
            <div class="box">
              <div><code>GET https://plate.hk/api/v1/index.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/issues.manifest.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/issues/{YYYY-MM-DD}.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/auctions.json</code></div>
              <div><code>GET https://plate.hk/api/v1/pvrm/preset.amount_desc.top1000.json</code></div>
              <div><code>GET https://plate.hk/api/v1/tvrm_physical/...</code></div>
              <div><code>GET https://plate.hk/api/v1/tvrm_eauction/...</code></div>
              <div><code>GET https://plate.hk/api/v1/tvrm_legacy/...</code></div>
            </div>

            <p>The camera search page also uses a dynamic server-side vision endpoint that receives only the cropped plate region inside the guide frame:</p>
            <div class="box">
              <div><code>POST https://plate.hk/api/vision_plate.php</code></div>
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
              <li>No database, no server</li>
              <li>CDN-friendly and low cost</li>
              <li>AI/third parties can fetch shards directly</li>
            </ul>

            <h2>Suggested Fetch Flow</h2>
            <ol>
              <li>Fetch <code>issues.manifest.json</code> to get all issue shards</li>
              <li>Fetch only the specific <code>issues/{date}.json</code> you need</li>
              <li>Build your own index for search (normalized plate as key)</li>
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

      function render() {
        const t = I18N[lang];
        document.documentElement.lang = lang === "en" ? "en" : "zh-HK";
        document.title = t.pageTitle;
        titleEl.textContent = t.title;
        updatedEl.textContent = t.updated;
        contentEl.innerHTML = t.html.replaceAll("https://plate.hk", siteOrigin());
        backLinkEl.textContent = t.back;
        backLinkEl.href = `./index.html?lang=${lang}`;
      }

      render();
    
