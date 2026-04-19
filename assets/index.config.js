const INDEX_I18N = {
        zh: {
          datasetAll: "全部車牌",
          datasetPvrm: "自訂車牌 PVRM",
          datasetTvrmPhysical: "傳統車牌：實體拍賣",
          datasetTvrmEauction: "傳統車牌：拍牌易",
          datasetTvrmLegacy: "傳統車牌：1973-2006 年",
          searchPanelTitle: "搜尋",
          searchPanelNote: "先選資料集，再輸入車牌或直接瀏覽期數。",
          queryLabel: "車牌搜尋",
          datasetLabel: "資料集",
          issueLabel: "期數",
          sortLabel: "排序",
          datasetGuideTitle: "資料集導覽",
          datasetGuideNote: "把跨庫搜尋與 4 個來源類型分開理解會更清楚。",
          issueGuideTitle: "期數入口",
          issueGuideNoteAll: "全部車牌模式只做跨資料集搜尋；如要逐期瀏覽，先切換到單一資料集。",
          issueGuideNoteDataset: "可從這裡進入最新一期、返回全部期數，或繼續當前期數頁。",
          issueGuideLatest: "最新期數",
          issueGuideCurrent: "目前期數",
          issueGuideCurrentNone: "未選定",
          issueGuideTotalIssues: "期數總數",
          issueGuideOpenLatest: "打開最新一期",
          issueGuideOpenCurrent: "回到目前期數",
          issueGuideBrowseAll: "瀏覽全部期數",
          allLinksTitle: "官方入口",
          allLinksNote: "快速前往政府與拍牌易相關網站。",
          allLinksPvrm: "運輸署：自訂車牌拍賣",
          allLinksTvrm: "運輸署：傳統車牌拍賣",
          allLinksEauction: "拍牌易網站",
          allLinksHistory: "運輸署：車牌拍賣歷史",
          resultsKickerAll: "跨資料集結果",
          resultsKickerDataset: "資料集結果",
          resultsKickerIssue: "期數結果",
          resultsTitleAll: "全部車牌搜尋結果",
          resultsTitleDataset: (label) => `${label} 結果`,
          resultsTitleIssue: (label) => `${label} 期數頁`,
          resultsSubtitleAllEmpty: "目前是首頁導覽模式；開始搜尋後，結果會集中顯示在這裡。",
          resultsSubtitleAllQuery: (q, count) => `正在跨資料集搜尋「${q}」，目前共 ${count} 筆結果。`,
          resultsSubtitleDataset: (label, count) => `正在瀏覽 ${label}，目前載入結果 ${count} 筆。`,
          resultsSubtitleIssue: (label, count) => `正在查看 ${label}，本次畫面共顯示 ${count} 筆結果。`,
          resultsChipDataset: "分類",
          resultsChipQuery: "查詢",
          resultsChipIssue: "期數",
          resultsChipRows: "結果",
          emptyStateAll: "開始搜尋，或切換到單一資料集逐期瀏覽。",
          emptyStateDataset: (label) => `${label} 目前沒有可顯示結果。`,
          emptyStateIssue: (label) => `${label} 目前沒有可顯示結果。`,
          emptyStateQueryAll: (q) => `找不到「${q}」的跨資料集結果。`,
          emptyStateQueryDataset: (label, q) => `${label} 找不到「${q}」的結果。`,
          emptyStateQueryIssue: (label, q) => `${label} 內找不到「${q}」的結果。`,
          emptyStateHintBrowse: "可改用其他關鍵字、切換資料集，或直接進入某一期。",
          emptyStateHintSearch: "可縮短關鍵字、移除篩選，或改到其他資料集再試。",
          headerTitle: "香港車牌拍賣結果搜尋",
          headerAll: "全部車牌",
          headerPvrm: "自訂車牌 PVRM",
          headerTvrmPhysical: "傳統車牌 TVRM (實體拍賣)",
          headerTvrmEauction: "傳統車牌 TVRM (拍牌易)",
          headerTvrmLegacy: "傳統車牌 TVRM (1973-2006 年)",
          introAll: "默認跨所有資料集搜尋，包括 PVRM、TVRM 實體拍賣、拍牌易，以及 1973-2006 年歷史年份分段資料。",
          introPvrm: "",
          introTvrmPhysical: "",
          introTvrmEauction: "",
          introTvrmLegacy: "此資料集現在只保留 1973-2006 年的歷史工作簿年份區段；2007 年起有正式拍賣日期的資料已併入傳統車牌日期分期。",
          datasetSwitchTitle: "資料集切換",
          datasetSwitchNote: "可直接在這裡切換 5 個資料視圖。",
          datasetDescAll: "跨 4 個資料集一起搜尋；legacy 與其他 TVRM 的重複結果會自動隱藏。",
          datasetDescPvrm: "自訂車牌的實體拍賣結果，和普通傳統車牌分開。",
          datasetDescTvrmPhysical: "傳統車牌的實體拍賣，主要看「HK」/「XX」字首與特殊車牌。",
          datasetDescTvrmEauction: "拍牌易的普通車牌網上拍賣結果，不含自訂車牌與特殊車牌。",
          datasetDescTvrmLegacy: "官方歷史工作簿的 1973-2006 年資料，只能準確到年份區段，適合補早年成交紀錄。",
          factVisibleRows: "可見結果",
          factIssueRanges: "年份分段",
          factDatasets: "資料集",
          factTopPrice: "最高成交價",
          factHiddenDupes: "已隱藏重複",
          issuePanelKicker: "期數模式",
          issuePanelRows: "本期車牌數",
          issuePanelVisible: "目前可見",
          issuePanelPage: "目前頁碼",
          issuePanelDataset: "目前分類",
          issuePanelTotal: "本期總額",
          issuePanelSource: "來源檔案",
          issuePanelShare: "複製本期連結",
          issuePanelBack: "返回全部期數",
          issuePanelPrev: "上一期",
          issuePanelNext: "下一期",
          issuePanelCopied: "已複製本期連結",
          issuePanelBadgeIssue: "單一期數",
          issuePanelBadgeLegacy: "年份區段",
          issuePanelBadgeFiltered: "本期內搜尋中",
          issuePanelSummaryIssue: (label, datasetLabel) => `你正在查看 ${datasetLabel} 的 ${label}，可在本期內搜尋、翻頁或切到前後期。`,
          issuePanelSummaryLegacy: (label) => `你正在查看 ${label} 的歷史年份分段頁。這裡反映的是年份區段，不是單一拍賣日。2007 年起請改看實體拍賣或拍牌易的日期分期。`,
          issuePanelSummaryFiltered: (q, count) => `目前正於本期內搜尋「${q}」，共匹配 ${count} 筆結果。`,
          searchNoteAllEmpty: "",
          searchNoteDatasetEmpty: "",
          searchNoteIssue: (label) => `你正在查看 ${label}，可於本期內搜尋或直接翻頁。`,
          searchNoteShort: "短查詢會先用靜態索引縮小範圍，再顯示最相關結果。",
          searchNoteQuery: (count) => `目前查詢共匹配 ${count} 筆結果。`,
          searchHistoryLabel: "最近搜尋",
          searchHistoryClear: "清除",
          pageTitle: "香港自訂車牌拍賣結果搜尋",
          queryPlaceholderAll: "輸入車牌，例如 HK 8788 或 L1BERTY",
          queryPlaceholderPvrm: "輸入車牌，例如 L1BERTY",
          queryPlaceholderTvrmPhysical: "輸入車牌，例如 HK 8788",
          queryPlaceholderTvrmEauction: "輸入車牌，例如 ZZ 9888",
          queryPlaceholderTvrmLegacy: "輸入車牌，例如 AR 4000",
          reset: "清除條件",
          sortDateDesc: "日期：新至舊",
          sortAmountDesc: "金額：高至低",
          sortAmountAsc: "金額：低至高",
          sortPlateAsc: "車牌：A-Z",
          issueAll: "全部期數",
          thDate: "拍賣日期",
          thCategory: "分類",
          thSingle: "單行排列",
          thDouble: "雙行排列",
          thPrice: "成交價（HKD）",
          thPdf: "來源 / 分享",
          viewPdf: "查看 PDF",
          share: "分享",
          sharePosterTitle: "分享海報",
          downloadPoster: "保存圖片",
          shareSiteLabel: "網站",
          shareSourceLabel: "原始 PDF",
          prevPage: "上一頁",
          nextPage: "下一頁",
          prevIssue: "上一期",
          nextIssue: "下一期",
          thisIssue: "本期",
          updatePrefix: "最後更新：",
          statusFmt: (total, matched, mode) => `共 ${total} 筆，符合 ${matched} 筆。${mode}`,
          modeAll: (p, totalPages) => `第 ${p} / ${totalPages} 頁，每頁 200 筆。`,
          modeIssue: (count, p, totalPages) => `本期共 ${count} 筆，第 ${p} / ${totalPages} 頁，每頁 200 筆。`,
          modeSearching: (loaded, totalIssues) => `搜尋中：已掃描 ${loaded} / ${totalIssues} 期。`,
          modeShortChar1: (count, p, totalPages) => `單字搜尋使用包含匹配，共 ${count} 筆，第 ${p} / ${totalPages} 頁。`,
          modeShortBigram: (count, p, totalPages) => `短查詢使用包含匹配，共 ${count} 筆，第 ${p} / ${totalPages} 頁。`,
          searchProgress: (loaded, totalIssues) => `搜尋進度：${loaded} / ${totalIssues} 期`,
          modePreparing: (loaded, totalIssues) => `正在準備完整排序：已載入 ${loaded} / ${totalIssues} 期。`,
          bottomAll: (p, totalPages) => `第 ${p} / ${totalPages} 頁（每頁 200 筆）`,
          bottomIssue: (idx, total) => `期數 ${idx} / ${total}`,
          loading: "讀取資料中...",
          loadFailed: (e) => `載入失敗：${e}`,
          disclaimer:
            "聲明：本網站所有數據均來自運輸署網站。如有任何錯誤或差異，應以運輸署網站公布結果為準。",
          unresolved: "未能自動解析",
          totalProceedsLabel: "全日拍賣所得款項",
          totalProceedsLabelPhysical: "全日拍賣總額",
          totalProceedsLabelEauction: "本期拍賣總額",
          totalProceedsLabelLegacy: "此年份區段總額",
          totalProceedsUnavailable: "未能從原始 PDF 讀取",
          totalProceedsCalculating: "正在計算…",
          totalProceedsComputed: "（已按成交金額加總）",
          fromPdf: "來自原始 PDF",
          fromSourceFile: "來自來源檔案",
          viewSource: "查看來源檔案",
          resultAssignedSpecialFee: "特別費分配",
          issueUnavailableAll: "全部資料集不提供單一期數篩選",
          datasetLoadHint: (datasetLabel, path, detail) =>
            `資料集載入失敗：${datasetLabel}（${path}）。${detail ? " " + detail : ""}請確認已部署對應的 data 檔案。`,
          apiSearchUnavailable: "搜尋服務暫時不可用（API）。",
          apiSearchLocalFallback: "已自動改用本機資料搜尋（首次可能較慢）。",
          apiSearchOfflineFallback: "目前離線，改用本機資料搜尋中…",
          apiRateLimited: (retry) => retry ? `請求過於頻繁，請在 ${retry} 秒後再試。` : "請求過於頻繁，請稍後再試。",
          apiQueryWindowExceeded: "短查詢只提供前幾頁結果，請輸入更多字符以縮窄搜尋範圍。",
          apiInvalidPaging: "請求的頁數或每頁數量不被接受，請重試。",
          popularLink: "熱門車牌",
          cameraLink: "📷",
          termsLink: "使用條款",
          privacyLink: "私隱政策",
          changelogLink: "更新日誌",
          auditLink: "資料審核",
          apiLink: "API 文檔",
          feedbackLink: "反饋表格",
          termsUrl: "./terms.html?lang=zh",
          privacyUrl: "./privacy.html?lang=zh",
          changelogUrl: "./changelog.html?lang=zh",
          auditUrl: "./audit.html?lang=zh",
          apiUrl: "./api.html?lang=zh",
          feedbackUrl: "https://forms.gle/1YFfSmraLp27YneU9",
        },
        en: {
          datasetAll: "All Plates",
          datasetPvrm: "PVRM (Personalized)",
          datasetTvrmPhysical: "TVRM (Physical)",
          datasetTvrmEauction: "TVRM (E-Auction)",
          datasetTvrmLegacy: "TVRM (1973-2006 Historical Ranges)",
          searchPanelTitle: "Search",
          searchPanelNote: "Pick a dataset, enter a plate, or browse issues directly.",
          queryLabel: "Plate query",
          datasetLabel: "Dataset",
          issueLabel: "Issue",
          sortLabel: "Sort",
          datasetGuideTitle: "Dataset Guide",
          datasetGuideNote: "The site is clearer when all-datasets search and the 4 source types are treated as separate views.",
          issueGuideTitle: "Issue Entry",
          issueGuideNoteAll: "The all-datasets view is for cross-dataset search only. Switch to a single dataset to browse issue by issue.",
          issueGuideNoteDataset: "Jump into the latest issue, return to all issues, or continue the current issue page from here.",
          issueGuideLatest: "Latest issue",
          issueGuideCurrent: "Current issue",
          issueGuideCurrentNone: "None selected",
          issueGuideTotalIssues: "Total issues",
          issueGuideOpenLatest: "Open latest issue",
          issueGuideOpenCurrent: "Open current issue",
          issueGuideBrowseAll: "Browse all issues",
          allLinksTitle: "Official Links",
          allLinksNote: "Quick access to government and E-Auction pages.",
          allLinksPvrm: "TD: PVRM Auction",
          allLinksTvrm: "TD: TVRM Auction",
          allLinksEauction: "E-Auction Website",
          allLinksHistory: "TD: VRM Auction History",
          resultsKickerAll: "Cross-dataset results",
          resultsKickerDataset: "Dataset results",
          resultsKickerIssue: "Issue results",
          resultsTitleAll: "All Plates results",
          resultsTitleDataset: (label) => `${label} results`,
          resultsTitleIssue: (label) => `${label} issue view`,
          resultsSubtitleAllEmpty: "You are on the discovery homepage. Once a search starts, the focused results state appears here.",
          resultsSubtitleAllQuery: (q, count) => `Searching "${q}" across datasets currently returns ${count} results.`,
          resultsSubtitleDataset: (label, count) => `Browsing ${label} currently shows ${count} loaded results.`,
          resultsSubtitleIssue: (label, count) => `Viewing ${label}; this screen currently shows ${count} rows.`,
          resultsChipDataset: "Dataset",
          resultsChipQuery: "Query",
          resultsChipIssue: "Issue",
          resultsChipRows: "Rows",
          emptyStateAll: "Start with a search, or switch to a single dataset to browse issue by issue.",
          emptyStateDataset: (label) => `No displayable rows are currently available for ${label}.`,
          emptyStateIssue: (label) => `No displayable rows are currently available for ${label}.`,
          emptyStateQueryAll: (q) => `No cross-dataset results were found for "${q}".`,
          emptyStateQueryDataset: (label, q) => `${label} has no results for "${q}".`,
          emptyStateQueryIssue: (label, q) => `${label} has no matches for "${q}" within this issue.`,
          emptyStateHintBrowse: "Try another keyword, switch datasets, or open a specific issue.",
          emptyStateHintSearch: "Try a shorter query, remove filters, or search another dataset.",
          headerTitle: "Hong Kong Vehicle Registration Marks Search",
          headerAll: "All Plates",
          headerPvrm: "Personalized PVRM",
          headerTvrmPhysical: "Traditional TVRM (Physical Auction)",
          headerTvrmEauction: "Traditional TVRM (E-Auction)",
          headerTvrmLegacy: "Traditional TVRM (1973-2006 Historical Ranges)",
          introAll: "Default search spans all datasets, including PVRM, TVRM physical auctions, e-auction, and the legacy year-range workbook data.",
          introPvrm: "",
          introTvrmPhysical: "",
          introTvrmEauction: "",
          introTvrmLegacy: "This dataset now keeps only the 1973-2006 workbook ranges. Rows with exact auction dates from 2007 onward have been merged into the dated traditional TVRM issues.",
          datasetSwitchTitle: "Dataset Switch",
          datasetSwitchNote: "Use this section to switch between the 5 data views directly.",
          datasetDescAll: "Search across all 4 datasets, with overlapping legacy TVRM rows hidden when newer TVRM data already covers them.",
          datasetDescPvrm: "Physical auction results for personalized marks, separate from ordinary traditional marks.",
          datasetDescTvrmPhysical: "Physical traditional-mark auctions, mainly for \"HK\" / \"XX\" prefix marks and special marks.",
          datasetDescTvrmEauction: "Ordinary traditional marks sold through E-Auction, excluding personalized and special marks.",
          datasetDescTvrmLegacy: "Official historical workbook data, accurate only to year ranges and useful for earlier archive coverage.",
          factVisibleRows: "Visible rows",
          factIssueRanges: "Year ranges",
          factDatasets: "Datasets",
          factTopPrice: "Top sale",
          factHiddenDupes: "Hidden duplicates",
          issuePanelKicker: "Issue View",
          issuePanelRows: "Rows in issue",
          issuePanelVisible: "Visible now",
          issuePanelPage: "Current page",
          issuePanelDataset: "Dataset",
          issuePanelTotal: "Issue total",
          issuePanelSource: "Source file",
          issuePanelShare: "Copy issue link",
          issuePanelBack: "Back to all issues",
          issuePanelPrev: "Previous issue",
          issuePanelNext: "Next issue",
          issuePanelCopied: "Issue link copied",
          issuePanelBadgeIssue: "Single issue",
          issuePanelBadgeLegacy: "Year range",
          issuePanelBadgeFiltered: "Filtering within issue",
          issuePanelSummaryIssue: (label, datasetLabel) => `You are viewing ${label} from ${datasetLabel}. Search within this issue, page through it, or move to the previous/next issue.`,
          issuePanelSummaryLegacy: (label) => `You are viewing the historical ${label} range. This is a year-range shard rather than a single auction date; use the dated TVRM issues for 2007 onward.`,
          issuePanelSummaryFiltered: (q, count) => `Filtering within this issue for "${q}" now returns ${count} matching rows.`,
          searchNoteAllEmpty: "",
          searchNoteDatasetEmpty: "",
          searchNoteIssue: (label) => `You are viewing ${label}. Search within this issue or page through the full results.`,
          searchNoteShort: "Short queries use the static index first, then refine to the most relevant results.",
          searchNoteQuery: (count) => `${count} results currently match this query.`,
          searchHistoryLabel: "Recent",
          searchHistoryClear: "Clear",
          pageTitle: "Personalized Vehicle Registration Marks Auction Search",
          queryPlaceholderAll: "Enter a plate, e.g. HK 8788 or L1BERTY",
          queryPlaceholderPvrm: "Enter a plate, e.g. L1BERTY",
          queryPlaceholderTvrmPhysical: "Enter a plate, e.g. HK 8788",
          queryPlaceholderTvrmEauction: "Enter a plate, e.g. ZZ 9888",
          queryPlaceholderTvrmLegacy: "Enter a plate, e.g. AR 4000",
          reset: "Reset",
          sortDateDesc: "Date: New to Old",
          sortAmountDesc: "Amount: High to Low",
          sortAmountAsc: "Amount: Low to High",
          sortPlateAsc: "Plate: A-Z",
          issueAll: "All issues",
          thDate: "Auction Date",
          thCategory: "Category",
          thSingle: "Single-line",
          thDouble: "Double-line",
          thPrice: "Price (HKD)",
          thPdf: "Source / Share",
          viewPdf: "View PDF",
          share: "Share",
          sharePosterTitle: "Share Poster",
          downloadPoster: "Download Image",
          shareSiteLabel: "Website",
          shareSourceLabel: "Source PDF",
          prevPage: "Prev page",
          nextPage: "Next page",
          prevIssue: "Prev issue",
          nextIssue: "Next issue",
          thisIssue: "This issue",
          updatePrefix: "Last updated: ",
          statusFmt: (total, matched, mode) => `Total ${total} records, ${matched} matched. ${mode}`,
          modeAll: (p, totalPages) => `Page ${p} / ${totalPages}, 200 rows per page.`,
          modeIssue: (count, p, totalPages) => `This issue has ${count} rows. Page ${p} / ${totalPages}, 200 rows per page.`,
          modeSearching: (loaded, totalIssues) => `Searching: scanned ${loaded} / ${totalIssues} issues.`,
          modeShortChar1: (count, p, totalPages) => `One-character query uses contains matching. ${count} rows, page ${p} / ${totalPages}.`,
          modeShortBigram: (count, p, totalPages) => `Short query uses contains matching. ${count} rows, page ${p} / ${totalPages}.`,
          searchProgress: (loaded, totalIssues) => `Search progress: ${loaded} / ${totalIssues} issues`,
          modePreparing: (loaded, totalIssues) => `Preparing full ranking: loaded ${loaded} / ${totalIssues} issues.`,
          bottomAll: (p, totalPages) => `Page ${p} / ${totalPages} (200 per page)`,
          bottomIssue: (idx, total) => `Issue ${idx} / ${total}`,
          loading: "Loading data...",
          loadFailed: (e) => `Load failed: ${e}`,
          disclaimer:
            "Disclaimer: All data on this site comes from the Transport Department website. If any discrepancy is found, the official Transport Department published results shall prevail.",
          unresolved: "Unable to parse",
          totalProceedsLabel: "Total sale proceeds from today's auction",
          totalProceedsLabelPhysical: "Total sale proceeds from today's auction",
          totalProceedsLabelEauction: "Total sale proceeds for this auction period",
          totalProceedsLabelLegacy: "Total proceeds for this year-range bucket",
          totalProceedsUnavailable: "Unavailable from source PDF",
          totalProceedsCalculating: "Calculating…",
          totalProceedsComputed: "(computed from item totals)",
          fromPdf: "from source PDF",
          fromSourceFile: "from source file",
          viewSource: "View source file",
          resultAssignedSpecialFee: "Assigned by special fee",
          issueUnavailableAll: "Issue filtering is unavailable in the all-datasets view",
          datasetLoadHint: (datasetLabel, path, detail) =>
            `Dataset load failed: ${datasetLabel} (${path}).${detail ? " " + detail : ""} Please ensure the corresponding data files are deployed.`,
          apiSearchUnavailable: "Search service is temporarily unavailable (API).",
          apiSearchLocalFallback: "Automatically switched to local data search (first run may be slower).",
          apiSearchOfflineFallback: "You are offline. Falling back to local search…",
          apiRateLimited: (retry) => retry ? `Too many requests. Please try again in ${retry} seconds.` : "Too many requests. Please try again shortly.",
          apiQueryWindowExceeded: "Short queries only expose the first few pages. Enter more characters to narrow the search.",
          apiInvalidPaging: "The requested page or page size was not accepted. Please try again.",
          popularLink: "Popular Plates",
          cameraLink: "📷",
          termsLink: "Terms of Use",
          privacyLink: "Privacy Policy",
          changelogLink: "Changelog",
          auditLink: "Data Audit",
          apiLink: "API Docs",
          feedbackLink: "Feedback Form",
          termsUrl: "./terms.html?lang=en",
          privacyUrl: "./privacy.html?lang=en",
          changelogUrl: "./changelog.html?lang=en",
          auditUrl: "./audit.html?lang=en",
          apiUrl: "./api.html?lang=en",
          feedbackUrl: "https://forms.gle/1YFfSmraLp27YneU9",
        },
      };

      const rowsEl = document.getElementById("rows");
      const statusEl = document.getElementById("status");
      const updatedAtEl = document.getElementById("updatedAt");
      const issueTotalEl = document.getElementById("issueTotal");
      const disclaimerEl = document.getElementById("disclaimer");
      const termsLinkEl = document.getElementById("termsLink");
      const cameraTopLinkEl = document.getElementById("cameraTopLink");
      const popularLinkEl = document.getElementById("popularLink");
      const privacyLinkEl = document.getElementById("privacyLink");
      const changelogLinkEl = document.getElementById("changelogLink");
      const auditLinkEl = document.getElementById("auditLink");
      const apiLinkEl = document.getElementById("apiLink");
      const feedbackLinkEl = document.getElementById("feedbackLink");
      const titleMainEl = document.getElementById("titleMain");
      const titleDatasetEl = document.getElementById("titleDataset");
      const brandLogoEl = document.getElementById("brandLogo");
      const searchPanelTitleEl = document.getElementById("searchPanelTitle");
      const searchPanelNoteEl = document.getElementById("searchPanelNote");
      const queryLabelEl = document.getElementById("queryLabel");
      const datasetLabelEl = document.getElementById("datasetLabel");
      const issueLabelEl = document.getElementById("issueLabel");
      const sortLabelEl = document.getElementById("sortLabel");
      const resultsContextEl = document.getElementById("resultsContext");
      const resultsTableWrapEl = document.getElementById("resultsTableWrap");
      const resultsTableEl = document.getElementById("resultsTable");
      const homeShelfEl = document.getElementById("homeShelf");
      const datasetGuideEl = document.getElementById("datasetGuide");
      const issueGuideEl = document.getElementById("issueGuide");
      const introEl = document.getElementById("intro");
      const qEl = document.getElementById("q");
      const datasetEl = document.getElementById("dataset");
      const issueEl = document.getElementById("issue");
      const sortEl = document.getElementById("sort");
      const searchAssistEl = document.getElementById("searchAssist");
      const searchNoteEl = document.getElementById("searchNote");
      const searchHistoryEl = document.getElementById("searchHistory");
      const issuePanelEl = document.getElementById("issuePanel");
      const langZhEl = document.getElementById("langZh");
      const langEnEl = document.getElementById("langEn");
      const resetEl = document.getElementById("reset");
      const thDateEl = document.getElementById("thDate");
      const thCategoryEl = document.getElementById("thCategory");
      const thSingleEl = document.getElementById("thSingle");
      const thDoubleEl = document.getElementById("thDouble");
      const thPriceEl = document.getElementById("thPrice");
      const thPdfEl = document.getElementById("thPdf");
      const bottomPrevEl = document.getElementById("bottomPrev");
      const bottomNextEl = document.getElementById("bottomNext");
      const bottomInfoEl = document.getElementById("bottomInfo");
      const shareModalEl = document.getElementById("shareModal");
      const shareCloseEl = document.getElementById("shareClose");
      const shareTitleEl = document.getElementById("shareTitle");
      const sharePreviewEl = document.getElementById("sharePreview");
      const shareDownloadEl = document.getElementById("shareDownload");
      const searchProgressEl = document.getElementById("searchProgress");
      const searchProgressBarEl = document.getElementById("searchProgressBar");
      const searchProgressTextEl = document.getElementById("searchProgressText");

      let manifest = { total_rows: 0, issue_count: 0, issues: [] };
      let auctionsByDate = {};
      const loadedIssues = new Map();
      const loadingIssues = new Map();
      const failedIssues = new Set();
      let presetAmountDescRows = [];
      let issueDatesDesc = [];
      let currentPage = 1;
      let currentLang = "zh";
      let lastUpdatedDate = null;
      const pageSize = 200;
      let renderVersion = 0;
      let currentDataset = "all";
      let searchState = null; // cache progressive search across pages
      let activeFilterRequestController = null;
      let issueTotalToken = 0;
      let activeSearchWorker = null;
      let activeSearchSeq = 0;
      let renderedRows = [];
      let renderedTotalCount = 0;
      const SHARE_SITE_URL =
        typeof location !== "undefined" && location.origin
          ? location.origin
          : "https://plate.hk";
      const char1Cache = new Map();
      const loadingChar1 = new Map();
      const bigramCache = new Map();
      const loadingBigram = new Map();
      let allTvrmLegacyOverlapKeys = null;
      let loadingAllTvrmLegacyOverlapKeys = null;
      const SEARCH_HISTORY_STORAGE_KEY = "platehk.searchHistory.v1";
      const SEARCH_HISTORY_MAX = 8;
      let searchHistory = [];

      const INDEX_DATASETS = {
        all: {
          titleZh: "香港全部車牌拍賣結果搜尋",
          titleEn: "All Hong Kong VRM Auction Results Search",
          children: ["pvrm", "tvrm_physical", "tvrm_eauction", "tvrm_legacy"],
        },
        pvrm: {
          titleZh: "香港自訂車牌拍賣結果搜尋",
          titleEn: "Personalized Vehicle Registration Marks Auction Search",
          base: "./data",
        },
        tvrm_physical: {
          titleZh: "香港傳統車牌（實體拍賣）結果搜尋",
          titleEn: "Traditional Vehicle Registration Marks (Physical Auction) Search",
          base: "./data/tvrm_physical",
        },
        tvrm_eauction: {
          titleZh: "香港傳統車牌（拍牌易網上拍賣）結果搜尋",
          titleEn: "Traditional Vehicle Registration Marks (E-Auction) Search",
          base: "./data/tvrm_eauction",
        },
        tvrm_legacy: {
          titleZh: "香港傳統車牌（1973-2006 年）結果搜尋",
          titleEn: "Traditional Vehicle Registration Marks (1973-2006 Historical Ranges) Search",
          base: "./data/tvrm_legacy",
        },
      };

window.PLATE_INDEX_CONFIG = { I18N: INDEX_I18N, DATASETS: INDEX_DATASETS };
