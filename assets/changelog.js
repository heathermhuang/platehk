      const I18N = {
        zh: {
          pageTitle: "更新日誌 | PVRM",
          title: "更新日誌",
          back: "← 返回首頁",
          updated: "最後更新：2026年4月18日",
          items: [
            {
              date: "2026-04-18",
              title: "Agent discovery、Markdown negotiation 與 WebMCP 上線",
              points: [
                "首頁正式支援 `Accept: text/markdown`，Agent 請求現在可直接取得機器友善的 Markdown 版本，不再只能讀 HTML。",
                "新增 discovery `Link` headers、`/.well-known/api-catalog`、Agent Skills index、`agent.md` 與 `skill.md`，讓公開資料入口更容易被 AI 工具發現。",
                "首頁註冊 4 個 WebMCP 工具（資料集、搜尋、期數列表、單一期數查詢），讓支援 `navigator.modelContext` 的代理可直接調用 Plate.hk。",
                "重新部署後，Is It Agent Ready 掃描結果由 Level 2 提升到 Level 4（Agent-Integrated）。"
              ]
            },
            {
              date: "2026-03-26",
              title: "Cloudflare Workers 全站運行打通",
              points: [
                "Cloudflare Workers 臨時站已可直接提供前端與公開 API，不再依賴 DreamHost 的網站 runtime。",
                "整理 Worker 靜態資料輸出與相容路由，讓搜尋、期數與歷史資料都能在新環境正常運作。",
                "同步收掉殘留的舊回源設定，讓後續正式切換主域名更簡單。",
                "海報 QR 改為站內生成，並再收斂一輪手機版搜尋與結果排版。"
              ]
            },
            {
              date: "2026-03-24",
              title: "Cloudflare Workers 遷移腳手架與交接文件",
              points: [
                "新增 Cloudflare Workers 版路由與靜態資產發布腳手架，為後續遷移做好結構準備。",
                "整理 Claude Code handover 文件，說明現況、目標架構、環境變數與後續驗證重點。",
                "同步把 Cloudflare build 納入本地檢查流程，降低後續接手時的整合風險。"
              ]
            },
            {
              date: "2026-03-23",
              title: "安全與公開 API 保護更新",
              points: [
                "進一步加強公開搜尋與相機辨識的濫用防護，降低匿名批量請求的成本。",
                "改善健康檢查與安全事件記錄，讓異常流量與上游失敗更容易追蹤。",
                "同步優化前端錯誤提示，安全控制觸發時會以較清楚的方式告知用戶。"
              ]
            },
            {
              date: "2026-03-20",
              title: "TVRM 歷史資料與正式日期分期整理",
              points: [
                "把較新的傳統車牌正式拍賣日期資料併回日期分期，讓 2007 年後結果可按實際拍賣日瀏覽。",
                "歷史年份分段資料集收回為 1973-2006，角色更清晰，不再混入已有正式日期的記錄。",
                "同步重建資料輸出與 API，讓前端、公開資料和後台同步對齊。"
              ]
            },
            {
              date: "2026-03-18",
              title: "Vision OCR 與網站安全基礎補強",
              points: [
                "加強相機辨識與公開 API 的安全控制，降低異常來源與高頻請求對系統的影響。",
                "補上敏感檔案保護、設定樣板整理與更穩的上游連線安全。",
                "加入安全文檔、掃描與事件記錄基礎，讓後續安全維護更可持續。"
              ]
            },
            {
              date: "2026-03-16",
              title: "API-only 架構上線，並補做速度 / SEO / 安全強化",
              points: [
                "網站搜尋與期數瀏覽正式改為 API 驅動，使用體驗更一致，也減少前端一次載入大量資料的情況。",
                "同步補做速度、SEO 與安全優化，包括熱門查詢加速、搜尋引擎索引整理，以及公開 API 的保護加強。",
                "相機辨識功能也在這一階段成形，後續再逐步演進成較穩定的 AI 車牌識別流程。"
              ]
            },
            {
              date: "2026-03-14",
              title: "首頁與結果頁進入 2.0 第一階段",
              points: [
                "首頁與結果頁重新整理資訊層級，搜尋、資料集切換、期數入口與規則說明的角色更清楚。",
                "一旦開始搜尋或進入期數頁，導覽內容會自動收起，讓結果更快進入畫面。",
                "結果頁也加強了模式區分，跨資料集搜尋和單一期數瀏覽更容易理解。"
              ]
            },
            {
              date: "2026-03-13",
              title: "全站 QA 整理、期數頁強化與搜尋/審核優化",
              points: [
                "首頁預設改為跨資料集搜尋，並補上聚合去重，讓結果更直觀。",
                "期數頁與結果表的可用性一起提升，包括可點擊日期、分類欄、期數資訊面板與更穩定的深連結。",
                "資料審核頁與本地發布流程也同步整理，讓日後更新和驗證更順。"
              ]
            },
            {
              date: "2026-03-12",
              title: "回補 2010-12-19 官方 TVRM 結果 PDF",
              points: [
                "補回 2010年12月19日的官方傳統車牌拍賣結果 PDF，讓這一期重新回到資料庫中。",
                "同步回填該期成交記錄與拍賣總額，並重建相關輸出。"
              ]
            },
            {
              date: "2026-03-12",
              title: "TVRM 缺失官方 PDF 連結回補",
              points: [
                "回補多批缺失的官方 PDF 連結，讓歷史期數的來源資料更完整。",
                "也順手清理了誤入資料集的錯誤期數，讓公開資料鏡像更準確。"
              ]
            },
            {
              date: "2026-03-04",
              title: "搜尋服務穩定性修復（API 健康檢查與回退）",
              points: [
                "修復 API-first 搜尋在不同主機設定下的 API 路徑相容問題。",
                "健康檢查改為含資料庫連線檢測：若 DB 不可用，API 不再誤判為可用。",
                "當 API 異常時，前端會自動回退到本機分片搜尋，不再直接顯示 0 筆結果。"
              ]
            },
            {
              date: "2026-03-02",
              title: "TVRM 實體歷史期數回補 + 新春🧧標示修復",
              points: [
                "重建 TVRM 實體資料分片，恢復 2021 年前大量遺漏期數（issues 由 265 回升到 306）。",
                "修復 2026年3月1日新春拍賣 metadata：來源 PDF 連結恢復為 TD 官方網址，並正確標示為 🧧。",
                "補齊 8 份可用但未落地的 TVRM PDF（含 2024/2025 手冊與 2026-03-01 新春），消除 audit 的 missing/壞檔。",
                "強化資料建置邏輯：即使個別 PDF 暫時未解析出車牌，仍保留該期 metadata，避免歷史期數在前端消失。",
                "修正 audit 統計口徑：僅計入有實際 PDF URL 的檔案，避免空 URL 被誤計為缺失。",
                "修復 audit 總額缺失顯示：先從解析資料按期加總回填；僅對「當期只有拍賣清單、無成交明細」顯示不適用。",
                "更新 TVRM 自動更新腳本為增量優先，並加入保護機制：若增量結果導致歷史期數縮水，會自動觸發修復解析，避免舊期數被覆蓋刪除。",
                "已補上拍牌易最新一期（2026年2月26日至3月2日）並完成站點資料刷新。",
                "SEO 優化：補上 canonical / meta description / Open Graph / Twitter 卡片、首頁結構化資料（WebSite + SearchAction），並更新 robots 與 sitemap 到 plate.hk。",
                "頁尾新增反饋表格連結（Google Form），方便用戶提交意見。",
                "重新產生 public API 與 audit/完整性檢查，三套資料均通過驗證（目前 PDF 622 / 622 可用）。"
              ]
            },
            {
              date: "2026-03-02",
              title: "2026年3月1日新春拍賣已自動同步（Cron 流程修復）",
              points: [
                "PVRM 自動更新已抓到 2026年3月1日新春拍賣 PDF（lny_auction_result_20260301_CHI.pdf）。",
                "修復 TVRM 自動更新：cron 現在會先同步 LNY URL 到 TVRM 清單（加入 sync_lny_urls_to_tvrm_physical.py），確保新春期數不會漏掉。",
                "修復 TVRM 對 LNY 混合 PDF 的解析：會使用混合解析器抽出傳統車牌資料；2026-03-01 已寫入 34 筆 TVRM 結果。",
                "修復全日拍賣總額擷取對 HK$ 格式的相容性；2026-03-01 的總額現為 HK$29,727,000。",
                "回補早期新春混合期數（2008、2009、2010、2011）在 TVRM 被誤歸到空期/1970 的問題，現已恢復正確日期與期數。"
              ]
            },
            {
              date: "2026-03-02",
              title: "Liquid Glass 視覺更新",
              points: [
                "首頁、落地頁、審計頁、更新日誌、條款、私隱、API 與 MCP 文件升級為 liquid glass 風格。",
                "加強玻璃質感：多層漸層背景、半透明卡片、內高光、飽和度與模糊效果。",
                "保留原有資訊架構與互動邏輯，只更新視覺層。"
              ]
            },
            {
              date: "2026-02-28",
              title: "全站視覺升級（統一高級科技風）",
              points: [
                "首頁、審計頁、更新日誌、條款、私隱、API 文檔與 MCP 文件改為統一設計語言（Space Grotesk + Noto Sans HK）。",
                "整站改用玻璃卡片、柔和漸層背景、品牌一致的按鈕與邊框圓角，維持原本簡潔結構但提升專業感。",
                "Service Worker 快取版本更新為 v53，避免舊樣式被快取導致部署後未即時生效。"
              ]
            },
            {
              date: "2026-02-28",
              title: "分享海報與搜尋穩定性修復",
              points: [
                "新增結果列「來源/分享」操作：PDF icon 開原始來源、分享 icon 生成可下載海報。",
                "分享海報重做為正方形版式，強化單排/雙排車牌視覺，加入網站品牌區與 QR Code（連到 https://plate.hk）。",
                "調整海報中英標題、資料欄位與來源區排版，並優化分享 icon 清晰度與尺寸。",
                "修復高命中關鍵字搜尋（如 SU / MY / HK）可能卡住的問題：加入請求超時、壞分片跳過、型別安全排序與主線程讓出。",
                "新增 Web Worker 搜尋路徑（assets/search.worker.js），將分片掃描與排序移至背景執行，避免前端假死。"
              ]
            },
            {
              date: "2026-02-28",
              title: "搜尋體驗與快取策略更新（plate.hk）",
              points: [
                "搜尋框輸入改為即時大寫正規化，並維持 I/O 字元對應（I→1、O→0）。",
                "搜尋進行中新增可視化進度（已掃描期數 / 總期數），方便辨識資料仍在載入。",
                "搜尋結果排序加入 exact match 優先規則（例如搜尋 SU 時，SU 會優先顯示）。",
                "API 文檔改為完整部署網址（https://plate.hk/api/v1/...）。",
                "Service Worker 的資料檔快取策略改為 network-first（離線回退 cache），降低資料更新後顯示舊 JSON 的風險。"
              ]
            },
            {
              date: "2026-02-23",
              title: "TVRM 資料日期修正與 PDF 回填",
              points: [
                "修正部分舊 TVRM PDF 檔名誤導造成的期數日期錯誤，改以 PDF 內文日期為準（支援中英格式）。",
                "新增 TVRM（實體）PDF 枚舉與回填流程，補回缺漏的歷史檔案。",
                "更新資料審核報告（audit.json）與靜態 API（/api/v1/）。"
              ]
            },
            {
              date: "2026-02-15",
              title: "新增資料審核頁面與開放 API / MCP 規格",
              points: [
                "新增資料審核頁（audit.html）與 audit.json：列出所有 PDF、來源連結、期數、分類、清洗車牌數、總額與狀態。",
                "修復部分舊 PDF 的（n/a）欄位因亂碼導致被誤當成雙行內容的問題，避免污染雙行資料。",
                "新增靜態開放 API（/api/v1/...），提供 issues 分片、manifest、每期 metadata 與 top1000，並提供 OpenAPI 描述檔。",
                "新增 MCP 服務設計文件（tools 介面、快取與索引建議），方便 AI 與第三方程式存取。",
                "新增 MySQL 伺服器端搜尋 API（/api/search，以 shared host 的 PHP 提供），並在前端偵測可用時優先使用，避免搜尋時載入大量分片 JSON。",
                "新增 CLI 同步腳本（api/admin/sync.php）：上傳新靜態 JSON 後可由 DreamHost cron 自動 upsert 到 MySQL，免去手動匯入整包 SQL。",
                "修復 MySQL schema 在 utf8mb4 下因 UNIQUE KEY 含超長 pdf_url 導致的 #1071 key too long（改用 pdf_url_hash）。",
                "資料審核頁不再輸出本機絕對路徑（例如 /Users/...），避免洩露個人資訊。 ",
                "改善 audit 頁面在超長檔名下的排版，並修復中英文切換。"
              ]
            },
            {
              date: "2026-02-14",
              title: "修復傳統車牌實體拍賣「期數日期」誤判（避免被歸到今天）",
              points: [
                "修復部分舊 PDF 檔名不含 YYYYMMDD，導致系統無法判斷日期並錯誤歸到「今天」期數的問題。",
                "新增從 PDF 原始網址解析日期（支援 1-5-2011、11.12.2011 等格式），並在重建資料時清理過期的錯誤期數分片。"
              ]
            },
            {
              date: "2026-02-14",
              title: "修復 TVRM（實體）誤收錄 PVRM PDF 的問題",
              points: [
                "修復部分 /filemanager/common/ 檔名相近的「拍賣結果 handout」PDF 實際為自訂車牌（PVRM）結果，卻被誤收錄到傳統車牌（TVRM）資料集。",
                "現在會先從 PDF 標題辨識「Traditional / 傳統」與「Personalized / 自訂」，避免不同資料集互相污染。"
              ]
            },
            {
              date: "2026-02-14",
              title: "新增農曆新年拍賣標示與解析（混合傳統/自訂）",
              points: [
                "新增對「農曆新年拍賣」混合結果 PDF 的解析：同一份 PDF 內同時包含傳統（TVRM）與自訂（PVRM）車牌。",
                "系統會按格式自動分類並分別收錄到 PVRM 與 TVRM（實體拍賣）資料集中，並在期數下拉菜單標注「（農曆新年拍賣）」。"
              ]
            },
            {
              date: "2026-02-14",
              title: "修復農曆新年拍賣資料清洗錯誤",
              points: [
                "修復把「全日拍賣所得款項 / Total sale proceeds」誤當車牌的問題（例如 2011-02-20）。",
                "修復把拍品編號與車牌合併成「19 18」等錯誤字串的問題（例如 2008-02-23 應為車牌 18）。"
              ]
            },
            {
              date: "2026-02-14",
              title: "農曆新年拍賣期數標示改為🧧",
              points: [
                "為避免期數顯示過長，將「（農曆新年拍賣）」標注改為🧧圖示。"
              ]
            },
            {
              date: "2026-02-14",
              title: "修復雙行車牌顯示空格問題",
              points: [
                "修復部分 PDF 文字抽取時把雙行車牌拆成「B A B A」等帶空格字元序列，導致網頁顯示成「BA B A」。",
                "雙行資料現統一正規化為兩行陣列（top/bottom），並移除行內多餘空格。"
              ]
            },
            {
              date: "2026-02-14",
              title: "傳統車牌實體拍賣歷史擴展至2010年",
              points: [
                "以 Wayback Machine 列舉舊版檔名並回填仍可存取的運輸署 PDF，補回早期（2010–2012）實體拍賣結果。",
                "新增支援多種舊檔名格式（例如「tvrm auction handout_YYYYMMDD」、「auction result handout DD-MM-YYYY」等），方便往後持續回填。"
              ]
            },
            {
              date: "2026-02-14",
              title: "拍牌易期數顯示優化",
              points: [
                "拍牌易期數日期範圍改為精簡格式（例如「2026年2月5-9日」，跨月則顯示「2026年3月29日-4月2日」。）。",
                "修復搜尋結果超過 200 筆時下一頁無法切換的問題。",
                "新增顯示拍賣總額：實體拍賣顯示「全日拍賣總額」、拍牌易顯示「本期拍賣總額」（取自原始 PDF）。"
              ]
            },
            {
              date: "2026-02-14",
              title: "Header 與簡介文案",
              points: [
                "語言切換移至頁面上方 header，filter 區塊只保留搜尋與篩選。",
                "filter 下方新增各資料集的簡介文字（自訂車牌 / 傳統車牌實體 / 拍牌易）。"
              ]
            },
            {
              date: "2026-02-13",
              title: "新增傳統車牌拍賣搜尋（實體 / 拍牌易網上）",
              points: [
                "新增傳統車牌（TVRM）資料集，分為實體拍賣與「拍牌易」網上拍賣兩個來源。",
                "新增資料集切換下拉選單，並沿用期數篩選、金額排序、分片載入與 PDF 驗證連結。",
                "修復因同日中英文 PDF 同時存在導致結果重複顯示的問題（同一期自動去重並選用優先 PDF）。"
              ]
            },
            {
              date: "2026-02-13",
              title: "分片載入與首頁性能優化",
              points: [
                "新增按期數分片資料（issues.manifest + issues/*.json）。",
                "首頁預設金額排序改為先顯示預計算 top1000，再背景完成完整排序。",
                "加入搜尋 debounce（250ms）與下一頁分片預載。",
                "加入資料完整性驗證腳本，確保未來更新一致性。"
              ]
            },
            {
              date: "2026-02-12",
              title: "資料準確性修復",
              points: [
                "修復 2009-03-21 反向金額編碼解析問題。",
                "修復 2026-01-17 個別車牌（例如 0T0）金額錯配問題。",
                "全庫金額缺失降為 0。"
              ]
            },
            {
              date: "2026-02-12",
              title: "功能與界面更新",
              points: [
                "新增中英切換、官方來源連結、最後更新日期、聲明。",
                "新增條款與私隱政策獨立頁（按語言進入對應版本）。",
                "新增車牌風格 logo / favicon，並優化 footer 資訊結構。",
                "新增全日拍賣所得款項顯示（按期數）。"
              ]
            },
            {
              date: "2026-02-11",
              title: "網站上線初版",
              points: [
                "完成運輸署歷史拍賣 PDF 抓取、解析與可搜尋網站。",
                "支援單行/雙行查詢、成交金額、原始 PDF 驗證連結。"
              ]
            }
          ]
        },
        en: {
          pageTitle: "Changelog | PVRM",
          title: "Changelog",
          back: "← Back to Home",
          updated: "Last updated: 18 Apr 2026",
          items: [
            {
              date: "2026-04-18",
              title: "Agent discovery, Markdown negotiation, and WebMCP shipped",
              points: [
                "The homepage now supports `Accept: text/markdown`, so agents can request a machine-friendly Markdown representation instead of parsing only HTML.",
                "Added discovery `Link` headers, `/.well-known/api-catalog`, an Agent Skills index, plus `agent.md` and `skill.md` so the public data surface is easier for AI tooling to discover.",
                "Registered 4 WebMCP tools on the homepage for dataset discovery, search, issue listing, and single-issue lookup through `navigator.modelContext`.",
                "After redeploying, the Is It Agent Ready score moved from Level 2 to Level 4 (Agent-Integrated)."
              ]
            },
            {
              date: "2026-03-26",
              title: "Cloudflare Workers full-site runtime completed",
              points: [
                "The Cloudflare Workers staging site can now serve both the frontend and the public API without relying on DreamHost at runtime.",
                "Cleaned up the Worker data path and compatibility routes so search, issue pages, and historical data all work in the new environment.",
                "Removed the remaining fallback proxy configuration to make the future primary-domain cutover simpler."
              ]
            },
            {
              date: "2026-03-24",
              title: "Cloudflare Workers migration scaffold and handover",
              points: [
                "Added a Cloudflare Workers route and static publishing scaffold to prepare the project for migration.",
                "Prepared a Claude Code handover document covering the current state, target architecture, environment variables, and next verification steps.",
                "Wired the Cloudflare build path into local checks to reduce integration risk during the next handoff."
              ]
            },
            {
              date: "2026-03-23",
              title: "Security and public API protection update",
              points: [
                "Further tightened abuse controls around public search and camera OCR to make anonymous bulk traffic more expensive.",
                "Improved health checks and security telemetry so unusual traffic and upstream failures are easier to spot.",
                "Updated frontend error handling so security controls fail more clearly for users."
              ]
            },
            {
              date: "2026-03-20",
              title: "TVRM historical data and dated issues reorganized",
              points: [
                "Merged newer traditional VRM rows back into dated issue pages so 2007 onward results can be browsed by actual auction date.",
                "Narrowed the historical year-range dataset back to 1973-2006 so its role is clearer and it no longer overlaps with dated records.",
                "Rebuilt the related data outputs and API payloads so the frontend and public data stay aligned."
              ]
            },
            {
              date: "2026-03-18",
              title: "Vision OCR and core site security hardening",
              points: [
                "Strengthened the camera OCR path and public APIs against invalid origins, burst traffic, and unsafe request patterns.",
                "Tightened sensitive-file protection, config templates, and upstream request safety.",
                "Added the first layer of security documentation, scanning, and runtime event logging for ongoing maintenance."
              ]
            },
            {
              date: "2026-03-14",
              title: "Homepage and results page enter 2.0 phase one",
              points: [
                "Restructured the homepage and results layout so search, dataset switching, issue entry, and auction guidance each have a clearer role.",
                "Added a search-focus mode that collapses guide content once the user starts searching or enters an issue page.",
                "Made cross-dataset search and single-issue browsing easier to distinguish in the results area."
              ]
            },
            {
              date: "2026-03-13",
              title: "Site-wide QA pass, stronger issue view, and search/audit refinements",
              points: [
                "Made `All Plates` the default search scope and added cross-dataset deduplication to keep aggregate results cleaner.",
                "Improved issue-page navigation and result-table usability, including clickable dates, clearer category display, and more stable deep links.",
                "Refined the audit page and local release workflow so QA and publishing are easier to repeat."
              ]
            },
            {
              date: "2026-03-12",
              title: "Backfilled the official 2010-12-19 TVRM result PDF",
              points: [
                "Recovered the official TD result PDF for 19 Dec 2010 and restored that traditional VRM issue to the dataset.",
                "Backfilled the parsed sale rows and proceeds, then rebuilt the related public outputs."
              ]
            },
            {
              date: "2026-03-12",
              title: "TVRM official PDF URL backfill for missing issues",
              points: [
                "Recovered many missing official PDF URLs for historical TVRM issues, improving source completeness across the archive.",
                "Also removed a mistaken issue entry that turned out to be a press release date rather than a real auction result."
              ]
            },
            {
              date: "2026-03-04",
              title: "Search reliability fixes (API health check + fallback)",
              points: [
                "Fixed API-first route compatibility across different hosting/rewrite setups.",
                "Health checks now include a database connectivity probe, so API readiness is no longer over-reported.",
                "When API search fails, frontend now falls back to local shard search instead of directly showing zero results."
              ]
            },
            {
              date: "2026-03-02",
              title: "TVRM physical backfill + LNY 🧧 flag fixes",
              points: [
                "Rebuilt TVRM physical shards and restored many missing pre-2021 issues (issue count recovered from 265 to 306).",
                "Fixed 1 Mar 2026 LNY metadata: source PDF now points to the official TD URL and is correctly marked with 🧧.",
                "Backfilled 8 TVRM PDFs that were reachable but not stored locally (including 2024/2025 handouts and 2026-03-01 LNY), removing audit missing/broken entries.",
                "Strengthened dataset build behavior: even when a PDF yields zero parsed rows, its issue metadata is preserved so historical periods do not disappear in the UI.",
                "Fixed audit counting logic to include only actual non-empty PDF URLs, so empty URL placeholders are no longer counted as missing files.",
                "Fixed audit total-proceeds gaps by backfilling per-issue sums from parsed rows; only handout-only issues are now shown as N/A.",
                "Updated TVRM auto-update to incremental-first with a safety fallback: if issue counts shrink after an incremental run, a repair parse is triggered automatically to prevent historical loss.",
                "Added the latest E-Auction issue (26 Feb to 2 Mar 2026) and refreshed site data.",
                "SEO optimization: added canonical/meta description/Open Graph/Twitter tags, homepage structured data (WebSite + SearchAction), and updated robots plus sitemap to plate.hk.",
                "Added a footer feedback form link (Google Form) to collect user suggestions.",
                "Regenerated public API plus audit/integrity outputs; all three datasets pass verification (current PDF availability: 622 / 622)."
              ]
            },
            {
              date: "2026-03-02",
              title: "2026-03-01 LNY auction synced automatically (cron flow fixed)",
              points: [
                "PVRM auto-update now picks up the 1 Mar 2026 LNY PDF (lny_auction_result_20260301_CHI.pdf).",
                "Fixed TVRM auto-update flow: cron now syncs LNY URLs into TVRM inventory first (via sync_lny_urls_to_tvrm_physical.py), preventing missed LNY issues.",
                "Fixed TVRM parsing for LNY mixed PDFs by using the mixed parser path; 34 TVRM rows are now ingested for 2026-03-01.",
                "Fixed total-proceeds extraction for HK$ formatted lines; 2026-03-01 proceeds are now parsed as HK$29,727,000.",
                "Restored early LNY mixed issues (2008, 2009, 2010, 2011) that were previously mis-grouped into empty/1970 issues in TVRM."
              ]
            },
            {
              date: "2026-03-02",
              title: "Liquid glass visual refresh",
              points: [
                "Applied a liquid glass visual style across Home, Landing, Audit, Changelog, Terms, Privacy, API, and MCP pages.",
                "Strengthened glass treatment with layered gradients, translucent surfaces, inner highlights, and higher blur/saturation.",
                "Kept existing information architecture and interaction behavior unchanged."
              ]
            },
            {
              date: "2026-02-28",
              title: "Global visual refresh (premium tech style)",
              points: [
                "Unified visual system across Home, Audit, Changelog, Terms, Privacy, API Docs, and MCP Docs (Space Grotesk + Noto Sans HK).",
                "Adopted glassy cards, layered gradients, consistent controls, and cleaner spacing while keeping the original minimalist information structure.",
                "Bumped Service Worker cache version to v53 so newly deployed styling is not hidden by stale cached assets."
              ]
            },
            {
              date: "2026-02-28",
              title: "Share poster revamp and search stability fixes",
              points: [
                "Added row-level \"Source / Share\" actions: PDF icon opens source file, Share icon generates a downloadable poster.",
                "Redesigned the share poster to a square layout with stronger single/double-line plate styling, branded source block, and QR code linking to https://plate.hk.",
                "Refined poster spacing/typography for bilingual labels and improved share icon legibility/size.",
                "Fixed search freezes on high-hit queries (for example SU / MY / HK) via request timeouts, bad-shard skip logic, type-safe sorting, and cooperative yielding.",
                "Added a Web Worker search path (assets/search.worker.js) to move shard scanning/sorting off the main thread."
              ]
            },
            {
              date: "2026-02-28",
              title: "Search UX and cache strategy updates (plate.hk)",
              points: [
                "Search input now normalizes to uppercase in real time while keeping I/O mapping (I->1, O->0).",
                "Added visible search progress (scanned issues / total issues) while shards are still loading.",
                "Search results now prioritize exact plate matches first (for example, querying SU ranks SU first).",
                "API docs now show full deployed endpoints (https://plate.hk/api/v1/...).",
                "Service worker data caching switched to network-first with cache fallback to reduce stale JSON risk after data updates."
              ]
            },
            {
              date: "2026-02-23",
              title: "TVRM date corrections and PDF backfill",
              points: [
                "Fixed legacy TVRM issues where misleading filenames caused wrong issue dates; PDF content dates now take precedence (Chinese and English formats).",
                "Added TVRM (physical) PDF enumeration and backfill to recover missing historical files.",
                "Refreshed audit report (audit.json) and static API (/api/v1/)."
              ]
            },
            {
              date: "2026-02-15",
              title: "Added data audit page + public API / MCP spec",
              points: [
                "Added Data Audit page (audit.html) and audit.json to list all PDFs, source links, issues, categories, parsed counts, proceeds, and status.",
                "Fixed legacy PDF (n/a) cells being extracted as garbled text and incorrectly treated as double-line content.",
                "Added a static public API under /api/v1/... (issue shards, manifests, metadata, presets) with an OpenAPI spec.",
                "Added MCP service design document (tool surface + caching/indexing guidance) to make AI/third-party integration easier.",
                "Added a MySQL-backed server-side search API (/api/search) implemented via PHP for shared hosting, plus frontend auto-detection via /api/health to avoid loading many shards during search.",
                "Added a CLI sync script (api/admin/sync.php): after uploading new static JSON, DreamHost cron can upsert new issues into MySQL automatically (no full SQL re-import needed).",
                "Fixed a MySQL utf8mb4 schema issue where a UNIQUE KEY with long pdf_url exceeded index length limits (#1071) by switching to pdf_url_hash.",
                "Removed absolute local filesystem paths (e.g. /Users/...) from the audit report to avoid leaking personal info.",
                "Improved audit page layout for very long PDF filenames and fixed language switching."
              ]
            },
            {
              date: "2026-02-14",
              title: "Fixed TVRM (Physical) issue date extraction (prevented grouping into \"today\")",
              points: [
                "Fixed cases where legacy PDFs without YYYYMMDD in the filename could not be dated and were mistakenly grouped into the current date issue.",
                "Added URL-based date parsing for legacy formats (e.g. 1-5-2011, 11.12.2011) and removed stale sharded issue JSONs during rebuilds."
              ]
            },
            {
              date: "2026-02-14",
              title: "Fixed TVRM (Physical) ingesting PVRM PDFs by mistake",
              points: [
                "Fixed cases where legacy /filemanager/common/ auction result handout PDFs were actually PVRM results but got ingested into the TVRM dataset.",
                "The parser now checks the PDF header for \"Traditional\" vs \"Personalized\" (and the Chinese equivalents) to prevent cross-dataset contamination."
              ]
            },
            {
              date: "2026-02-14",
              title: "Added LNY auction parsing + issue label (mixed Traditional/Personalized)",
              points: [
                "Added parsing support for Lunar New Year mixed-result PDFs where a single PDF contains both TVRM and PVRM results.",
                "Marks are auto-classified and split into the PVRM and TVRM (Physical) datasets, and issues are labeled with \"(LNY Auction)\" in the issue selector."
              ]
            },
            {
              date: "2026-02-14",
              title: "Fixed LNY dataset cleaning errors",
              points: [
                "Fixed cases where \"Total sale proceeds\" lines were incorrectly parsed as marks (e.g. 2011-02-20).",
                "Fixed cases where item indices were merged into marks like \"19 18\" (e.g. 2008-02-23 should be mark 18)."
              ]
            },
            {
              date: "2026-02-14",
              title: "LNY issues now marked with 🧧",
              points: [
                "Replaced the long \"(LNY Auction)\" suffix with a 🧧 icon in issue labels to keep the UI compact."
              ]
            },
            {
              date: "2026-02-14",
              title: "Fixed double-line spacing artifacts",
              points: [
                "Fixed an issue where PDF text extraction sometimes split double-line marks into spaced glyph sequences (e.g. \"B A B A\"), causing the site to render \"BA B A\".",
                "Double-line data is now normalized to a strict two-line array (top/bottom) with intra-line spaces removed."
              ]
            },
            {
              date: "2026-02-14",
              title: "Expanded TVRM (Physical) history back to 2010",
              points: [
                "Used Wayback Machine to enumerate legacy filenames and backfilled still-accessible Transport Department PDFs, restoring early physical auction results (2010–2012).",
                "Added support for multiple legacy naming formats (e.g. \"tvrm auction handout_YYYYMMDD\", \"auction result handout DD-MM-YYYY\") to keep future backfills robust."
              ]
            },
            {
              date: "2026-02-14",
              title: "E-Auction issue label formatting",
              points: [
                "Shortened E-Auction date-range labels (e.g. \"5-9 Feb 2026\"; cross-month as \"29 Mar - 2 Apr 2026\").",
                "Fixed pagination when search results exceed 200 rows.",
                "Added total proceeds in the issue footer (physical: full-day proceeds; e-auction: per-period proceeds) from source PDFs."
              ]
            },
            {
              date: "2026-02-14",
              title: "Header and dataset intro copy",
              points: [
                "Moved language selector to the header; kept filters focused on search and issue/sort options.",
                "Added a short intro paragraph under the filter panel for each dataset (PVRM / TVRM physical / TVRM e-auction)."
              ]
            },
            {
              date: "2026-02-13",
              title: "Added Traditional VRM search (physical + e-auction)",
              points: [
                "Added TVRM datasets split into Physical Auction and E-Auction sources.",
                "Added dataset selector while keeping issue filtering, amount sorting, sharded loading, and source PDF links.",
                "Fixed duplicated records caused by both Chinese and English PDFs being available for the same issue (deduplicated per issue and selected a preferred source PDF)."
              ]
            },
            {
              date: "2026-02-13",
              title: "Sharded loading and first-paint performance improvements",
              points: [
                "Added per-issue shard data (issues.manifest + issues/*.json).",
                "Default amount sorting now uses precomputed top1000 for instant first paint, then completes full ranking in background.",
                "Added search debounce (250ms) and next-page shard preloading.",
                "Added data integrity verification script to keep future updates consistent."
              ]
            },
            {
              date: "2026-02-12",
              title: "Data accuracy fixes",
              points: [
                "Fixed reverse-encoded amount parsing for 2009-03-21.",
                "Fixed amount misalignment for specific plates on 2026-01-17 (e.g. 0T0).",
                "Reduced unresolved amounts to 0 across the dataset."
              ]
            },
            {
              date: "2026-02-12",
              title: "Feature and UI updates",
              points: [
                "Added bilingual UI, official source links, last-updated date, and disclaimer.",
                "Added standalone Terms and Privacy pages (language follows entry page).",
                "Added Hong Kong plate-style logo/favicon and refined footer layout.",
                "Added per-issue display of total sale proceeds."
              ]
            },
            {
              date: "2026-02-11",
              title: "Initial launch",
              points: [
                "Built a searchable site from historical Transport Department auction PDFs.",
                "Supports single/double-line plate search, amount display, and original PDF verification links."
              ]
            }
          ]
        },
      };

      const params = new URLSearchParams(location.search);
      const lang = params.get("lang") === "en" ? "en" : "zh";
      const t = I18N[lang];

      document.documentElement.lang = lang === "en" ? "en" : "zh-HK";
      document.title = t.pageTitle;
      document.getElementById("title").textContent = t.title;
      document.getElementById("updated").textContent = t.updated;
      const backLink = document.getElementById("backLink");
      backLink.textContent = t.back;
      backLink.href = `./index.html?lang=${lang}`;

      const entries = document.getElementById("entries");
      entries.innerHTML = t.items
        .map((item) => `
          <section class="entry">
            <h3>${item.date} · ${item.title}</h3>
            <ul>${item.points.map((p) => `<li>${p}</li>`).join("")}</ul>
          </section>
        `)
        .join("");
    
