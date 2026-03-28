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
        updateIssueTotal,
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

      function formatLastUpdated(dateObj) {
        if (!dateObj || Number.isNaN(dateObj.getTime())) return "";
        if (currentLang === "zh") {
          return `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
        }
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${dateObj.getDate()} ${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
      }

      function formatPrice(row) {
        if (row.amount_hkd === null || row.amount_hkd === undefined) {
          return `<span class="price na">${t("unresolved")}</span>`;
        }
        const amount = `HK$${Number(row.amount_hkd).toLocaleString("en-HK")}`;
        if (row.result_status === "assigned_special_fee") {
          return `<span class="price-value">${amount}</span> <span class="badge">${escapeHtml(t("resultAssignedSpecialFee"))}</span>`;
        }
        return `<span class="price-value">${amount}</span>`;
      }

      function formatPriceText(row) {
        if (row.amount_hkd === null || row.amount_hkd === undefined) return t("unresolved");
        const amount = `HK$${Number(row.amount_hkd).toLocaleString("en-HK")}`;
        if (row.result_status === "assigned_special_fee") {
          return `${amount} (${t("resultAssignedSpecialFee")})`;
        }
        return amount;
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

      function updateIssueTotal(selectedIssue) {
        if (!selectedIssue) {
          issueTotalEl.textContent = "";
          renderIssuePanel({ selectedIssue: "", totalCount: renderedTotalCount });
          return;
        }
        const meta = auctionsByDate[selectedIssue];
        if (!meta) {
          issueTotalEl.textContent = "";
          renderIssuePanel({ selectedIssue, totalCount: renderedTotalCount });
          return;
        }
        let label = t("totalProceedsLabel");
        if (currentDataset === "tvrm_physical") label = t("totalProceedsLabelPhysical");
        if (currentDataset === "tvrm_eauction") label = t("totalProceedsLabelEauction");
        if (currentDataset === "tvrm_legacy") label = t("totalProceedsLabelLegacy");
        const linkHref = normalizePdfUrl(meta.source_url || meta.pdf_url || "");
        const linkText = /\.xls[x]?$/i.test(String(meta.source_url || meta.pdf_url || ""))
          ? t("fromSourceFile")
          : t("fromPdf");
        if (meta.total_sale_proceeds_hkd == null) {
          const token = ++issueTotalToken;
          const cachedRows = loadedIssues.get(selectedIssue);
          if (cachedRows) {
            const computed = computeIssueTotal(cachedRows);
            if (computed != null) {
              const amount = `HK$${Number(computed).toLocaleString("en-HK")}`;
              const suffix = t("totalProceedsComputed");
              const link = linkHref
                ? ` <a href="${linkHref}" target="_blank" rel="noopener">${escapeHtml(linkText)}</a>`
                : "";
              issueTotalEl.innerHTML = `${escapeHtml(label)}：<strong>${amount}</strong> ${escapeHtml(suffix)}${link}`;
              renderIssuePanel({ selectedIssue, totalCount: renderedTotalCount });
              return;
            }
          }
          issueTotalEl.textContent = `${label}：${t("totalProceedsCalculating")}`;
          loadIssue(selectedIssue)
            .then((rows) => {
              if (token !== issueTotalToken) return;
              const computed = computeIssueTotal(rows);
              if (computed == null) {
                issueTotalEl.textContent = `${label}：${t("totalProceedsUnavailable")}`;
                return;
              }
              const amount = `HK$${Number(computed).toLocaleString("en-HK")}`;
              const suffix = t("totalProceedsComputed");
              const link = linkHref
                ? ` <a href="${linkHref}" target="_blank" rel="noopener">${escapeHtml(linkText)}</a>`
                : "";
              issueTotalEl.innerHTML = `${escapeHtml(label)}：<strong>${amount}</strong> ${escapeHtml(suffix)}${link}`;
              renderIssuePanel({ selectedIssue, totalCount: renderedTotalCount });
            })
            .catch(() => {
              if (token !== issueTotalToken) return;
              issueTotalEl.textContent = `${label}：${t("totalProceedsUnavailable")}`;
              renderIssuePanel({ selectedIssue, totalCount: renderedTotalCount });
            });
          return;
        }
        const amount = `HK$${Number(meta.total_sale_proceeds_hkd).toLocaleString("en-HK")}`;
        const link = linkHref
          ? ` <a href="${linkHref}" target="_blank" rel="noopener">${escapeHtml(linkText)}</a>`
          : "";
        issueTotalEl.innerHTML = `${escapeHtml(label)}：<strong>${amount}</strong>${link}`;
        renderIssuePanel({ selectedIssue, totalCount: renderedTotalCount });
      }

      function formatDoubleLine(v) {
        if (!v) return `<div class="plate na">(n/a)</div>`;

        let lines = [];
        if (Array.isArray(v)) lines = v;
        else lines = String(v).split(/\n+/);
        lines = lines.map((x) => String(x || "").trim()).filter(Boolean);
        if (!lines.length) return `<div class="plate na">(n/a)</div>`;
        return `<div class="plate double"><div class="double-plate">${lines.map((x) => `<span>${escapeHtml(x)}</span>`).join("")}</div></div>`;
      }

      function formatSingleLine(v) {
        if (!v) return `<div class="plate na">(n/a)</div>`;
        return `<div class="plate">${escapeHtml(v)}</div>`;
      }

      function formatAuctionDate(row) {
        const meta = auctionsByDate[auctionMetaKeyForRow(row)];
        const base = resolveDisplayDateLabel({
          label: (meta && meta.auction_date_label) || (row && row.auction_date_label) || "",
          auctionDate: row && row.auction_date,
          datePrecision: (row && row.date_precision) || (meta && meta.date_precision) || "",
          datasetKey: row && row.dataset_key ? row.dataset_key : currentDataset,
        });
        const decorated = (meta && meta.is_lny) || isLnyMeta(row) ? `${base} 🧧` : base;
        return decorated;
      }

      function formatRowCategory(row) {
        const key = row && row.dataset_key ? row.dataset_key : currentDataset;
        return datasetLabelForKey(key);
      }

      function posterDatasetLabel(row) {
        const key = row && row.dataset_key ? row.dataset_key : currentDataset;
        if (key === "pvrm") return "PVRM";
        if (key === "tvrm_physical") return "TVRM Physical";
        if (key === "tvrm_eauction") return "TVRM E-Auction";
        if (key === "tvrm_legacy") return "TVRM 1973-2006";
        return "All Plates";
      }

      function posterCategoryLabel(row) {
        const key = row && row.dataset_key ? row.dataset_key : currentDataset;
        if (key === "pvrm") return currentLang === "zh" ? "自訂車牌" : "Personalized";
        if (key === "tvrm_physical") return currentLang === "zh" ? "實體拍賣" : "Physical";
        if (key === "tvrm_eauction") return currentLang === "zh" ? "拍牌易" : "E-Auction";
        if (key === "tvrm_legacy") return currentLang === "zh" ? "1973-2006 年" : "1973-2006";
        return currentLang === "zh" ? "全部車牌" : "All Plates";
      }

      function posterCategoryLabelBilingual(row) {
        const key = row && row.dataset_key ? row.dataset_key : currentDataset;
        if (key === "pvrm") return "自訂車牌 Personalized";
        if (key === "tvrm_physical") return "實體拍賣 Physical";
        if (key === "tvrm_eauction") return "拍牌易 E-Auction";
        if (key === "tvrm_legacy") return "1973-2006 年歷史分段 Historical";
        return "全部車牌 All Plates";
      }

      function renderDateCell(row, idx) {
        const issueHref = issueHrefForRow(row);
        return `
          <div class="cell-stack">
            <a class="issue-jump-link cell-main" href="${issueHref}" data-row-index="${idx}">${escapeHtml(formatAuctionDate(row))}</a>
          </div>
        `;
      }

      function renderCategoryCell(row) {
        return `
          <div class="cell-stack">
            <span class="category-pill">${escapeHtml(formatRowCategory(row))}</span>
          </div>
        `;
      }

      function rowLink(row) {
        if (!row) return "#";
        if (currentLang === "zh" && row.pdf_url_zh) return row.pdf_url_zh;
        if (currentLang === "en" && row.pdf_url_en) return row.pdf_url_en;
        if (currentLang === "zh" && row.source_url) return row.source_url;
        if (currentLang === "en" && row.source_url_en) return row.source_url_en;
        if (row.pdf_url) return normalizePdfUrl(row.pdf_url);
        if (row.source_url_en) return row.source_url_en;
        if (row.source_url) return row.source_url;
        return "#";
      }

      function linkTextForRow(row) {
        const href = String(row?.source_url || row?.pdf_url || "");
        return /\.xls[x]?$/i.test(href) ? t("viewSource") : t("viewPdf");
      }

      function pdfIconSvg() {
        return `<img class="action-icon-img" src="./assets/action-icon.svg" alt="" aria-hidden="true" />`;
      }

      function shareIconSvg() {
        return `<img class="action-icon-img" src="./assets/action-share-icon.svg" alt="" aria-hidden="true" />`;
      }

      function posterPlateText(row) {
        const single = String(row.single_line || "").trim();
        if (single) return single;
        const dbl = Array.isArray(row.double_line) ? row.double_line : String(row.double_line || "").split(/\n+/);
        return dbl.map((x) => String(x || "").trim()).filter(Boolean).join(" ");
      }

      function posterDoubleLines(row) {
        const dbl = Array.isArray(row.double_line) ? row.double_line : String(row.double_line || "").split(/\n+/);
        return dbl.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 2);
      }

      function wrapText(ctx, text, maxWidth) {
        const out = [];
        let line = "";
        for (const ch of String(text || "")) {
          const candidate = line + ch;
          if (ctx.measureText(candidate).width > maxWidth && line) {
            out.push(line);
            line = ch;
          } else {
            line = candidate;
          }
        }
        if (line) out.push(line);
        return out;
      }

      function ellipsizeToWidth(ctx, text, maxWidth) {
        const value = String(text || "");
        if (!value) return "";
        if (ctx.measureText(value).width <= maxWidth) return value;
        let out = value;
        while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
          out = out.slice(0, -1);
        }
        return `${out}…`;
      }

      function fitPosterText(ctx, text, maxWidth, {
        maxFont = 32,
        minFont = 16,
        maxLines = 2,
        family = "'Noto Sans HK', Helvetica, Arial, sans-serif",
        weight = 700,
      } = {}) {
        const raw = String(text || "").trim();
        if (!raw) {
          return { fontSize: maxFont, lines: [""] };
        }
        for (let size = maxFont; size >= minFont; size -= 1) {
          ctx.font = `${weight} ${size}px ${family}`;
          const lines = wrapText(ctx, raw, maxWidth);
          if (lines.length <= maxLines) {
            return { fontSize: size, lines };
          }
        }
        ctx.font = `${weight} ${minFont}px ${family}`;
        const lines = wrapText(ctx, raw, maxWidth).slice(0, maxLines);
        if (!lines.length) return { fontSize: minFont, lines: [""] };
        lines[lines.length - 1] = ellipsizeToWidth(ctx, lines[lines.length - 1], maxWidth);
        return { fontSize: minFont, lines };
      }

      function fitPosterSingleLine(ctx, text, maxWidth, {
        maxFont = 32,
        minFont = 16,
        family = "'Noto Sans HK', Helvetica, Arial, sans-serif",
        weight = 700,
      } = {}) {
        const raw = String(text || "").trim();
        if (!raw) return { fontSize: maxFont, text: "" };
        for (let size = maxFont; size >= minFont; size -= 1) {
          ctx.font = `${weight} ${size}px ${family}`;
          if (ctx.measureText(raw).width <= maxWidth) {
            return { fontSize: size, text: raw };
          }
        }
        ctx.font = `${weight} ${minFont}px ${family}`;
        return { fontSize: minFont, text: ellipsizeToWidth(ctx, raw, maxWidth) };
      }

      function roundRectPath(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }

      function drawPlateLineFit(ctx, text, centerX, baselineY, maxWidth, maxFont, minFont, family, weight, scaleX = 1) {
        let size = maxFont;
        const content = String(text || "");
        while (size > minFont) {
          ctx.font = `${weight} ${size}px ${family}`;
          const w = ctx.measureText(content).width * scaleX;
          if (w <= maxWidth) break;
          size -= 1;
        }
        ctx.save();
        ctx.translate(centerX, 0);
        ctx.scale(scaleX, 1);
        ctx.font = `${weight} ${size}px ${family}`;
        ctx.fillText(content, 0, baselineY);
        ctx.restore();
      }

      async function loadPosterLogo() {
        return await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("logo load failed"));
          img.src = "./assets/logo.svg";
        });
      }

      function loadPosterQr(url, size = 360) {
        if (typeof qrcode !== "function") {
          throw new Error("qr generator unavailable");
        }
        const qr = qrcode(0, "M");
        qr.addData(String(url || ""));
        qr.make();
        const moduleCount = qr.getModuleCount();
        const quietZone = 3;
        const totalModules = moduleCount + quietZone * 2;
        const cellSize = Math.max(1, Math.floor(size / totalModules));
        const actualSize = cellSize * totalModules;
        const canvas = document.createElement("canvas");
        canvas.width = actualSize;
        canvas.height = actualSize;
        const qctx = canvas.getContext("2d");
        qctx.fillStyle = "#ffffff";
        qctx.fillRect(0, 0, actualSize, actualSize);
        qctx.fillStyle = "#000000";
        for (let row = 0; row < moduleCount; row += 1) {
          for (let col = 0; col < moduleCount; col += 1) {
            if (!qr.isDark(row, col)) continue;
            qctx.fillRect(
              (col + quietZone) * cellSize,
              (row + quietZone) * cellSize,
              cellSize,
              cellSize
            );
          }
        }
        return canvas;
      }

      function drawGlassPanel(
        ctx,
        x,
        y,
        w,
        h,
        r,
        {
          from = "rgba(255,255,255,0.72)",
          to = "rgba(214,231,255,0.28)",
          stroke = "rgba(255,255,255,0.66)",
          shadow = "rgba(7,28,58,0.18)",
          shadowBlur = 30,
          gloss = true,
        } = {}
      ) {
        ctx.save();
        const fill = ctx.createLinearGradient(x, y, x + w, y + h);
        fill.addColorStop(0, from);
        fill.addColorStop(1, to);
        ctx.shadowColor = shadow;
        ctx.shadowBlur = shadowBlur;
        ctx.shadowOffsetY = 18;
        roundRectPath(ctx, x, y, w, h, r);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        roundRectPath(ctx, x, y, w, h, r);
        ctx.stroke();
        if (gloss) {
          const sheen = ctx.createLinearGradient(x, y, x, y + h * 0.55);
          sheen.addColorStop(0, "rgba(255,255,255,0.52)");
          sheen.addColorStop(1, "rgba(255,255,255,0)");
          roundRectPath(ctx, x + 2, y + 2, w - 4, h * 0.52, Math.max(10, r - 2));
          ctx.fillStyle = sheen;
          ctx.fill();
        }
        ctx.restore();
      }

      function drawPosterOrb(ctx, x, y, radius, inner, outer = "rgba(255,255,255,0)") {
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, inner);
        g.addColorStop(1, outer);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      function drawPosterPill(
        ctx,
        x,
        y,
        text,
        { fill = "rgba(12,39,80,0.72)", color = "#ffffff", maxWidth = 320, fontSize = 22, minFontSize = 15 } = {}
      ) {
        ctx.save();
        const usableTextWidth = Math.max(44, maxWidth - 36);
        const fit = fitPosterText(ctx, text, usableTextWidth, {
          maxFont: fontSize,
          minFont: minFontSize,
          maxLines: 1,
        });
        ctx.font = `700 ${fit.fontSize}px 'Noto Sans HK', Helvetica, Arial, sans-serif`;
        const padX = 18;
        const h = 42;
        const label = fit.lines[0] || "";
        const w = Math.min(maxWidth, ctx.measureText(label).width + padX * 2);
        roundRectPath(ctx, x, y, w, h, 21);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.fillStyle = color;
        ctx.textBaseline = "middle";
        ctx.fillText(label, x + padX, y + h / 2);
        ctx.textBaseline = "alphabetic";
        ctx.restore();
        return w;
      }

      function measurePosterPillWidth(
        ctx,
        text,
        { maxWidth = 320, fontSize = 22, minFontSize = 15 } = {}
      ) {
        ctx.save();
        const usableTextWidth = Math.max(44, maxWidth - 36);
        const fit = fitPosterText(ctx, text, usableTextWidth, {
          maxFont: fontSize,
          minFont: minFontSize,
          maxLines: 1,
        });
        ctx.font = `700 ${fit.fontSize}px 'Noto Sans HK', Helvetica, Arial, sans-serif`;
        const width = Math.min(maxWidth, ctx.measureText(fit.lines[0] || "").width + 36);
        ctx.restore();
        return width;
      }

      function drawPosterMetaCard(
        ctx,
        x,
        y,
        w,
        h,
        label,
        value,
        { accent = "#0f1c2b", valueSize = 32, minValueSize = 18, maxLines = 2 } = {}
      ) {
        drawGlassPanel(ctx, x, y, w, h, 28, {
          from: "rgba(255,255,255,0.68)",
          to: "rgba(220,235,255,0.24)",
          stroke: "rgba(255,255,255,0.7)",
          shadow: "rgba(8,29,62,0.12)",
          shadowBlur: 18,
        });
        ctx.save();
        ctx.fillStyle = "rgba(26,70,111,0.72)";
        ctx.font = "700 20px 'Noto Sans HK', Helvetica, Arial, sans-serif";
        ctx.fillText(label, x + 24, y + 34);
        ctx.fillStyle = accent;
        const fit = fitPosterSingleLine(ctx, value, w - 48, {
          maxFont: valueSize,
          minFont: minValueSize,
        });
        ctx.font = `700 ${fit.fontSize}px 'Noto Sans HK', Helvetica, Arial, sans-serif`;
        ctx.fillText(fit.text, x + 24, y + 90);
        ctx.restore();
      }

      function drawPlateCard(ctx, x, y, w, h, title, lines) {
        const compact = h < 220;
        drawGlassPanel(ctx, x, y, w, h, 30, {
          from: "rgba(255,255,255,0.72)",
          to: "rgba(214,231,255,0.26)",
          stroke: "rgba(255,255,255,0.72)",
          shadow: "rgba(8,29,60,0.18)",
          shadowBlur: 22,
        });

        drawPosterPill(ctx, x + 14, y + (compact ? 12 : 18), title, {
          fill: "rgba(15,28,43,0.78)",
          color: "#f8fbff",
          fontSize: compact ? 18 : 22,
          minFontSize: 13,
          maxWidth: compact ? 220 : 280,
        });

        const plateZoneX = x + 18;
        const plateZoneY = y + (compact ? 54 : 66);
        const plateZoneW = w - 36;
        const plateZoneH = h - (compact ? 68 : 84);
        const clean = (lines || []).map((v) => String(v || "").trim()).filter(Boolean);
        if (!clean.length) clean.push("(n/a)");
        const isDouble = clean.length > 1;
        const plateRatio = 2.75;
        let plateH = Math.min(plateZoneH - 12, plateZoneW / plateRatio);
        plateH = Math.max(104, plateH);
        let plateW = Math.min(plateZoneW - 8, plateH * plateRatio);
        if (plateW > plateZoneW - 8) {
          plateW = plateZoneW - 8;
          plateH = plateW / plateRatio;
        }
        if (plateH > plateZoneH - 10) {
          plateH = plateZoneH - 10;
          plateW = plateH * plateRatio;
        }
        const plateX = plateZoneX + (plateZoneW - plateW) / 2;
        const plateY = plateZoneY + (plateZoneH - plateH) / 2 + 8;
        const plateFill = ctx.createLinearGradient(plateX, plateY, plateX, plateY + plateH);
        plateFill.addColorStop(0, "#ffd95f");
        plateFill.addColorStop(1, "#f0bb17");
        ctx.fillStyle = plateFill;
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 5;
        roundRectPath(ctx, plateX, plateY, plateW, plateH, Math.max(14, plateH * 0.14));
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.42)";
        roundRectPath(ctx, plateX + 4, plateY + 4, plateW - 8, Math.max(16, plateH * 0.18), 12);
        ctx.fill();

        ctx.fillStyle = "#111111";
        ctx.textAlign = "center";
        const sharedMaxFont = Math.min(62, plateH * 0.34);
        const sharedMinFont = 22;
        if (!isDouble) {
          drawPlateLineFit(
            ctx,
            clean[0].toUpperCase(),
            plateX + plateW / 2,
            plateY + plateH * 0.66,
            plateW - 42,
            sharedMaxFont,
            sharedMinFont,
            "Helvetica, Arial, sans-serif",
            700,
            1.06
          );
        } else {
          const line1 = clean[0].toUpperCase();
          const line2 = clean[1].toUpperCase();
          const centerX = plateX + plateW / 2;
          const maxTextW = plateW - 44;
          const topY = plateY + plateH * 0.42;
          const bottomY = plateY + plateH * 0.75;
          drawPlateLineFit(
            ctx,
            line1,
            centerX,
            topY,
            maxTextW,
            sharedMaxFont,
            sharedMinFont,
            "Helvetica, Arial, sans-serif",
            700,
            1.06
          );
          drawPlateLineFit(
            ctx,
            line2,
            centerX,
            bottomY,
            maxTextW,
            sharedMaxFont,
            sharedMinFont,
            "Helvetica, Arial, sans-serif",
            700,
            1.06
          );
        }
        ctx.textAlign = "start";
      }

      async function buildPosterDataUrl(row) {
        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 1080;
        const ctx = canvas.getContext("2d");

        const shareUrl = (() => {
          try {
            const params = new URLSearchParams();
            params.set("lang", currentLang === "en" ? "en" : "zh");
            params.set("q", normalizePlate(posterPlateText(row)));
            return new URL(`/?${params.toString()}`, `${SHARE_SITE_URL}/`).toString();
          } catch {
            return SHARE_SITE_URL;
          }
        })();

        const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        g.addColorStop(0, "#edf6ff");
        g.addColorStop(0.5, "#d7ebff");
        g.addColorStop(1, "#eef2fb");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        drawPosterOrb(ctx, 180, 140, 220, "rgba(132,213,255,0.48)");
        drawPosterOrb(ctx, 1010, 170, 250, "rgba(255,222,143,0.42)");
        drawPosterOrb(ctx, 930, 930, 260, "rgba(182,198,255,0.28)");

        const cardX = 34;
        const cardY = 34;
        const cardW = canvas.width - 68;
        const cardH = canvas.height - 68;
        drawGlassPanel(ctx, cardX, cardY, cardW, cardH, 42, {
          from: "rgba(255,255,255,0.64)",
          to: "rgba(222,235,255,0.24)",
          stroke: "rgba(255,255,255,0.82)",
          shadow: "rgba(8,33,69,0.18)",
          shadowBlur: 44,
        });

        const logo = await loadPosterLogo();
        const headerX = cardX + 28;
        const headerY = cardY + 28;
        const headerW = cardW - 56;
        const headerH = 128;
        drawGlassPanel(ctx, headerX, headerY, headerW, headerH, 34, {
          from: "rgba(255,255,255,0.76)",
          to: "rgba(229,241,255,0.28)",
          stroke: "rgba(255,255,255,0.84)",
          shadow: "rgba(8,29,60,0.16)",
          shadowBlur: 20,
        });
        ctx.drawImage(logo, headerX + 22, headerY + 18, 92, 92);
        ctx.fillStyle = "#102b43";
        const zhTitleFit = fitPosterSingleLine(ctx, "香港車牌拍賣結果搜尋", 500, {
          maxFont: 34,
          minFont: 24,
        });
        ctx.font = `700 ${zhTitleFit.fontSize}px 'Noto Sans HK', Helvetica, Arial, sans-serif`;
        ctx.fillText(zhTitleFit.text, headerX + 138, headerY + 54);
        ctx.fillStyle = "#446179";
        const enTitleFit = fitPosterSingleLine(ctx, "Hong Kong Plate Auction Search", 500, {
          maxFont: 20,
          minFont: 16,
          family: "Helvetica, Arial, sans-serif",
          weight: 600,
        });
        ctx.font = `600 ${enTitleFit.fontSize}px Helvetica, Arial, sans-serif`;
        ctx.fillText(enTitleFit.text, headerX + 138, headerY + 90);

        const priceText = formatPriceText(row);
        const priceW = 294;
        const priceH = 94;
        const priceX = headerX + headerW - priceW - 22;
        const priceY = headerY + 17;
        drawGlassPanel(ctx, priceX, priceY, priceW, priceH, 28, {
          from: "rgba(14,44,79,0.78)",
          to: "rgba(24,129,193,0.46)",
          stroke: "rgba(255,255,255,0.38)",
          shadow: "rgba(9,31,61,0.24)",
          shadowBlur: 22,
        });
        ctx.fillStyle = "rgba(255,255,255,0.72)";
        ctx.font = "700 18px 'Noto Sans HK', Helvetica, Arial, sans-serif";
        ctx.fillText("成交價 Price", priceX + 22, priceY + 26);
        ctx.fillStyle = "#ffffff";
        const priceFit = fitPosterSingleLine(ctx, priceText, priceW - 44, {
          maxFont: 36,
          minFont: 22,
        });
        ctx.font = `700 ${priceFit.fontSize}px 'Noto Sans HK', Helvetica, Arial, sans-serif`;
        ctx.fillText(priceFit.text, priceX + 22, priceY + 66);

        const singleText = String(row.single_line || "").trim() || "(n/a)";
        const doubleLines = posterDoubleLines(row).filter((x) => !/^\(?n\/a\)?$/i.test(x));
        const showDouble = doubleLines.length > 0;
        const stageX = cardX + 28;
        const stageY = headerY + headerH + 20;
        const stageW = cardW - 56;
        const stageH = 520;
        drawGlassPanel(ctx, stageX, stageY, stageW, stageH, 36, {
          from: "rgba(255,255,255,0.62)",
          to: "rgba(227,239,255,0.2)",
          stroke: "rgba(255,255,255,0.8)",
          shadow: "rgba(11,39,75,0.1)",
          shadowBlur: 16,
        });
        const stageInnerX = stageX + 22;
        const stageInnerY = stageY + 22;
        const stageInnerW = stageW - 44;
        const stageInnerH = stageH - 44;
        const gapW = 18;
        const unifiedCardW = (stageInnerW - gapW) / 2;
        const unifiedCardH = stageInnerH;
        if (showDouble) {
          const singleCardX = stageInnerX;
          const singleCardY = stageInnerY;
          drawPlateCard(
            ctx,
            singleCardX,
            singleCardY,
            unifiedCardW,
            unifiedCardH,
            "單排排列 Single-line",
            [singleText]
          );
          const doubleCardX = singleCardX + unifiedCardW + gapW;
          const doubleCardY = stageInnerY;
          drawPlateCard(
            ctx,
            doubleCardX,
            doubleCardY,
            unifiedCardW,
            unifiedCardH,
            "雙排排列 Double-line",
            doubleLines
          );
        } else {
          const singleCardX = stageInnerX + (stageInnerW - unifiedCardW) / 2;
          drawPlateCard(
            ctx,
            singleCardX,
            stageInnerY,
            unifiedCardW,
            unifiedCardH,
            "單排排列 Single-line",
            [singleText]
          );
        }

        const footerTop = stageY + stageH + 20;
        const leftColX = stageX;
        const leftColW = 620;
        drawPosterMetaCard(ctx, leftColX, footerTop, leftColW, 104, "拍賣日期 Auction Date", formatAuctionDate(row), {
          valueSize: 24,
          minValueSize: 18,
          maxLines: 1,
        });
        drawPosterMetaCard(
          ctx,
          leftColX,
          footerTop + 118,
          leftColW,
          104,
          "分類 Category",
          posterCategoryLabelBilingual(row),
          { valueSize: 22, minValueSize: 15, maxLines: 1 }
        );

        const qrPanelW = 280;
        const qrPanelH = 226;
        const qrPanelX = cardX + cardW - qrPanelW - 28;
        const qrPanelY = footerTop;
        drawGlassPanel(ctx, qrPanelX, qrPanelY, qrPanelW, qrPanelH, 30, {
          from: "rgba(255,255,255,0.74)",
          to: "rgba(224,238,255,0.28)",
          stroke: "rgba(255,255,255,0.76)",
          shadow: "rgba(8,31,63,0.14)",
          shadowBlur: 20,
        });
        const qrSize = 180;
        const qrX = qrPanelX + Math.round((qrPanelW - qrSize) / 2);
        const qrY = qrPanelY + Math.round((qrPanelH - qrSize) / 2);
        ctx.fillStyle = "#ffffff";
        roundRectPath(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 22);
        ctx.fill();
        try {
          const qr = loadPosterQr(shareUrl, qrSize);
          ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
        } catch {
          ctx.fillStyle = "#f1f1f1";
          ctx.fillRect(qrX, qrY, qrSize, qrSize);
          ctx.fillStyle = "#0f1c2b";
          ctx.font = "600 22px 'Noto Sans HK', Helvetica, Arial, sans-serif";
          const lines = wrapText(ctx, shareUrl, qrSize - 24);
          let y = qrY + 90;
          for (const ln of lines.slice(0, 3)) {
            ctx.fillText(ln, qrX + 12, y);
            y += 30;
          }
        }
        return canvas.toDataURL("image/png");
      }

      async function openShareModal(row) {
        shareTitleEl.textContent = t("sharePosterTitle");
        shareDownloadEl.textContent = t("downloadPoster");
        sharePreviewEl.removeAttribute("src");
        shareModalEl.classList.add("open");
        shareModalEl.setAttribute("aria-hidden", "false");
        currentPosterDataUrl = await buildPosterDataUrl(row);
        sharePreviewEl.src = currentPosterDataUrl;
      }

      function closeShareModal() {
        shareModalEl.classList.remove("open");
        shareModalEl.setAttribute("aria-hidden", "true");
      }

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

      function plateDisplayText(row) {
        const single = String(row?.single_line || "").trim();
        if (single) return single;
        const dbl = Array.isArray(row?.double_line) ? row.double_line : String(row?.double_line || "").split(/\n+/);
        return dbl.map((x) => String(x || "").trim()).filter(Boolean).join(" ");
      }

      function renderSearchAssist({ totalCount = 0, selectedIssue = "", q = "" } = {}) {
        let note = "";
        if (!q) {
          note = selectedIssue
            ? t("searchNoteIssue")(issueLabelForDate(selectedIssue))
            : currentDataset === "all"
              ? t("searchNoteAllEmpty")
              : t("searchNoteDatasetEmpty");
        } else if (q.length <= 2 && currentDataset === "all") {
          note = t("searchNoteShort");
        } else {
          note = t("searchNoteQuery")(totalCount.toLocaleString());
        }
        searchNoteEl.textContent = note;
        const hasHistory = renderSearchHistory();
        searchAssistEl.hidden = !note && !hasHistory;
      }

      function currentIssueIndex(selectedIssue) {
        if (!selectedIssue) return -1;
        return issueDatesDesc.indexOf(selectedIssue);
      }

      function currentIssueSourceHref(selectedIssue) {
        const meta = auctionsByDate[selectedIssue];
        if (!meta) return "";
        return normalizePdfUrl(meta.source_url || meta.pdf_url || "");
      }

      function currentIssueTotalMetricText(selectedIssue) {
        if (!selectedIssue) return "HK$-";
        const meta = auctionsByDate[selectedIssue];
        let amount = meta?.total_sale_proceeds_hkd;
        if (amount == null) {
          const rows = loadedIssues.get(selectedIssue) || [];
          amount = computeIssueTotal(rows);
        }
        if (amount == null) return "HK$-";
        return `HK$${Number(amount).toLocaleString("en-HK")}`;
      }

      function issueSummaryText(selectedIssue, totalCount, q = "") {
        if (!selectedIssue) return "";
        const label = issueLabelForDate(selectedIssue);
        if (q) return t("issuePanelSummaryFiltered")(q, Number(totalCount || 0).toLocaleString());
        if (currentDataset === "tvrm_legacy") return t("issuePanelSummaryLegacy")(label);
        return t("issuePanelSummaryIssue")(label, datasetLabelForKey(currentDataset));
      }

      function issueViewHref(issueKey = "", datasetKey = currentDataset) {
        const search = buildStateSearch({ dataset: datasetKey, issue: issueKey || "", q: "", sort: "amount_desc" });
        return search ? `${location.pathname}?${search}` : location.pathname;
      }

      async function copyIssueLink(selectedIssue) {
        const href = new URL(issueViewHref(selectedIssue), location.href).toString();
        try {
          await navigator.clipboard.writeText(href);
          statusEl.textContent = t("issuePanelCopied");
        } catch {
          statusEl.textContent = href;
        }
      }

      function renderIssuePanel({ selectedIssue = "", totalCount = 0, q = normalizePlate(qEl.value) } = {}) {
        if (!selectedIssue || currentDataset === "all") {
          document.body.classList.remove("issue-mode-active");
          issuePanelEl.hidden = true;
          issuePanelEl.innerHTML = "";
          return;
        }
        document.body.classList.add("issue-mode-active");
        const idx = currentIssueIndex(selectedIssue);
        const prevIssue = idx >= 0 && idx + 1 < issueDatesDesc.length ? issueDatesDesc[idx + 1] : "";
        const nextIssue = idx > 0 ? issueDatesDesc[idx - 1] : "";
        const sourceHref = currentIssueSourceHref(selectedIssue);
        const label = issueLabelForDate(selectedIssue);
        const rawIssueCount = Number(getIssueMeta(selectedIssue)?.count || totalCount || 0);
        const issueCount = rawIssueCount.toLocaleString();
        const visibleCount = Number(totalCount || rawIssueCount || 0).toLocaleString();
        const pageLabel = `${currentPage} / ${Math.max(1, Math.ceil((rawIssueCount || 1) / pageSize))}`;
        const badges = [
          currentDataset === "tvrm_legacy" ? t("issuePanelBadgeLegacy") : t("issuePanelBadgeIssue"),
          q ? t("issuePanelBadgeFiltered") : "",
        ].filter(Boolean);
        issuePanelEl.hidden = false;
        issuePanelEl.innerHTML = `
          <div class="issue-panel-head">
            <div>
              <div class="issue-kicker">${escapeHtml(t("issuePanelKicker"))}</div>
              <div class="issue-title">${escapeHtml(label)}</div>
              <div class="issue-subtitle">${escapeHtml(datasetLabelForKey(currentDataset))}</div>
              <div class="issue-summary">${escapeHtml(issueSummaryText(selectedIssue, totalCount, q))}</div>
              <div class="issue-badges">
                ${badges.map((badge) => `<span class="badge">${escapeHtml(badge)}</span>`).join("")}
              </div>
            </div>
            <div class="issue-actions">
              ${sourceHref ? `<a class="issue-link-btn" href="${sourceHref}" target="_blank" rel="noopener">${escapeHtml(t("issuePanelSource"))}</a>` : ""}
              <button class="issue-link-btn" type="button" id="copyIssueLinkBtn">${escapeHtml(t("issuePanelShare"))}</button>
              <a class="issue-link-btn secondary" href="${issueViewHref("", currentDataset)}" id="issueBackLink">${escapeHtml(t("issuePanelBack"))}</a>
            </div>
          </div>
          <div class="issue-metrics">
            <div class="fact"><div class="k">${escapeHtml(t("issuePanelRows"))}</div><div class="v">${escapeHtml(issueCount)}</div></div>
            <div class="fact"><div class="k">${escapeHtml(t("issuePanelVisible"))}</div><div class="v">${escapeHtml(visibleCount)}</div></div>
            <div class="fact"><div class="k">${escapeHtml(t("issuePanelPage"))}</div><div class="v">${escapeHtml(pageLabel)}</div></div>
            <div class="fact"><div class="k">${escapeHtml(t("issuePanelDataset"))}</div><div class="v">${escapeHtml(datasetLabelForKey(currentDataset))}</div></div>
            <div class="fact"><div class="k">${escapeHtml(t("issuePanelTotal"))}</div><div class="v">${escapeHtml(currentIssueTotalMetricText(selectedIssue))}</div></div>
          </div>
          <div class="issue-nav">
            <div class="issue-nav-group">
              ${prevIssue ? `<a class="issue-link-btn secondary" href="${issueViewHref(prevIssue, currentDataset)}" data-issue-nav="${escapeHtml(prevIssue)}">${escapeHtml(t("issuePanelPrev"))}</a>` : ""}
              ${nextIssue ? `<a class="issue-link-btn secondary" href="${issueViewHref(nextIssue, currentDataset)}" data-issue-nav="${escapeHtml(nextIssue)}">${escapeHtml(t("issuePanelNext"))}</a>` : ""}
            </div>
          </div>
        `;
        const copyBtn = document.getElementById("copyIssueLinkBtn");
        if (copyBtn) {
          copyBtn.addEventListener("click", () => {
            copyIssueLink(selectedIssue).catch(() => {});
          });
        }
      }

      function buildStateSearch({ dataset, issue, q, sort, lang } = {}) {
        const params = new URLSearchParams();
        const nextLang = lang || currentLang;
        const nextDataset = dataset || currentDataset || "all";
        const nextIssue = issue != null ? issue : (issueEl.value || "");
        const nextQuery = q != null ? normalizePlate(q) : normalizePlate(qEl.value);
        const nextSort = sort || sortEl.value || "amount_desc";
        if (nextLang === "zh" || nextLang === "en") params.set("lang", nextLang);
        if (nextDataset && nextDataset !== "all") params.set("d", nextDataset);
        if (nextIssue && nextDataset !== "all") params.set("issue", nextIssue);
        if (nextQuery) params.set("q", nextQuery);
        if (nextSort && nextSort !== "amount_desc") params.set("sort", nextSort);
        return params.toString();
      }

      function updateUrlState(nextState = {}) {
        const search = buildStateSearch(nextState);
        const next = search ? `${location.pathname}?${search}` : location.pathname;
        history.replaceState({}, "", next);
      }

      function issueTargetForRow(row) {
        const datasetKey = row && row.dataset_key ? row.dataset_key : currentDataset;
        const issueKey = row && row.auction_date ? String(row.auction_date) : "";
        if (!datasetKey || datasetKey === "all" || !issueKey) return null;
        return { datasetKey, issueKey };
      }

      function issueHrefForRow(row) {
        const target = issueTargetForRow(row);
        if (!target) return "#";
        const search = buildStateSearch({
          dataset: target.datasetKey,
          issue: target.issueKey,
          q: "",
        });
        return search ? `${location.pathname}?${search}` : location.pathname;
      }

      async function openIssueByKey(datasetKey, issueKey) {
        if (!datasetKey || !issueKey) return;
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchState = null;
        qEl.value = "";
        currentPage = 1;
        statusEl.textContent = t("loading");
        if (currentDataset !== datasetKey) {
          datasetEl.value = datasetKey;
          await loadDataset(datasetKey);
          applyLanguage();
        } else {
          buildIssueOptions();
        }
        issueEl.value = issueKey;
        updateIssueTotal(issueKey);
        updateUrlState({ dataset: datasetKey, issue: issueKey, q: "" });
        await applyFilters({ resetPage: true });
      }

      async function openIssueFromRow(row) {
        const target = issueTargetForRow(row);
        if (!target) return;
        await openIssueByKey(target.datasetKey, target.issueKey);
      }

      async function switchDataset(datasetKey, { preserveQuery = true } = {}) {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        statusEl.textContent = t("loading");
        searchState = null;
        datasetEl.value = datasetKey;
        await loadDataset(datasetKey);
        applyLanguage();
        if (!preserveQuery) qEl.value = "";
        updateUrlState({ dataset: datasetKey, issue: "", q: preserveQuery ? normalizePlate(qEl.value) : "" });
        await applyFilters({ resetPage: true });
      }

      async function clearIssueSelection({ preserveQuery = true } = {}) {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchState = null;
        if (!preserveQuery) qEl.value = "";
        issueEl.value = "";
        currentPage = 1;
        updateIssueTotal("");
        updateUrlState({ issue: "", q: preserveQuery ? normalizePlate(qEl.value) : "" });
        await applyFilters({ resetPage: true });
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
        const params = new URLSearchParams(location.search);
        const queryLang = params.get("lang");
        if (queryLang === "en" || queryLang === "zh") {
          currentLang = queryLang;
        }
        searchHistory = loadSearchHistory();

        const queryDataset = params.get("d");
        const queryIssue = params.get("issue") || "";
        const queryQ = normalizePlate(params.get("q") || "");
        const querySort = params.get("sort") || "amount_desc";
        currentDataset = queryDataset || "all";

        buildDatasetOptions();
        datasetEl.value = currentDataset;
        applyLanguage();
        qEl.value = queryQ;
        if (["date_desc", "amount_desc", "amount_asc", "plate_asc"].includes(querySort)) {
          sortEl.value = querySort;
        }
        statusEl.textContent = t("loading");
        await loadDataset(currentDataset);
        applyLanguage();
        if (queryIssue && currentDataset !== "all" && issueDatesDesc.includes(queryIssue)) {
          issueEl.value = queryIssue;
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
        openShareModal(row).catch(() => {
          closeShareModal();
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
      shareCloseEl.addEventListener("click", closeShareModal);
      searchHistoryEl.addEventListener("click", (ev) => {
        const clearBtn = ev.target.closest("[data-history-clear]");
        if (clearBtn) {
          ev.preventDefault();
          clearSearchHistory();
          renderSearchAssist({ totalCount: renderedTotalCount, selectedIssue: issueEl.value || "", q: normalizePlate(qEl.value) });
          return;
        }
        const historyBtn = ev.target.closest("[data-history-query]");
        if (!historyBtn) return;
        ev.preventDefault();
        qEl.value = historyBtn.getAttribute("data-history-query") || "";
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchState = null;
        cancelActiveFilterRequest();
        updateUrlState();
        applyFilters({ resetPage: true });
      });
      shareModalEl.addEventListener("click", (ev) => {
        if (ev.target === shareModalEl) closeShareModal();
      });
      shareDownloadEl.addEventListener("click", () => {
        if (!currentPosterDataUrl) return;
        const a = document.createElement("a");
        a.href = currentPosterDataUrl;
        a.download = `platehk-${Date.now()}.png`;
        a.click();
      });
      document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape" && shareModalEl.classList.contains("open")) closeShareModal();
      });

      qEl.addEventListener("input", () => {
        const replaced = qEl.value.toUpperCase().replace(/I/g, "1").replace(/O/g, "0").replace(/Q/g, "");
        if (replaced !== qEl.value) qEl.value = replaced;
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        cancelActiveFilterRequest();
        searchDebounceTimer = setTimeout(() => {
          searchState = null;
          updateUrlState();
          applyFilters({ resetPage: true });
        }, 250);
      });
      issueEl.addEventListener("change", () => {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        cancelActiveFilterRequest();
        searchState = null;
        updateUrlState();
        applyFilters({ resetPage: true });
      });
      sortEl.addEventListener("change", () => {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        cancelActiveFilterRequest();
        searchState = null;
        updateUrlState();
        applyFilters({ resetPage: true });
      });
      datasetEl.addEventListener("change", () => {
        cancelActiveFilterRequest();
        switchDataset(datasetEl.value)
          .catch((err) => {
            statusEl.textContent = t("loadFailed")(err.message);
          });
      });
      function setLang(newLang, updateUrl = true) {
        if (newLang !== "en" && newLang !== "zh") return;
        if (currentLang === newLang) return;
        currentLang = newLang;
        applyLanguage();
        applyFilters({ resetPage: false });
        if (updateUrl) {
          updateUrlState({ lang: currentLang });
        }
      }
      langZhEl.addEventListener("click", () => setLang("zh"));
      langEnEl.addEventListener("click", () => setLang("en"));
      bottomPrevEl.addEventListener("click", handleBottomPrev);
      bottomNextEl.addEventListener("click", handleBottomNext);
      resetEl.addEventListener("click", () => {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        cancelActiveFilterRequest();
        qEl.value = "";
        issueEl.value = "";
        sortEl.value = "amount_desc";
        currentPage = 1;
        searchState = null;
        updateUrlState({ q: "", issue: "", sort: "amount_desc" });
        applyFilters({ resetPage: true });
      });

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
            .register("./sw.js?v=20260328-03", { updateViaCache: "none" })
            .catch(() => {});
        });
      }
    
