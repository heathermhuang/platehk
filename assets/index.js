      const { I18N, DATASETS } = window.PLATE_INDEX_CONFIG;

function composeAuctionKey(datasetKey, auctionDate) {
        return `${datasetKey}::${auctionDate}`;
      }

      function auctionMetaKeyForRow(row) {
        if (!row) return "";
        if (row.auction_key) return String(row.auction_key);
        if (currentDataset === "all" && row.dataset_key && row.auction_date) {
          return composeAuctionKey(row.dataset_key, row.auction_date);
        }
        return String(row.auction_date || "");
      }

      function t(key) {
        return I18N[currentLang][key];
      }

      function normalizePlate(v) {
        const raw = Array.isArray(v) ? v.join("") : v == null ? "" : String(v);
        return raw
          .toUpperCase()
          .replace(/\s+/g, "")
          .replace(/I/g, "1")
          .replace(/O/g, "0")
          .replace(/Q/g, "")
          .trim();
      }

      function loadSearchHistory() {
        try {
          const raw = localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
          const decoded = JSON.parse(raw || "[]");
          if (!Array.isArray(decoded)) return [];
          const out = [];
          const seen = new Set();
          for (const item of decoded) {
            const q = normalizePlate(item);
            if (!q || q.length < 2 || seen.has(q)) continue;
            seen.add(q);
            out.push(q);
            if (out.length >= SEARCH_HISTORY_MAX) break;
          }
          return out;
        } catch {
          return [];
        }
      }

      function saveSearchHistory() {
        try {
          localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(searchHistory.slice(0, SEARCH_HISTORY_MAX)));
        } catch {}
      }

      function rememberSearchQuery(q) {
        const norm = normalizePlate(q);
        if (!norm || norm.length < 2) return;
        searchHistory = [norm, ...searchHistory.filter((item) => item !== norm)].slice(0, SEARCH_HISTORY_MAX);
        saveSearchHistory();
        renderSearchHistory();
      }

      function clearSearchHistory() {
        searchHistory = [];
        try {
          localStorage.removeItem(SEARCH_HISTORY_STORAGE_KEY);
        } catch {}
        renderSearchHistory();
      }

      function renderSearchHistory() {
        if (!searchHistory.length) {
          searchHistoryEl.hidden = true;
          searchHistoryEl.innerHTML = "";
          return false;
        }
        searchHistoryEl.hidden = false;
        searchHistoryEl.innerHTML = `
          <span class="search-history-label">${escapeHtml(t("searchHistoryLabel"))}</span>
          <div class="search-history-list">
            ${searchHistory
              .map(
                (q) => `
                  <button type="button" class="search-history-chip" data-history-query="${escapeHtml(q)}">${escapeHtml(q)}</button>
                `
              )
              .join("")}
            <button type="button" class="search-history-clear" data-history-clear="1">${escapeHtml(t("searchHistoryClear"))}</button>
          </div>
        `;
        return true;
      }

      async function loadChar1Rows(char) {
        const key = String(char || "");
        if (!key) return [];
        if (char1Cache.has(key)) return char1Cache.get(key);
        if (loadingChar1.has(key)) return loadingChar1.get(key);
        const pending = fetchJsonStrict(`./data/all.char1/${encodeURIComponent(key)}.json`, { cache: "force-cache" })
          .then((rows) => {
            const out = Array.isArray(rows) ? rows : [];
            char1Cache.set(key, out);
            loadingChar1.delete(key);
            return out;
          })
          .catch((err) => {
            loadingChar1.delete(key);
            const msg = String(err && err.message ? err.message : err || "");
            if (msg.includes("HTTP 404")) {
              char1Cache.set(key, []);
              return [];
            }
            throw err;
          });
        loadingChar1.set(key, pending);
        return pending;
      }

      async function loadBigramRows(prefix) {
        const key = String(prefix || "");
        if (!key) return [];
        if (bigramCache.has(key)) return bigramCache.get(key);
        if (loadingBigram.has(key)) return loadingBigram.get(key);
        const pending = fetchJsonStrict(`./data/all.bigram/${encodeURIComponent(key)}.json`, { cache: "force-cache" })
          .then((rows) => {
            const out = Array.isArray(rows) ? rows : [];
            bigramCache.set(key, out);
            loadingBigram.delete(key);
            return out;
          })
          .catch((err) => {
            loadingBigram.delete(key);
            const msg = String(err && err.message ? err.message : err || "");
            if (msg.includes("HTTP 404")) {
              bigramCache.set(key, []);
              return [];
            }
            throw err;
          });
        loadingBigram.set(key, pending);
        return pending;
      }

      function placeholderForDataset() {
        if (currentDataset === "all") return t("queryPlaceholderAll");
        if (currentDataset === "tvrm_physical") return t("queryPlaceholderTvrmPhysical");
        if (currentDataset === "tvrm_eauction") return t("queryPlaceholderTvrmEauction");
        if (currentDataset === "tvrm_legacy") return t("queryPlaceholderTvrmLegacy");
        return t("queryPlaceholderPvrm");
      }

      function headerSubtitleForDataset() {
        if (currentDataset === "all") return t("headerAll");
        if (currentDataset === "tvrm_physical") return t("headerTvrmPhysical");
        if (currentDataset === "tvrm_eauction") return t("headerTvrmEauction");
        if (currentDataset === "tvrm_legacy") return t("headerTvrmLegacy");
        return t("headerPvrm");
      }

      function introTextForDataset() {
        if (currentDataset === "all") return t("introAll");
        if (currentDataset === "tvrm_physical") return t("introTvrmPhysical");
        if (currentDataset === "tvrm_eauction") return t("introTvrmEauction");
        if (currentDataset === "tvrm_legacy") return t("introTvrmLegacy");
        return t("introPvrm");
      }

      function logoForDataset() {
        return {
          src: "./assets/logo.svg",
          altZh: "PLATE HK 標誌",
          altEn: "PLATE HK logo",
        };
      }

      function isNarrowViewport() {
        try {
          return window.matchMedia && window.matchMedia("(max-width: 700px)").matches;
        } catch {
          return window.innerWidth <= 700;
        }
      }

      function introStorageKey() {
        return `intro_open::${currentDataset}`;
      }

      function loadIntroOpenState() {
        const v = localStorage.getItem(introStorageKey());
        if (v === "1") return true;
        if (v === "0") return false;
        // Default: collapsed on narrow/mobile, open on desktop.
        return !isNarrowViewport();
      }

      const {
        renderHomeCards,
        syncFocusModeChrome,
        renderResultsContext,
        resultsTableMode,
        visibleResultsColumnCount,
        syncResultsTableMode,
        emptyResultsMessage,
      } = window.createPlateIndexHomeViews({
        escapeHtml,
        t,
        datasetLabelForKey,
        issueLabelForDate,
        normalizePlate,
        DATASETS,
        datasetGuideEl,
        issueGuideEl,
        homeShelfEl,
        introEl,
        resultsContextEl,
        resultsTableWrapEl,
        resultsTableEl,
        qEl,
        issueEl,
        getCurrentDataset: () => currentDataset,
        getCurrentLang: () => currentLang,
        getManifest: () => manifest,
        getIssueDatesDesc: () => issueDatesDesc,
        getRenderedTotalCount: () => renderedTotalCount,
      });

      function forwardUpdateIssueTotal(...args) {
        return updateIssueTotal(...args);
      }

      function forwardFormatAuctionDate(...args) {
        return formatAuctionDate(...args);
      }

      function forwardFormatPriceText(...args) {
        return formatPriceText(...args);
      }

      const {
        cancelActiveFilterRequest,
        loadIssue,
        applyFilters,
        loadDataset,
      } = window.createPlateIndexDataFlow({
        normalizePlate,
        t,
        withTimeout,
        composeAuctionKey,
        buildAuctionsByDateMap,
        render,
        updateIssueTotal: forwardUpdateIssueTotal,
        applyLanguage,
        buildIssueOptions,
      });

      function renderIntroCard() {
        const summaryTitle = currentLang === "zh" ? "拍賣規則與資訊" : "Auction Guide";
        const summarySub = headerSubtitleForDataset();
        const chevronSvg = `
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M12 15.6 5.6 9.2l1.4-1.4 5 5 5-5 1.4 1.4z"></path>
          </svg>
        `;

        const OFFICIAL = {
          pvrm: {
            zh: "https://www.td.gov.hk/tc/public_services/vehicle_registration_mark/pvrm_auction/index.html",
            en: "https://www.td.gov.hk/en/public_services/vehicle_registration_mark/pvrm_auction/index.html",
            guidance: "https://www.td.gov.hk/filemanager/common/guidance%20notes%20for%20pvrm%20auction%20%28rev.%2008_2019%29.pdf",
            govhkZh: "https://www.gov.hk/tc/residents/transport/vehicle/ospvrm.htm",
            govhkEn: "https://www.gov.hk/en/residents/transport/vehicle/ospvrm.htm",
          },
          tvrm: {
            zh: "https://www.td.gov.hk/tc/public_services/vehicle_registration_mark/tvrm_auction/index.html",
            en: "https://www.td.gov.hk/en/public_services/vehicle_registration_mark/tvrm_auction/index.html",
            guidance: "https://www.td.gov.hk/filemanager/en/content_4804/G%20Notes%20TVRM%20Auction_Rev%204%202025_eng.pdf",
            eauction: "https://e-auction.td.gov.hk/",
            eauctionIntro: "https://www.td.gov.hk/filemanager/en/content_1130/td283_rev.4.2025_eng.pdf",
          },
          vrm: {
            zh: "https://www.td.gov.hk/tc/public_services/vehicle_registration_mark/",
            en: "https://www.td.gov.hk/en/public_services/vehicle_registration_mark/",
            history: "https://www.td.gov.hk/en/about_us/history_of_transport_department/licensing_services/auction_of_vehicle_registration_marks__/index.html",
          },
        };

        const lang = currentLang === "zh" ? "zh" : "en";
        let sections = [];
        let links = [];

        if (currentDataset === "all") {
          sections = [
            {
              k: currentLang === "zh" ? "資料來源如何分工" : "How the datasets differ",
              v:
                currentLang === "zh"
                  ? [
                      "PVRM 是自訂車牌，採實體舉牌拍賣。",
                      "TVRM 實體拍賣涵蓋「HK」/「XX」字首及特殊車牌；TVRM 拍牌易則涵蓋一般普通車牌。",
                      "1973-2006 歷史年份分段資料來自官方工作簿；2007 年起已有正式拍賣日期，已併回實體拍賣 / 拍牌易分期。",
                    ]
                  : [
                      "PVRM covers personalized marks and is sold by physical paddle auction.",
                      'TVRM physical auctions cover "HK"/"XX" prefix marks and special marks, while E-Auction covers ordinary marks.',
                      "The 1973-2006 historical ranges come from the official workbook; 2007 onward exact-date rows are merged back into dated physical / e-auction issues.",
                    ],
            },
            {
              k: currentLang === "zh" ? "使用這個搜尋頁時" : "How to use this search",
              v:
                currentLang === "zh"
                  ? [
                      "先用「全部車牌」跨資料集搜尋，再按日期跳進單一期數頁，通常最清楚。",
                      "如你要核對官方結果，請打開每筆記錄右側的原始 PDF / 來源檔案。",
                      "網站只整理拍賣結果與來源；如規則和法例有差異，應以運輸署頁面及相關法例為準。",
                    ]
                  : [
                      "Start with the all-datasets view, then jump into a single issue page from the date column for a cleaner view.",
                      "Open the source PDF / source file on each row when you need to verify an official result.",
                      "This site reorganizes published results only. If any rule differs, Transport Department pages and the legislation prevail.",
                    ],
            },
          ];
          links = [
            {
              label: "",
              items: [
                { text: currentLang === "zh" ? "運輸署：拍賣取得車牌總覽" : "TD: Obtaining Vehicle Registration Mark by Auction", href: OFFICIAL.vrm[lang] },
                { text: currentLang === "zh" ? "運輸署：車牌拍賣歷史" : "TD: History of VRM Auctions", href: OFFICIAL.vrm.history },
                { text: currentLang === "zh" ? "拍牌易網站" : "E-Auction Website", href: OFFICIAL.tvrm.eauction },
              ],
            },
          ];
        } else if (currentDataset === "pvrm") {
          sections = [
            {
              k: currentLang === "zh" ? "命名規則" : "Format",
              v:
                currentLang === "zh"
                  ? [
                      "最多 8 個字元（英文字母及/或數字）。",
                      "英文字母不包括 I、O、Q。",
                      "可有單行或雙行排列（以分配證明書為準）。",
                    ]
                  : [
                      "Up to 8 characters (letters and/or digits).",
                      "Letters exclude I, O and Q.",
                      "May be single-line or double-line (as stated on the certificate).",
                    ],
            },
            {
              k: currentLang === "zh" ? "起拍價 / 流程" : "Reserve Price / Process",
              v:
                currentLang === "zh"
                  ? [
                      "自訂車牌採實體舉牌拍賣；參與前應先閱讀運輸署拍賣須知。",
                      "成功投得後會獲發《自訂登記號碼分配證明書》，並須在指定時限內辦理後續手續及分配予車輛。",
                      "實體拍賣一般接受 EPS 或劃線支票；如以支票付款，處理分配時會先等候過戶確認。",
                    ]
                  : [
                      "PVRMs are sold by physical paddle auction and bidders should read the TD guidance notes before attending.",
                      'After a successful bid, the purchaser receives a "Certificate of Allocation of Personalized Registration Mark" and must complete the follow-up assignment procedures within the prescribed period.',
                      "Physical auctions generally accept EPS or crossed cheques. When payment is by cheque, assignment processing follows cheque clearance.",
                    ],
            },
          ];
          links = [
            {
              label: "",
              items: [
                { text: currentLang === "zh" ? "運輸署 PVRM 拍賣頁" : "TD PVRM Auction Page", href: OFFICIAL.pvrm[lang] },
                { text: currentLang === "zh" ? "GovHK：自訂車牌網上服務" : "GovHK: Personalized VRM e-Services", href: currentLang === "zh" ? OFFICIAL.pvrm.govhkZh : OFFICIAL.pvrm.govhkEn },
                { text: currentLang === "zh" ? "拍賣須知（PDF）" : "Guidance Notes (PDF)", href: OFFICIAL.pvrm.guidance },
              ],
            },
          ];
        } else if (currentDataset === "tvrm_physical") {
          sections = [
            {
              k: currentLang === "zh" ? "命名規則" : "Format",
              v:
                currentLang === "zh"
                  ? [
                      "傳統車牌一般為：最多 4 位數字；或 2 個字母作字首 + 最多 4 位數字。",
                      "由 2025 年 2 月起，一般普通車牌改由「拍牌易」網上拍賣；以「HK」或「XX」為字首的車牌及特殊車牌仍由實體拍賣處理。",
                    ]
                  : [
                      "A traditional mark is either: up to 4 numerals; or a 2-letter prefix followed by up to 4 numerals.",
                      'Since February 2025, ordinary marks moved to E-Auction, while "HK"/"XX" prefix marks and special marks remain in physical paddle auctions.',
                    ],
            },
            {
              k: currentLang === "zh" ? "底價 / 流程" : "Reserve Price / Process",
              v:
                currentLang === "zh"
                  ? [
                      "每個登記號碼/特殊登記號碼均設有內定底價（reserve price）。",
                      "成功投得後須完成《車輛登記號碼售賣備忘錄》，並在 12 個月內將該號碼編配到買方名下車輛。",
                      "拍賣所得扣除營運開支後會撥入獎券基金，用於慈善用途。",
                    ]
                  : [
                      "Each registration mark / special registration mark is offered subject to a reserve price.",
                      "After a successful bid, the purchaser completes a Memorandum of Sale and must assign the mark to a vehicle registered in the purchaser's name within 12 months.",
                      "Funds raised after operating expenses go to the Government Lotteries Fund for charitable use.",
                    ],
            },
          ];
          links = [
            {
              label: "",
              items: [
                { text: currentLang === "zh" ? "運輸署 TVRM 拍賣頁" : "TD TVRM Auction Page", href: OFFICIAL.tvrm[lang] },
                { text: currentLang === "zh" ? "拍賣須知（PDF）" : "Guidance Notes (PDF)", href: OFFICIAL.tvrm.guidance },
              ],
            },
          ];
        } else if (currentDataset === "tvrm_eauction") {
          sections = [
            {
              k: currentLang === "zh" ? "適用範圍 / 命名規則" : "Scope / Format",
              v:
                currentLang === "zh"
                  ? [
                      "拍牌易適用於一般普通車牌，不包括「HK」/「XX」字首、特殊車牌及自訂車牌。",
                      "傳統車牌一般為：最多 4 位數字；或 2 個字母作字首 + 最多 4 位數字。",
                    ]
                  : [
                      'E-Auction is for ordinary traditional marks only. It excludes "HK"/"XX" prefix marks, special marks, and personalized marks.',
                      "A traditional mark is either: up to 4 numerals; or a 2-letter prefix followed by up to 4 numerals.",
                    ],
            },
            {
              k: currentLang === "zh" ? "起拍 / 流程" : "Bidding / Process",
              v:
                currentLang === "zh"
                  ? [
                      "參與者須先註冊拍牌易帳戶；可使用具數碼簽署功能的「智方便+」，或以電郵 + 有效個人電子證書註冊。",
                      "若曾以 HK$1,000 按金預留普通車牌供拍賣，仍須註冊並參與網上競投，否則該號碼可按底價售予他人。",
                      "每個號碼可有 sliding end time：若最後 10 分鐘內有新出價，該號碼拍賣時間會延長 10 分鐘，最多延長 24 小時。",
                      "成功投得後須按通知電郵指示，在指定時間內於平台完成買主登記及以信用卡 / FPS / PPS 網上付款。",
                      "結果中 `@1,000` / 特別費分配，通常表示該預留號碼無人競投時，以特別費用 HK$1,000 分配予申請人。",
                    ]
                  : [
                      "Register an E-Auction account in advance using iAM Smart+ with digital signing, or an email address plus a valid personal digital certificate.",
                      "If you reserved an ordinary mark for auction with a HK$1,000 deposit, you still need to register and participate in the online bidding. Otherwise the mark may be sold to another bidder at the reserve price.",
                      "Each mark may be subject to sliding end time: a bid in the last 10 minutes extends that mark by another 10 minutes, up to 24 hours in total.",
                      "Successful bidders follow the email instructions to complete purchaser registration on the platform and pay online by credit card, FPS, or PPS within the prescribed period.",
                      "`@1,000` / assigned special fee in the results usually means the reserved mark remained unsold and was allocated to the applicant at a HK$1,000 special fee.",
                    ],
            },
          ];
          links = [
            {
              label: "",
              items: [
                { text: currentLang === "zh" ? "運輸署 TVRM 拍賣頁" : "TD TVRM Auction Page", href: OFFICIAL.tvrm[lang] },
                { text: currentLang === "zh" ? "拍賣須知（PDF）" : "Guidance Notes (PDF)", href: OFFICIAL.tvrm.guidance },
                { text: currentLang === "zh" ? "拍牌易簡介 / 註冊說明" : "E-Auction Intro / Registration Guide", href: OFFICIAL.tvrm.eauctionIntro },
                { text: currentLang === "zh" ? "拍牌易網站" : "E-Auction Website", href: OFFICIAL.tvrm.eauction },
              ],
            },
          ];
        } else {
          sections = [
            {
              k: currentLang === "zh" ? "這份資料是甚麼" : "What this dataset is",
              v:
                currentLang === "zh"
                  ? [
                      "這部分來自運輸署隨站提供的歷史工作簿，整理了 1973 年以來的傳統車牌拍賣結果。",
                      "原始工作簿按年份區段分頁，例如 `1973-1979`、`1980-1989`，而不是逐期拍賣日。",
                      "因此本站只會把它展示為年份分段資料，不會假裝它有精確拍賣日期。",
                    ]
                  : [
                      "This dataset comes from the Transport Department's bundled historical workbook of traditional mark auction results since 1973.",
                      'The source workbook is grouped by year ranges such as "1973-1979" and "1980-1989", not by exact auction dates.',
                      "This site therefore keeps it as year-range data instead of pretending that an exact auction date exists.",
                    ],
            },
            {
              k: currentLang === "zh" ? "閱讀時要注意" : "How to read it",
              v:
                currentLang === "zh"
                  ? [
                      "同一車牌和金額有時也會在較新的 TVRM 實體 / 拍牌易資料中再次出現；在「全部車牌」視圖中本站會自動去重。",
                      "工作簿中的說明文字若顯示特別費分配，本站會以 `特別費分配` 標示。",
                      "如需核對官方來源，請直接打開來源工作簿，而不要把年份分段當成單一拍賣期。",
                    ]
                  : [
                      "The same plate and amount may also appear again in newer TVRM physical / E-Auction data. The all-datasets view deduplicates those overlaps automatically.",
                      'Rows marked as assigned by special fee in the workbook are labelled accordingly on this site.',
                      "Use the workbook itself for verification, and do not interpret a year range as a single auction issue.",
                    ],
            },
          ];
          links = [
            {
              label: "",
              items: [
                { text: currentLang === "zh" ? "運輸署：拍賣取得車牌總覽" : "TD: Obtaining Vehicle Registration Mark by Auction", href: OFFICIAL.vrm[lang] },
                { text: currentLang === "zh" ? "運輸署：車牌拍賣歷史" : "TD: History of VRM Auctions", href: OFFICIAL.vrm.history },
              ],
            },
          ];
        }

        const detailsHtml = sections
          .map(
            (s, idx) => `
              <details ${idx === 0 ? "open" : ""}>
                <summary>${escapeHtml(s.k)}</summary>
                <div class="content">
                  <ul>${s.v.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
                </div>
              </details>
            `
          )
          .join("");

        const linksHtml = links
          .map(
            (g) => `
              <div class="link-card">
                ${g.label ? `<div class="label">${escapeHtml(g.label)}</div>` : ""}
                <div>${g.items.map((it) => `<a href="${it.href}" target="_blank" rel="noopener">${escapeHtml(it.text)}</a>`).join("")}</div>
              </div>
            `
          )
          .join("");

        const lede = introTextForDataset();
        const ledeHtml = lede ? `<div class="about-lede">${escapeHtml(lede)}</div>` : "";

        return `
          <summary>
            <span class="about-sum">
              <span class="t">${escapeHtml(summaryTitle)}</span>
              <span class="s">${escapeHtml(summarySub)}</span>
            </span>
            <span class="about-chevron" aria-hidden="true">${chevronSvg}</span>
          </summary>
          <div class="about-body">
            ${ledeHtml}
            <div class="about-grid">
              <div>
                <div class="about-details">${detailsHtml}</div>
              </div>
              <div class="about-links">${linksHtml}</div>
            </div>
          </div>
        `;
      }

      function escapeHtml(s) {
        return String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      function formatDateFromIso(iso, lang) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
        if (!m) return iso || "";
        const y = Number(m[1]);
        const month = Number(m[2]);
        const d = Number(m[3]);
        if (lang === "zh") return `${y}年${month}月${d}日`;
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${d} ${monthNames[month - 1]} ${y}`;
      }

      function isYearRangeLabel(label) {
        return /^\d{4}-\d{4}$/.test(String(label || "").trim());
      }

      function parseZhSingleDate(label) {
        const m = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(String(label || "").trim());
        if (!m) return "";
        return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
      }

      function resolveDisplayDateLabel({ label = "", auctionDate = "", datePrecision = "", datasetKey = currentDataset } = {}) {
        const rawLabel = String(label || "").trim();
        const isoLabel = /^\d{4}-\d{2}-\d{2}$/.test(rawLabel) ? rawLabel : "";
        const rawAuctionDate = String(auctionDate || "").trim();

        if (datePrecision === "year_range" || isYearRangeLabel(rawLabel)) {
          return rawLabel || rawAuctionDate;
        }

        if (rawLabel) {
          const zhRange = parseZhRange(rawLabel);
          if (zhRange) {
            return currentLang === "zh" ? formatZhRangeShort(zhRange) : formatEnRangeShort(zhRange);
          }
        }

        const zhSingleDate = rawLabel ? parseZhSingleDate(rawLabel) : "";
        const effectiveIso = isoLabel || rawAuctionDate || zhSingleDate;
        if (effectiveIso) {
          return formatDateFromIso(effectiveIso, currentLang);
        }

        if (datasetKey === "tvrm_eauction" && rawLabel) {
          const zhRange = parseZhRange(rawLabel);
          if (zhRange) return currentLang === "zh" ? formatZhRangeShort(zhRange) : formatEnRangeShort(zhRange);
        }

        return rawLabel;
      }

      function normalizePdfUrl(url) {
        if (!url) return url;
        if (typeof url !== "string") return url;
        if (url.startsWith("http://") || url.startsWith("https://")) return url;
        if (url.startsWith("./data/tvrm_physical/pdfs/")) {
          const name = url.split("/").pop();
          return `https://www.td.gov.hk/filemanager/common/${name}`;
        }
        if (url.startsWith("data/tvrm_physical/pdfs/")) {
          const name = url.split("/").pop();
          return `https://www.td.gov.hk/filemanager/common/${name}`;
        }
        return url;
      }

      function computeIssueTotal(rows) {
        if (!rows || !rows.length) return null;
        let sum = 0;
        let has = false;
        for (const r of rows) {
          if (r.amount_hkd == null) continue;
          sum += Number(r.amount_hkd);
          has = true;
        }
        return has ? sum : null;
      }

      function pdfIconSvg() {
        return `<img class="action-icon-img" src="./assets/action-icon.svg" alt="" aria-hidden="true" />`;
      }

      function shareIconSvg() {
        return `<img class="action-icon-img" src="./assets/action-share-icon.svg" alt="" aria-hidden="true" />`;
      }

      const stateFlow = window.createPlateIndexStateFlow({
        normalizePlate,
        t,
        qEl,
        datasetEl,
        issueEl,
        sortEl,
        langZhEl,
        langEnEl,
        resetEl,
        searchHistoryEl,
        getCurrentLang: () => currentLang,
        setCurrentLang: (value) => {
          currentLang = value;
        },
        getCurrentDataset: () => currentDataset,
        cancelActiveFilterRequest,
        resetSearchSession: () => {
          searchState = null;
        },
        setCurrentPage: (value) => {
          currentPage = value;
        },
        onError: (err) => {
          statusEl.textContent = t("loadFailed")(err && err.message ? err.message : String(err));
        },
      });

      const sharePosterModal = window.createPlateIndexShareModal({
        t,
        normalizePlate,
        formatAuctionDate: forwardFormatAuctionDate,
        formatPriceText: forwardFormatPriceText,
        getCurrentLang: () => currentLang,
        getCurrentDataset: () => currentDataset,
        shareModalEl,
        shareCloseEl,
        shareTitleEl,
        sharePreviewEl,
        shareDownloadEl,
        shareSiteUrl: SHARE_SITE_URL,
      });

      const {
        renderIssuePanel,
        updateUrlState,
        issueHrefForRow,
        openIssueByKey,
        openIssueFromRow,
        switchDataset,
        clearIssueSelection,
      } = window.createPlateIndexIssueFlow({
        t,
        escapeHtml,
        normalizePlate,
        normalizePdfUrl,
        computeIssueTotal,
        datasetLabelForKey,
        issueLabelForDate,
        updateIssueTotal: forwardUpdateIssueTotal,
        loadDataset,
        applyLanguage,
        applyFilters,
        buildIssueOptions,
        getIssueMeta,
        buildStateSearch: stateFlow.buildStateSearch,
        updateUrlState: stateFlow.updateUrlState,
        clearSearchDebounce: stateFlow.clearSearchDebounce,
        resetSearchSession: () => {
          searchState = null;
        },
        qEl,
        datasetEl,
        issueEl,
        sortEl,
        statusEl,
        issuePanelEl,
        getCurrentDataset: () => currentDataset,
        getIssueDatesDesc: () => issueDatesDesc,
        getAuctionsByDate: () => auctionsByDate,
        getLoadedIssues: () => loadedIssues,
        getCurrentPage: () => currentPage,
        setCurrentPage: (value) => {
          currentPage = value;
        },
        getPageSize: () => pageSize,
      });

      const {
        formatLastUpdated,
        formatPrice,
        formatPriceText,
        updateIssueTotal,
        formatDoubleLine,
        formatSingleLine,
        formatAuctionDate,
        formatRowCategory,
        renderDateCell,
        renderCategoryCell,
        rowLink,
        linkTextForRow,
        plateDisplayText,
        renderSearchAssist,
      } = window.createPlateIndexPresenters({
        t,
        escapeHtml,
        auctionMetaKeyForRow,
        isLnyMeta,
        resolveDisplayDateLabel,
        datasetLabelForKey,
        issueLabelForDate,
        issueHrefForRow,
        normalizePdfUrl,
        computeIssueTotal,
        loadIssue,
        renderIssuePanel,
        renderSearchHistory,
        searchNoteEl,
        searchAssistEl,
        issueTotalEl,
        getCurrentLang: () => currentLang,
        getCurrentDataset: () => currentDataset,
        getAuctionsByDate: () => auctionsByDate,
        getLoadedIssues: () => loadedIssues,
        getRenderedTotalCount: () => renderedTotalCount,
        getIssueTotalToken: () => issueTotalToken,
        bumpIssueTotalToken: () => ++issueTotalToken,
      });

      function parseZhRange(label) {
        const m = /(\d{4})年(\d{1,2})月(\d{1,2})日\s*至\s*(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(label || "");
        if (!m) return null;
        return {
          y1: Number(m[1]),
          m1: Number(m[2]),
          d1: Number(m[3]),
          y2: Number(m[4]),
          m2: Number(m[5]),
          d2: Number(m[6]),
        };
      }

      function formatZhRangeShort(p) {
        if (!p) return "";
        // Same year + month: 2026年2月5-9日
        if (p.y1 === p.y2 && p.m1 === p.m2) {
          return `${p.y1}年${p.m1}月${p.d1}-${p.d2}日`;
        }
        // Same year, cross-month: 2026年3月29日-4月2日
        if (p.y1 === p.y2) {
          return `${p.y1}年${p.m1}月${p.d1}日-${p.m2}月${p.d2}日`;
        }
        // Cross-year: keep explicit years
        return `${p.y1}年${p.m1}月${p.d1}日-${p.y2}年${p.m2}月${p.d2}日`;
      }

      function formatEnRangeShort(p) {
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        if (!p) return "";
        // Same year + month: 5-9 Feb 2026
        if (p.y1 === p.y2 && p.m1 === p.m2) {
          return `${p.d1}-${p.d2} ${monthNames[p.m1 - 1]} ${p.y1}`;
        }
        // Same year, cross-month: 29 Mar - 2 Apr 2026
        if (p.y1 === p.y2) {
          return `${p.d1} ${monthNames[p.m1 - 1]} - ${p.d2} ${monthNames[p.m2 - 1]} ${p.y1}`;
        }
        // Cross-year: 29 Dec 2025 - 2 Jan 2026
        return `${p.d1} ${monthNames[p.m1 - 1]} ${p.y1} - ${p.d2} ${monthNames[p.m2 - 1]} ${p.y2}`;
      }

      function issueLabelForDate(issueKey, datasetKey = currentDataset) {
        if (!issueKey) return "";
        const directMeta = auctionsByDate[datasetKey === "all" ? issueKey : issueKey] || null;
        const issueMeta = getIssueMeta(issueKey);
        const meta = directMeta || issueMeta;
        return resolveDisplayDateLabel({
          label: meta && meta.auction_date_label,
          auctionDate: issueKey,
          datePrecision: meta && meta.date_precision,
          datasetKey,
        });
      }

      function render(list, totalCount, modeText) {
        renderedRows = list;
        renderedTotalCount = totalCount;
        syncResultsTableMode();
        if (!list.length) {
          const empty = emptyResultsMessage();
          rowsEl.innerHTML = `
            <tr class="empty-row">
              <td colspan="${visibleResultsColumnCount()}">
                <div class="empty-main">${escapeHtml(empty.main)}</div>
                <div class="empty-sub">${escapeHtml(empty.sub)}</div>
              </td>
            </tr>
          `;
        } else {
          rowsEl.innerHTML = list
            .map((r, idx) => {
              const doublePlate = formatDoubleLine(r.double_line);
              const href = rowLink(r);
              const linkText = linkTextForRow(r);
              return `
                <tr>
                  <td class="col-date" data-label="${escapeHtml(t("thDate"))}">${renderDateCell(r, idx)}</td>
                  <td class="col-single" data-label="${escapeHtml(t("thSingle"))}">${formatSingleLine(r.single_line)}</td>
                  <td class="col-double" data-label="${escapeHtml(t("thDouble"))}">${doublePlate}</td>
                  <td class="col-price" data-label="${escapeHtml(t("thPrice"))}">${formatPrice(r)}</td>
                  <td class="col-category" data-label="${escapeHtml(t("thCategory"))}">${renderCategoryCell(r)}</td>
                  <td class="col-source" data-label="${escapeHtml(t("thPdf"))}">
                    <div class="row-actions">
                      <a class="icon-btn" href="${href}" target="_blank" rel="noopener" title="${escapeHtml(linkText)}">${pdfIconSvg()}</a>
                      <button class="icon-btn row-share-btn" type="button" data-row-index="${idx}" title="${escapeHtml(t("share"))}">${shareIconSvg()}</button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("");
        }
        renderResultsContext(totalCount);
        statusEl.textContent = t("statusFmt")(Number(manifest.total_rows || 0).toLocaleString(), totalCount.toLocaleString(), modeText);
        renderHomeCards();
        renderSearchAssist({ totalCount, selectedIssue: issueEl.value || "", q: normalizePlate(qEl.value) });
        renderIssuePanel({ selectedIssue: issueEl.value || "", totalCount });
        syncFocusModeChrome();
      }

      function buildSortOptions() {
        const selected = sortEl.value || "amount_desc";
        sortEl.innerHTML = `
          <option value="date_desc">${escapeHtml(t("sortDateDesc"))}</option>
          <option value="amount_desc">${escapeHtml(t("sortAmountDesc"))}</option>
          <option value="amount_asc">${escapeHtml(t("sortAmountAsc"))}</option>
          <option value="plate_asc">${escapeHtml(t("sortPlateAsc"))}</option>
        `;
        sortEl.value = selected;
      }

      function buildDatasetOptions() {
        const selected = datasetEl.value || currentDataset || "all";
        datasetEl.innerHTML = `
          <option value="all">${escapeHtml(t("datasetAll"))}</option>
          <option value="pvrm">${escapeHtml(t("datasetPvrm"))}</option>
          <option value="tvrm_physical">${escapeHtml(t("datasetTvrmPhysical"))}</option>
          <option value="tvrm_eauction">${escapeHtml(t("datasetTvrmEauction"))}</option>
          <option value="tvrm_legacy">${escapeHtml(t("datasetTvrmLegacy"))}</option>
        `;
        datasetEl.value = selected;
      }

      function buildIssueOptions() {
        issueDatesDesc = (manifest.issues || []).map((x) => x.auction_date);
        if (currentDataset === "all") {
          issueEl.innerHTML = `<option value="">${escapeHtml(t("issueUnavailableAll"))}</option>`;
          issueEl.value = "";
          issueEl.disabled = true;
          return;
        }
        issueEl.disabled = false;
        const selected = issueEl.value || "";
        issueEl.innerHTML = [
          `<option value="">${escapeHtml(t("issueAll"))}</option>`,
          ...issueDatesDesc.map((iso) => {
            const meta = auctionsByDate[iso];
            const issueMeta = getIssueMeta(iso);
            let text = resolveDisplayDateLabel({
              label: (meta && meta.auction_date_label) || (issueMeta && issueMeta.auction_date_label) || "",
              auctionDate: iso,
              datePrecision: (meta && meta.date_precision) || (issueMeta && issueMeta.date_precision) || "",
              datasetKey: currentDataset,
            });
            if (meta && meta.is_lny) text = `${text} 🧧`;
            return `<option value="${iso}">${escapeHtml(text)}</option>`;
          }),
        ].join("");
        issueEl.value = issueDatesDesc.includes(selected) ? selected : "";
      }

      function getIssueMeta(dateIso) {
        return (manifest.issues || []).find((x) => x.auction_date === dateIso) || null;
      }

      function isLnyMeta(meta) {
        if (!meta) return false;
        if (meta.is_lny) return true;
        const url = String(meta.pdf_url || meta.source_pdf || "");
        const u = url.toLowerCase();
        return (
          u.includes("lny") ||
          u.includes("cny") ||
          u.includes("lunar_new_year") ||
          /\/content_4806\/\d{8}ret\.pdf$/i.test(url)
        );
      }

      function buildAuctionsByDateMap(list) {
        const out = {};
        for (const row of list || []) {
          const key = String(row?.auction_key || row?.auction_date || "");
          if (!key) continue;
          const prev = out[key];
          if (!prev) {
            out[key] = { ...row, is_lny: isLnyMeta(row) };
            continue;
          }
          out[key] = {
            ...prev,
            ...row,
            // Keep the strongest signal for LNY, even when one duplicate row lacks the flag.
            is_lny: isLnyMeta(prev) || isLnyMeta(row),
          };
        }
        return out;
      }

      async function fetchJsonStrict(url, options = {}) {
        const timeoutMs = 15000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let res;
        try {
          res = await fetch(url, { ...options, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          const snippet = text.slice(0, 32).replace(/\s+/g, " ");
          throw new Error(`Invalid JSON from ${url}: ${snippet}`);
        }
      }

      function datasetLabelForKey(key) {
        if (key === "all") return t("datasetAll");
        if (key === "tvrm_physical") return t("datasetTvrmPhysical");
        if (key === "tvrm_eauction") return t("datasetTvrmEauction");
        if (key === "tvrm_legacy") return t("datasetTvrmLegacy");
        return t("datasetPvrm");
      }

      function withTimeout(promise, ms, message = "timeout") {
        let timer = null;
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => {
          if (timer) clearTimeout(timer);
        });
      }

      function cancelActiveSearchWorker() {
        if (activeSearchWorker) {
          try {
            activeSearchWorker.terminate();
          } catch {}
          activeSearchWorker = null;
        }
      }

      function runSearchInWorker({ q, sortMode, version }) {
        cancelActiveSearchWorker();
        activeSearchSeq += 1;
        const seq = activeSearchSeq;
        const worker = new Worker(`./assets/search.worker.js?v=20260228-01`);
        activeSearchWorker = worker;

        return new Promise((resolve, reject) => {
          worker.onmessage = (ev) => {
            if (version !== renderVersion || seq !== activeSearchSeq) {
              cancelActiveSearchWorker();
              return reject(new Error("stale search"));
            }
            const m = ev.data || {};
            if (m.type === "progress") {
              const scanned = Number(m.scanned || 0);
              const total = Number(m.total || issueDatesDesc.length || 0);
              const matched = Number(m.matched || 0);
              setSearchProgress(scanned, total);
              statusEl.textContent = t("statusFmt")(
                Number(manifest.total_rows || 0).toLocaleString(),
                matched.toLocaleString(),
                t("modeSearching")(scanned, total)
              );
              return;
            }
            if (m.type === "done") {
              const rows = Array.isArray(m.matches) ? m.matches : [];
              cancelActiveSearchWorker();
              return resolve(rows);
            }
            if (m.type === "error") {
              cancelActiveSearchWorker();
              return reject(new Error(String(m.message || "worker error")));
            }
          };
          worker.onerror = (e) => {
            cancelActiveSearchWorker();
            reject(new Error(String(e && e.message ? e.message : "worker crash")));
          };
          worker.postMessage({
            type: "search",
            base: new URL(`${(DATASETS[currentDataset] || DATASETS.pvrm).base}/`, location.href).href,
            issues: manifest.issues || [],
            q,
            sortMode,
            timeoutMs: 12000,
          });
        });
      }

      function applyLanguage() {
        const ds = DATASETS[currentDataset] || DATASETS.pvrm;
        document.documentElement.lang = currentLang === "zh" ? "zh-HK" : "en";
        langZhEl.classList.toggle("active", currentLang === "zh");
        langEnEl.classList.toggle("active", currentLang === "en");
        langZhEl.setAttribute("aria-pressed", currentLang === "zh" ? "true" : "false");
        langEnEl.setAttribute("aria-pressed", currentLang === "en" ? "true" : "false");
        const title = currentLang === "zh" ? ds.titleZh : ds.titleEn;
        document.title = title;
        titleMainEl.textContent = t("headerTitle");
        titleDatasetEl.textContent = headerSubtitleForDataset();
        searchPanelTitleEl.textContent = t("searchPanelTitle");
        searchPanelNoteEl.textContent = t("searchPanelNote");
        queryLabelEl.textContent = t("queryLabel");
        datasetLabelEl.textContent = t("datasetLabel");
        issueLabelEl.textContent = t("issueLabel");
        sortLabelEl.textContent = t("sortLabel");
        introEl.innerHTML = renderIntroCard();
        introEl.open = loadIntroOpenState();
        const logo = logoForDataset();
        brandLogoEl.src = logo.src;
        brandLogoEl.alt = currentLang === "zh" ? logo.altZh : logo.altEn;
        qEl.placeholder = placeholderForDataset();
        resetEl.textContent = t("reset");
        thDateEl.textContent = t("thDate");
        thCategoryEl.textContent = t("thCategory");
        thSingleEl.textContent = t("thSingle");
        thDoubleEl.textContent = t("thDouble");
        thPriceEl.textContent = t("thPrice");
        thPdfEl.textContent = t("thPdf");
        disclaimerEl.textContent = t("disclaimer");
        popularLinkEl.textContent = t("popularLink");
        cameraTopLinkEl.textContent = t("cameraLink");
        termsLinkEl.textContent = t("termsLink");
        privacyLinkEl.textContent = t("privacyLink");
        changelogLinkEl.textContent = t("changelogLink");
        auditLinkEl.textContent = t("auditLink");
        apiLinkEl.textContent = t("apiLink");
        feedbackLinkEl.textContent = t("feedbackLink");
        cameraTopLinkEl.href = `./camera.html?lang=${currentLang}`;
        popularLinkEl.href = `./plates/index.html?lang=${currentLang}`;
        termsLinkEl.href = t("termsUrl");
        privacyLinkEl.href = t("privacyUrl");
        changelogLinkEl.href = t("changelogUrl");
        auditLinkEl.href = t("auditUrl");
        apiLinkEl.href = t("apiUrl");
        feedbackLinkEl.href = t("feedbackUrl");
        updatedAtEl.textContent = `${t("updatePrefix")}${formatLastUpdated(lastUpdatedDate)}`;
        renderSearchHistory();
        buildDatasetOptions();
        buildSortOptions();
        buildIssueOptions();
        renderHomeCards();
        syncFocusModeChrome();
        updateIssueTotal(issueEl.value || "");
      }

      async function init() {
        const initialState = stateFlow.parseInitialState();
        if (initialState.lang) currentLang = initialState.lang;
        searchHistory = loadSearchHistory();
        currentDataset = initialState.dataset || "all";

        buildDatasetOptions();
        datasetEl.value = currentDataset;
        applyLanguage();
        qEl.value = initialState.q;
        sortEl.value = initialState.sort;
        statusEl.textContent = t("loading");
        await loadDataset(currentDataset);
        applyLanguage();
        if (initialState.issue && currentDataset !== "all" && issueDatesDesc.includes(initialState.issue)) {
          issueEl.value = initialState.issue;
        }
        await applyFilters();
      }

      function handleBottomPrev() {
        if (currentPage > 1) {
          currentPage -= 1;
          cancelActiveFilterRequest();
          applyFilters({ resetPage: false });
        }
      }

      function handleBottomNext() {
        currentPage += 1;
        cancelActiveFilterRequest();
        applyFilters({ resetPage: false });
      }

      rowsEl.addEventListener("click", (ev) => {
        const issueLink = ev.target.closest(".issue-jump-link");
        if (issueLink) {
          ev.preventDefault();
          const idx = Number(issueLink.getAttribute("data-row-index"));
          const row = renderedRows[idx];
          if (!row) return;
          openIssueFromRow(row).catch((err) => {
            statusEl.textContent = t("loadFailed")(err.message || String(err));
          });
          return;
        }
        const btn = ev.target.closest(".row-share-btn");
        if (!btn) return;
        const idx = Number(btn.getAttribute("data-row-index"));
        const row = renderedRows[idx];
        if (!row) return;
        sharePosterModal.openShareModal(row).catch(() => {
          sharePosterModal.closeShareModal();
          statusEl.textContent = t("loadFailed")("Poster generation failed");
        });
      });
      issuePanelEl.addEventListener("click", (ev) => {
        const nav = ev.target.closest("[data-issue-nav]");
        if (!nav) return;
        ev.preventDefault();
        const issueKey = nav.getAttribute("data-issue-nav") || "";
        openIssueByKey(currentDataset, issueKey).catch((err) => {
          statusEl.textContent = t("loadFailed")(err.message || String(err));
        });
      });
      datasetGuideEl.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-dataset-switch]");
        if (!btn) return;
        ev.preventDefault();
        const datasetKey = btn.getAttribute("data-dataset-switch") || "all";
        switchDataset(datasetKey).catch((err) => {
          statusEl.textContent = t("loadFailed")(err.message || String(err));
        });
      });
      issueGuideEl.addEventListener("click", (ev) => {
        const openBtn = ev.target.closest("[data-open-issue]");
        if (openBtn) {
          ev.preventDefault();
          const issueKey = openBtn.getAttribute("data-open-issue") || "";
          openIssueByKey(currentDataset, issueKey).catch((err) => {
            statusEl.textContent = t("loadFailed")(err.message || String(err));
          });
          return;
        }
        const clearBtn = ev.target.closest("[data-clear-issue]");
        if (!clearBtn) return;
        ev.preventDefault();
        clearIssueSelection().catch((err) => {
          statusEl.textContent = t("loadFailed")(err.message || String(err));
        });
      });
      sharePosterModal.attachShareModalEvents();
      stateFlow.bindControlEvents({
        applyFilters,
        switchDataset,
        applyLanguage,
        clearSearchHistory,
        renderSearchAssist,
        getRenderedTotalCount: () => renderedTotalCount,
      });
      bottomPrevEl.addEventListener("click", handleBottomPrev);
      bottomNextEl.addEventListener("click", handleBottomNext);

      // Persist intro panel open/close per dataset.
      introEl.addEventListener("toggle", () => {
        try {
          localStorage.setItem(introStorageKey(), introEl.open ? "1" : "0");
        } catch {}
      });

      init().catch((err) => {
        statusEl.textContent = t("loadFailed")(err.message);
      });

      if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
          // Don't use SW on localhost during development; it can cache 404 HTML and break JSON loads.
          if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
          // Avoid sticky cached SW on some static hosts.
          navigator.serviceWorker
            .register("./sw.js?v=20260405-01", { updateViaCache: "none" })
            .catch(() => {});
        });
      }
    
