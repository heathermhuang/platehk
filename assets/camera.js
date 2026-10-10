      const I18N = {
        zh: {
          title: "相機車牌辨識搜尋",
          subtitle: "用相機、照片或手動輸入，查詢香港車牌拍賣紀錄。",
          kicker: "香港車牌相機搜尋",
          lede:
            "開始相機或選擇香港車牌照片，再按辨識。亦可直接輸入車牌搜尋，不需要相機權限。",
          tips: [
            "把車牌放在中央框內，盡量保持水平、避免強反光與背景文字。",
            "系統會把 I→1、O→0，並自動忽略香港車牌不會使用的 Q。",
            "按 AI 辨識才會傳送相機框內裁切圖像，或已選照片縮小後的圖像；只會搜尋香港車牌。"
          ],
          m1k: "輸入方式",
          m1v: "相機或照片",
          m2k: "辨識方式",
          m2v: "伺服器端 Vision OCR",
          m3k: "搜尋資料源",
          m3v: "本站 API",
          m4k: "最佳情境",
          m4v: "白天 / 正面 / 單一香港牌",
          privacyNote: "選擇照片只會在本機預覽。按 AI 辨識才會傳送相機框內裁切圖像，或已選照片縮小後的圖像。",
          guideLeft: "把車牌放進框內",
          guideRight: "點 AI 辨識才會上傳框內裁切圖像",
          start: "開始相機",
          aiScan: "AI 辨識 · 上傳框內",
          choosePhoto: "選擇照片",
          removePhoto: "移除照片",
          scanPhoto: "AI 辨識 · 上傳照片",
          photoPreview: "已選擇的車牌照片",
          photoLoading: "正在讀取照片…",
          photoReady: "照片已準備好",
          photoHint: "照片只在這個瀏覽器預覽。按「AI 辨識 · 上傳照片」才會傳送這張照片；請選擇只包含車牌的照片。",
          photoInvalid: "未能讀取這張照片。請選擇 JPEG、PNG 或 WebP 圖片，再試一次。",
          photoTooLarge: "請選擇不超過 20 MB、4,000 萬像素的照片。",
          manualHelp: "支援全形字元；I / O 會轉為 1 / 0。車牌須有 1–8 個英文字母或數字，不接受 Q。",
          manualInvalid: "請輸入 1–8 個英文字母或數字，不接受 Q。",
          searchFailed: "未能載入搜尋結果。請稍後重試。",
          frameNotReady: "畫面未準備好，請稍後再按辨識。",
          skip: "跳至車牌搜尋",
          stop: "停止相機",
          openSearch: "打開完整搜尋頁",
          statusTitle: "辨識狀態",
          statusIdle: "待命中",
          statusLoading: "正在啟動相機…",
          statusVision: "AI 辨識中",
          statusReady: "相機已啟動",
          statusSearching: "正在查詢",
          statusError: "需要調整",
          statusDetected: "已完成辨識",
          detectedHintIdle: "尚未辨識到穩定車牌",
          detectedHintReady: "相機預覽已啟動；點 AI 辨識才會上傳白框內裁切圖像",
          detectedHintSingle: "可直接點候選或手動修正",
          detectedHintDetected: (q) => `目前穩定候選：${q}`,
          manualPlaceholder: "手動輸入車牌，例如 HK88 或 1R1S LAM",
          manualSearch: "手動搜尋",
          ocrMetaIdle: "尚未送出 AI 辨識。",
          ocrMetaFmt: (text, confidence) => `OCR 原文：${text || "—"}；信心 ${confidence}%`,
          resultsTitle: "搜尋結果",
          resultsBadgeIdle: "等待查詢",
          resultsBadgeLoading: "載入中",
          resultsBadgeOk: (count) => `${count} 筆`,
          resultsBadgeNone: "沒有結果",
          resultsHintIdle: "辨識或手動搜尋後，這裡會顯示最相關的 5 筆結果。",
          resultsHintNoMatch: (q) => `找不到「${q}」的結果。你可以換角度重試，或改用手動輸入。`,
          resultsHintFound: (q, total) => `「${q}」目前共找到 ${total} 筆結果；以下先顯示最相關的 5 筆。`,
          resultsOpenFull: "查看完整結果",
          resultsOpenPdf: "原始來源",
          resultDate: "拍賣日期",
          resultDataset: "分類",
          resultAmount: "成交價",
          resultUnknown: "未能自動解析",
          resultLegacyRange: "1973-2006 年分段",
          cameraPermissionHelp: "開始相機或選擇車牌照片。亦可在下方直接輸入車牌。",
          cameraUnsupported: "此裝置或瀏覽器暫不支援即時相機辨識。",
          cameraPermissionDenied: "尚未獲得相機權限；請允許相機後再試。",
          visionNotConfigured: "AI 辨識暫時不可用。請直接輸入車牌搜尋。",
          visionFailed: "AI 辨識失敗，請換一張照片或調整相機角度後再試。",
          visionRateLimited: "辨識請求過於頻繁，請稍等片刻再試。",
          visionCooldownActive: (seconds) => `辨識過於頻繁，系統會在 ${seconds} 秒後再接受新請求。`,
          visionOriginDenied: "此辨識請求來源不被接受，請從本站重新打開相機頁。",
          nonHongKongPlateIgnored: (label) => `偵測到${label}，已略過；請把香港車牌放進框內。`,
          foreignPlateMacau: "澳門車牌",
          foreignPlateMainland: "內地車牌",
          foreignPlateGeneric: "非香港車牌",
          searchRateLimited: (seconds) => seconds ? `搜尋請求過於頻繁，請在 ${seconds} 秒後再試。` : "搜尋請求過於頻繁，請稍後再試。",
          backHome: "返回搜尋首頁",
          apiDoc: "API 文檔",
          changelog: "更新日誌",
          github: "GitHub",
        },
        en: {
          title: "Camera Plate Search",
          subtitle: "Look up Hong Kong plate records using a camera, photo or manual input.",
          kicker: "Hong Kong plate camera lookup",
          lede:
            "Start the camera or choose a Hong Kong plate photo, then scan. You can also enter a mark manually without camera access.",
          tips: [
            "Keep the plate inside the center frame, level, with limited glare and minimal background text.",
            "The recognizer maps I→1, O→0, and drops Q because Hong Kong plates do not use them.",
            "Only AI Scan sends the cropped camera region or resized selected photo for recognition. Only Hong Kong plates are searched."
          ],
          m1k: "Input",
          m1v: "Camera or photo",
          m2k: "Recognition",
          m2v: "Server-side vision OCR",
          m3k: "Search source",
          m3v: "Site API",
          m4k: "Best case",
          m4v: "Daylight / front view / single HK plate",
          privacyNote: "Choosing a photo only previews it locally. AI Scan sends either the cropped camera region or the selected photo, resized for recognition.",
          guideLeft: "Place the plate inside the frame",
          guideRight: "AI Scan uploads the cropped frame",
          start: "Start camera",
          aiScan: "AI Scan · Upload crop",
          choosePhoto: "Choose photo",
          removePhoto: "Remove photo",
          scanPhoto: "AI Scan · Upload photo",
          photoPreview: "Selected plate photo",
          photoLoading: "Loading photo…",
          photoReady: "Photo ready",
          photoHint: "The photo stays in this browser until you choose AI Scan · Upload photo. That sends this photo; choose one containing only the plate.",
          photoInvalid: "This photo could not be read. Choose a JPEG, PNG or WebP image and try again.",
          photoTooLarge: "Choose a photo no larger than 20 MB and 40 megapixels.",
          manualHelp: "Full-width input is supported; I / O become 1 / 0. Enter 1–8 letters or numbers; Q is not allowed.",
          manualInvalid: "Enter 1–8 letters or numbers; Q is not allowed.",
          searchFailed: "Search results could not be loaded. Please try again shortly.",
          frameNotReady: "The preview is not ready. Wait a moment and scan again.",
          skip: "Skip to plate search",
          stop: "Stop camera",
          openSearch: "Open full search page",
          statusTitle: "Recognition status",
          statusIdle: "Idle",
          statusLoading: "Starting camera…",
          statusVision: "AI scanning",
          statusReady: "Camera is live",
          statusSearching: "Searching",
          statusError: "Needs attention",
          statusDetected: "Recognition complete",
          detectedHintIdle: "No stable plate detected yet",
          detectedHintReady: "Camera preview is live; only AI Scan uploads the cropped frame",
          detectedHintSingle: "Tap a candidate or correct it manually",
          detectedHintDetected: (q) => `Current stable candidate: ${q}`,
          manualPlaceholder: "Type a plate manually, e.g. HK88 or 1R1S LAM",
          manualSearch: "Search manually",
          ocrMetaIdle: "No AI scan sent yet.",
          ocrMetaFmt: (text, confidence) => `OCR raw text: ${text || "—"}; confidence ${confidence}%`,
          resultsTitle: "Search results",
          resultsBadgeIdle: "Waiting",
          resultsBadgeLoading: "Loading",
          resultsBadgeOk: (count) => `${count} rows`,
          resultsBadgeNone: "No result",
          resultsHintIdle: "After recognition or manual search, the top 5 matches will appear here.",
          resultsHintNoMatch: (q) => `No results were found for "${q}". Try another angle or correct the text manually.`,
          resultsHintFound: (q, total) => `"${q}" currently returns ${total} results; the 5 most relevant rows are shown first.`,
          resultsOpenFull: "Open full results",
          resultsOpenPdf: "Source file",
          resultDate: "Auction date",
          resultDataset: "Dataset",
          resultAmount: "Amount",
          resultUnknown: "Unparsed",
          resultLegacyRange: "1973-2006 range",
          cameraPermissionHelp: "Start the camera or choose a plate photo. You can also enter the plate below.",
          cameraUnsupported: "Live camera scanning is not supported on this device or browser.",
          cameraPermissionDenied: "Camera access is blocked. Please allow camera permission and try again.",
          visionNotConfigured: "AI scanning is unavailable. Enter the plate number manually.",
          visionFailed: "AI scan failed. Try another photo or adjust the camera angle.",
          visionRateLimited: "Too many AI scan requests. Please wait a moment and try again.",
          visionCooldownActive: (seconds) => `Too many scans. New AI requests will be accepted again in ${seconds} seconds.`,
          visionOriginDenied: "This scan request origin was rejected. Please reopen the camera page from this site.",
          nonHongKongPlateIgnored: (label) => `${label} detected and ignored. Place the Hong Kong plate inside the frame.`,
          foreignPlateMacau: "Macau plate",
          foreignPlateMainland: "Mainland China plate",
          foreignPlateGeneric: "Non-Hong Kong plate",
          searchRateLimited: (seconds) => seconds ? `Too many search requests. Please try again in ${seconds} seconds.` : "Too many search requests. Please try again shortly.",
          backHome: "Back to search home",
          apiDoc: "API Docs",
          changelog: "Changelog",
          github: "GitHub",
        },
      };

      const DATASET_LABELS = {
        zh: {
          pvrm: "自訂車牌 PVRM",
          tvrm_physical: "傳統車牌 TVRM（實體）",
          tvrm_eauction: "傳統車牌 TVRM（拍牌易）",
          tvrm_legacy: "傳統車牌 1973-2006 年",
        },
        en: {
          pvrm: "PVRM",
          tvrm_physical: "TVRM (Physical)",
          tvrm_eauction: "TVRM (E-Auction)",
          tvrm_legacy: "TVRM 1973-2006",
        },
      };

      const titleEl = document.getElementById("title");
      const subtitleEl = document.getElementById("subtitle");
      const kickerEl = document.getElementById("kicker");
      const ledeEl = document.getElementById("lede");
      const tipsEl = document.getElementById("tips");
      const m1kEl = document.getElementById("m1k");
      const m1vEl = document.getElementById("m1v");
      const m2kEl = document.getElementById("m2k");
      const m2vEl = document.getElementById("m2v");
      const m3kEl = document.getElementById("m3k");
      const m3vEl = document.getElementById("m3v");
      const m4kEl = document.getElementById("m4k");
      const m4vEl = document.getElementById("m4v");
      const privacyNoteEl = document.getElementById("privacyNote");
      const guideLeftEl = document.getElementById("guideLeft");
      const guideRightEl = document.getElementById("guideRight");
      const guideBoxEl = document.getElementById("guideBox");
      const startBtnEl = document.getElementById("startBtn");
      const aiScanBtnEl = document.getElementById("aiScanBtn");
      const stopBtnEl = document.getElementById("stopBtn");
      const openSearchLinkEl = document.getElementById("openSearchLink");
      const statusTitleEl = document.getElementById("statusTitle");
      const statusBadgeEl = document.getElementById("statusBadge");
      const detectedPlateEl = document.getElementById("detectedPlate");
      const detectedHintEl = document.getElementById("detectedHint");
      const candidateListEl = document.getElementById("candidateList");
      const manualInputEl = document.getElementById("manualInput");
      const manualSearchBtnEl = document.getElementById("manualSearchBtn");
      const ocrMetaEl = document.getElementById("ocrMeta");
      const resultsTitleEl = document.getElementById("resultsTitle");
      const resultsBadgeEl = document.getElementById("resultsBadge");
      const resultsEl = document.getElementById("results");
      const resultsHintEl = document.getElementById("resultsHint");
      const videoEl = document.getElementById("video");
      const cameraEmptyEl = document.getElementById("cameraEmpty");
      const canvasEl = document.getElementById("ocrCanvas");
      const photoInputEl = document.getElementById("photoInput");
      const choosePhotoEl = document.getElementById("choosePhoto");
      const removePhotoEl = document.getElementById("removePhoto");
      const photoPreviewEl = document.getElementById("photoPreview");
      const photoHintEl = document.getElementById("photoHint");
      const manualHelpEl = document.getElementById("manualHelp");
      const manualErrorEl = document.getElementById("manualError");
      const backHomeEl = document.getElementById("backHome");
      const brandHomeLinkEl = document.getElementById("brandHomeLink");
      const apiDocEl = document.getElementById("apiDoc");
      const changelogEl = document.getElementById("changelog");
      const githubEl = document.getElementById("github");
      const langZhEl = document.getElementById("langZh");
      const langEnEl = document.getElementById("langEn");

      const params = new URLSearchParams(location.search);
      let currentLang = params.get("lang") === "en" ? "en" : "zh";
      let mediaStream = null;
      let scanRunning = false;
      let cameraStarting = false;
      let photoLoading = false;
      let photoImage = null;
      let sourceGeneration = 0;
      let visionAbort = null;
      let lastSearchedQuery = "";
      let lastResults = null;
      let latestCandidates = [];
      let latestConfidence = 0;
      let latestRawText = "";
      let searchAbort = null;
      let visionCooldownUntil = 0;
      let visionSessionToken = "";
      let visionSessionExpiresAt = 0;

      function t(key) {
        return I18N[currentLang][key];
      }

      function normalizePlate(value) {
        return String(value || "")
          .normalize("NFKC")
          .toUpperCase()
          .replace(/\s+/g, "")
          .replace(/[^A-Z0-9]+/g, "")
          .replace(/I/g, "1")
          .replace(/O/g, "0")
          .replace(/Q/g, "")
          .trim();
      }

      function normalizeVisionPlateType(type) {
        const value = String(type || "").toLowerCase().replace(/[\s-]+/g, "_");
        if (value === "macau" || value === "macao") return "macau";
        if (value === "mainland" || value === "mainland_china" || value === "china" || value === "prc") return "mainland_china";
        if (value === "not_hk" || value === "non_hk" || value === "not_hong_kong" || value === "unknown") return "not_hk";
        return "";
      }

      function manualPlateQuery(value) {
        const input = String(value || "").normalize("NFKC").toUpperCase().replace(/\s+/g, "");
        return /^[A-Z0-9]{1,8}$/.test(input) && !input.includes("Q") ? normalizePlate(input) : "";
      }

      function ignoredPlateTypeFromPayload(payload) {
        const ignored = normalizeVisionPlateType(payload?.ignored_plate_type || "");
        if (ignored) return ignored;
        const plateType = normalizeVisionPlateType(payload?.plate_type || "");
        if (plateType && plateType !== "not_hk") return plateType;
        if (payload?.is_hong_kong_plate === false) return "not_hk";
        return "";
      }

      function ignoredPlateLabel(type) {
        if (type === "macau") return t("foreignPlateMacau");
        if (type === "mainland_china") return t("foreignPlateMainland");
        return t("foreignPlateGeneric");
      }

      function datasetLabel(key) {
        return DATASET_LABELS[currentLang][key] || key;
      }

      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function formatAmount(amount) {
        return amount == null ? t("resultUnknown") : `HK$${Number(amount).toLocaleString("en-HK")}`;
      }

      function formatDateFromIso(iso, lang) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
        if (!m) return String(iso || "");
        const y = Number(m[1]);
        const month = Number(m[2]);
        const d = Number(m[3]);
        if (lang === "zh") return `${y}年${month}月${d}日`;
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${d} ${monthNames[month - 1]} ${y}`;
      }

      function parseZhSingleDate(label) {
        const m = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(String(label || "").trim());
        if (!m) return "";
        return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
      }

      function parseZhDateRange(label) {
        const m = /(\d{4})年(\d{1,2})月(\d{1,2})日\s*至\s*(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(String(label || "").trim());
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

      function formatZhRangeShort(parts) {
        if (!parts) return "";
        if (parts.y1 === parts.y2 && parts.m1 === parts.m2) {
          return `${parts.y1}年${parts.m1}月${parts.d1}-${parts.d2}日`;
        }
        if (parts.y1 === parts.y2) {
          return `${parts.y1}年${parts.m1}月${parts.d1}日-${parts.m2}月${parts.d2}日`;
        }
        return `${parts.y1}年${parts.m1}月${parts.d1}日-${parts.y2}年${parts.m2}月${parts.d2}日`;
      }

      function formatEnRangeShort(parts) {
        if (!parts) return "";
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        if (parts.y1 === parts.y2 && parts.m1 === parts.m2) {
          return `${parts.d1}-${parts.d2} ${monthNames[parts.m1 - 1]} ${parts.y1}`;
        }
        if (parts.y1 === parts.y2) {
          return `${parts.d1} ${monthNames[parts.m1 - 1]} - ${parts.d2} ${monthNames[parts.m2 - 1]} ${parts.y1}`;
        }
        return `${parts.d1} ${monthNames[parts.m1 - 1]} ${parts.y1} - ${parts.d2} ${monthNames[parts.m2 - 1]} ${parts.y2}`;
      }

      function formatDate(row) {
        const label = String(row?.auction_date_label || "").trim();
        if (/^\d{4}-\d{4}$/.test(label) || row?.date_precision === "year_range") return label || "—";
        const range = parseZhDateRange(label);
        if (range) return currentLang === "zh" ? formatZhRangeShort(range) : formatEnRangeShort(range);
        const zhSingle = parseZhSingleDate(label);
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(label) ? label : String(row?.auction_date || "").trim() || zhSingle;
        if (iso) return formatDateFromIso(iso, currentLang);
        return label || "—";
      }

      function plateText(row) {
        if (row.single_line) return row.single_line;
        if (Array.isArray(row.double_line)) return row.double_line.filter(Boolean).join(" / ");
        return "";
      }

      function updateLangButtons() {
        langZhEl.setAttribute("aria-pressed", currentLang === "zh" ? "true" : "false");
        langEnEl.setAttribute("aria-pressed", currentLang === "en" ? "true" : "false");
      }

      function updateNavLinks() {
        const activeQuery = manualPlateQuery(manualInputEl.value) || lastSearchedQuery;
        const searchParams = new URLSearchParams({ lang: currentLang });
        if (activeQuery) searchParams.set("q", activeQuery);
        openSearchLinkEl.href = `./index.html?${searchParams.toString()}`;
        brandHomeLinkEl.href = `./index.html?lang=${currentLang}`;
        brandHomeLinkEl.setAttribute("aria-label", t("backHome"));
        backHomeEl.href = `./index.html?lang=${currentLang}`;
        apiDocEl.href = `./api.html?lang=${currentLang}`;
        changelogEl.href = `./changelog.html?lang=${currentLang}`;
        githubEl.href = "https://github.com/heathermhuang/platehk";
      }

      function siteBrand() {
        if (typeof location === "undefined" || !location.hostname) return "Plate.hk";
        return location.hostname === "pvrm.hk" ? "PVRM.hk" : "Plate.hk";
      }

      function applyLanguage() {
        document.documentElement.lang = currentLang === "en" ? "en" : "zh-HK";
        document.title = currentLang === "en"
          ? `Camera Plate Search | ${siteBrand()}`
          : `相機車牌辨識搜尋 | ${siteBrand()}`;
        cameraEmptyEl.textContent = t("cameraPermissionHelp");
        const processingLink = document.querySelector('a[href*="privacy.html"][href*="#camera-uploads"]');
        if (processingLink) {
          processingLink.textContent = currentLang === "en" ? "Image processing and privacy" : "圖像處理及私隱";
          processingLink.href = `./privacy.html?lang=${currentLang}#camera-uploads`;
        }
        titleEl.textContent = t("title");
        subtitleEl.textContent = t("subtitle");
        kickerEl.textContent = t("kicker");
        ledeEl.textContent = t("lede").replaceAll("{site}", siteBrand());
        tipsEl.innerHTML = t("tips").map((item) => `<li>${escapeHtml(item)}</li>`).join("");
        m1kEl.textContent = t("m1k");
        m1vEl.textContent = t("m1v");
        m2kEl.textContent = t("m2k");
        m2vEl.textContent = t("m2v");
        m3kEl.textContent = t("m3k");
        m3vEl.textContent = t("m3v");
        m4kEl.textContent = t("m4k");
        m4vEl.textContent = t("m4v");
        privacyNoteEl.textContent = t("privacyNote");
        guideLeftEl.textContent = t("guideLeft");
        guideRightEl.textContent = t("guideRight");
        startBtnEl.textContent = t("start");
        aiScanBtnEl.textContent = t("aiScan");
        stopBtnEl.textContent = t("stop");
        openSearchLinkEl.textContent = t("openSearch");
        statusTitleEl.textContent = t("statusTitle");
        resultsTitleEl.textContent = t("resultsTitle");
        manualInputEl.placeholder = t("manualPlaceholder");
        const label=document.querySelector('#manualLabel');if(label)label.textContent=currentLang==='en'?'Correct or enter the plate number':'修正或輸入車牌號碼';
        manualInputEl.setAttribute('aria-label',label?.textContent||t('manualPlaceholder'));
        manualHelpEl.textContent = t("manualHelp");
        if (manualInputEl.getAttribute("aria-invalid") === "true") manualErrorEl.textContent = t("manualInvalid");
        document.getElementById("cameraSkip").textContent = t("skip");
        choosePhotoEl.textContent = t("choosePhoto");
        removePhotoEl.textContent = t("removePhoto");
        photoInputEl.setAttribute("aria-label", t("choosePhoto"));
        photoPreviewEl.alt = t("photoPreview");
        updateSourceUi();
        manualSearchBtnEl.textContent = t("manualSearch");
        backHomeEl.textContent = t("backHome");
        apiDocEl.textContent = t("apiDoc");
        changelogEl.textContent = t("changelog");
        githubEl.textContent = t("github");
        updateNavLinks();
        renderCandidates(latestCandidates);
        if (lastResults) renderResults(lastResults.rows, lastResults.total, lastResults.query);
        if (latestRawText) ocrMetaEl.textContent = t("ocrMetaFmt")(latestRawText, latestConfidence);
        else if (!scanRunning && document.body.dataset.cameraState !== "error") ocrMetaEl.textContent = t("ocrMetaIdle");
        updateLangButtons();
      }

      function setStatus(kind, label) {
        statusBadgeEl.className = `status-badge${kind ? ` ${kind}` : ""}`;
        statusBadgeEl.textContent = label;
        document.body.dataset.cameraState = kind || "idle";
      }

      function setDetectedPlate(value, hint) {
        detectedPlateEl.textContent = value || "--";
        detectedHintEl.textContent = hint;
      }

      function renderCandidates(candidates) {
        latestCandidates = Array.isArray(candidates) ? candidates.slice(0, 5) : [];
        candidateListEl.innerHTML = latestCandidates
          .map((candidate) => `<button type="button" class="candidate-chip" data-candidate="${escapeHtml(candidate)}">${escapeHtml(candidate)}</button>`)
          .join("");
      }

      function resetResultsUi() {
        lastResults = null;
        resultsBadgeEl.className = "status-badge";
        resultsBadgeEl.textContent = t("resultsBadgeIdle");
        resultsHintEl.textContent = t("resultsHintIdle");
      }

      function setIdleUi() {
        cameraEmptyEl.textContent = t("cameraPermissionHelp");
        aiScanBtnEl.disabled = true;
        setStatus("", t("statusIdle"));
        setDetectedPlate("--", t("detectedHintIdle"));
        ocrMetaEl.textContent = t("ocrMetaIdle");
        resetResultsUi();
      }

      function updateSourceUi() {
        const busy = scanRunning || cameraStarting || photoLoading;
        startBtnEl.disabled = busy || Boolean(mediaStream);
        stopBtnEl.disabled = busy || !mediaStream;
        choosePhotoEl.disabled = busy;
        photoInputEl.disabled = busy;
        removePhotoEl.disabled = busy || !photoImage;
        removePhotoEl.hidden = !photoImage;
        aiScanBtnEl.disabled = busy || !(mediaStream || photoImage);
        aiScanBtnEl.textContent = t(photoImage ? "scanPhoto" : "aiScan");
        videoEl.hidden = Boolean(photoImage);
        photoPreviewEl.hidden = !photoImage;
        guideBoxEl.hidden = Boolean(photoImage);
        guideLeftEl.textContent = t(photoImage ? "photoPreview" : "guideLeft");
        guideRightEl.textContent = photoImage ? "" : t("guideRight");
        photoHintEl.hidden = !photoImage;
        photoHintEl.textContent = t("photoHint");
      }

      function cancelSourceWork() {
        sourceGeneration += 1;
        visionAbort?.abort();
        searchAbort?.abort();
        if (mediaStream) for (const track of mediaStream.getTracks()) track.stop();
        mediaStream = null;
        videoEl.srcObject = null;
        resultsEl.removeAttribute("aria-busy");
      }

      function releasePhoto() {
        photoImage = null;
        photoPreviewEl.removeAttribute("src");
      }

      async function loadPhoto(file) {
        if (!file || scanRunning || cameraStarting || photoLoading) return;
        photoInputEl.value = ""; // Allow selecting the same file again after a failure.
        if (!file.type.startsWith("image/") || !file.size) {
          setStatus("error", t("statusError"));
          ocrMetaEl.textContent = t("photoInvalid");
          return;
        }
        if (file.size > 20 * 1024 * 1024) {
          setStatus("error", t("statusError"));
          ocrMetaEl.textContent = t("photoTooLarge");
          return;
        }
        photoLoading = true;
        cancelSourceWork();
        const generation = sourceGeneration;
        updateSourceUi();
        setStatus("", t("photoLoading"));
        try {
          // data: previews use the existing image CSP; no new source permission is needed.
          const url = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error(t("photoInvalid")));
            reader.readAsDataURL(file);
          });
          if (generation !== sourceGeneration) return;
          const image = new Image();
          await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = url;
          });
          if (generation !== sourceGeneration) return;
          if (!image.naturalWidth || !image.naturalHeight) throw new Error(t("photoInvalid"));
          if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error(t("photoTooLarge"));
          releasePhoto();
          photoImage = image;
          latestRawText = "";
          latestConfidence = 0;
          photoPreviewEl.src = url;
          cameraEmptyEl.hidden = true;
          resultsEl.replaceChildren();
          renderCandidates([]);
          setDetectedPlate("--", t("detectedHintIdle"));
          resetResultsUi();
          setStatus("ok", t("photoReady"));
          ocrMetaEl.textContent = t("ocrMetaIdle");
        } catch (err) {
          if (generation !== sourceGeneration) return;
          cameraEmptyEl.hidden = !photoImage;
          cameraEmptyEl.textContent = t("cameraPermissionHelp");
          setStatus("error", t("statusError"));
          ocrMetaEl.textContent = err?.message || t("photoInvalid");
        } finally {
          photoLoading = false;
          updateSourceUi();
        }
      }

      function removePhoto() {
        if (scanRunning || photoLoading) return;
        cancelSourceWork();
        releasePhoto();
        resultsEl.replaceChildren();
        renderCandidates([]);
        setIdleUi();
        cameraEmptyEl.hidden = false;
        updateSourceUi();
      }

      function visionSendingText() {
        return currentLang === "zh" ? "AI：正在傳送白框內圖像…" : "AI: sending cropped plate image…";
      }

      function readableCameraError(err) {
        const code = String(err?.name || "");
        const message = String(err?.message || err || "");
        if (code === "NotAllowedError" || code === "PermissionDeniedError") {
          return t("cameraPermissionDenied");
        }
        if (code === "NotFoundError" || code === "NotReadableError" || code === "OverconstrainedError") {
          return t("cameraUnsupported");
        }
        if (/not supported/i.test(message) || /not implemented/i.test(message)) {
          return t("cameraUnsupported");
        }
        if (/permission/i.test(message)) {
          return t("cameraPermissionDenied");
        }
        return t("cameraPermissionHelp");
      }

      function remainingVisionCooldownMs() {
        return Math.max(0, visionCooldownUntil - Date.now());
      }

      async function ensureVisionSessionToken(signal) {
        const now = Math.floor(Date.now() / 1000);
        if (visionSessionToken && visionSessionExpiresAt - now > 20) return visionSessionToken;
        const resp = await fetch("./api/vision_session", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          signal,
        });
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const code = String(payload?.error || "");
          if (code === "invalid_origin" || code === "origin_required") {
            throw new Error(t("visionOriginDenied"));
          }
          if (code === "rate_limited") {
            const retryAfter = Number(resp.headers.get("Retry-After") || 0) || 10;
            applyVisionCooldown(retryAfter);
            throw new Error(t("visionCooldownActive")(retryAfter));
          }
          throw new Error(t("visionFailed"));
        }
        visionSessionToken = String(payload?.token || "");
        visionSessionExpiresAt = Number(payload?.expires_at || 0);
        if (!visionSessionToken) throw new Error(t("visionFailed"));
        return visionSessionToken;
      }

      function applyVisionCooldown(seconds) {
        const safeSeconds = Math.max(1, Number(seconds) || 10);
        visionCooldownUntil = Date.now() + safeSeconds * 1000;
      }

      function renderResults(rows, total, query) {
        lastResults = { rows, total, query };
        if (!rows || !rows.length) {
          resultsEl.innerHTML = "";
          resultsBadgeEl.className = "status-badge warn";
          resultsBadgeEl.textContent = t("resultsBadgeNone");
          resultsHintEl.textContent = query ? t("resultsHintNoMatch")(query) : t("resultsHintIdle");
          return;
        }

        resultsBadgeEl.className = "status-badge ok";
        resultsBadgeEl.textContent = t("resultsBadgeOk")(total.toLocaleString());
        resultsHintEl.textContent = t("resultsHintFound")(query, total.toLocaleString());
        resultsEl.innerHTML = rows
          .map((row) => {
            const searchHref = `./index.html?lang=${currentLang}&q=${encodeURIComponent(normalizePlate(plateText(row)))}`;
            const pdfHref = row.pdf_url || row.source_url || "";
            return `
              <article class="result-row">
                <div class="result-head">
                  <div class="plate">${escapeHtml(plateText(row))}</div>
                  <div class="amount">${escapeHtml(formatAmount(row.amount_hkd))}</div>
                </div>
                <div class="result-meta">
                  ${escapeHtml(t("resultDate"))}: ${escapeHtml(formatDate(row))}<br />
                  ${escapeHtml(t("resultDataset"))}: ${escapeHtml(datasetLabel(row.dataset_key))}<br />
                  ${escapeHtml(t("resultAmount"))}: ${escapeHtml(formatAmount(row.amount_hkd))}
                </div>
                <div class="result-actions">
                  <a href="${searchHref}">${escapeHtml(t("resultsOpenFull"))}</a>
                  ${pdfHref ? `<a href="${escapeHtml(pdfHref)}" target="_blank" rel="noopener">${escapeHtml(t("resultsOpenPdf"))}</a>` : ""}
                </div>
              </article>
            `;
          })
          .join("");
      }


      function drawFrameToCanvas() {
        const ctx = canvasEl.getContext("2d", { willReadFrequently: true });
        if (!ctx) return false;
        if (photoImage) {
          const scale = Math.min(1, 1440 / Math.max(photoImage.naturalWidth, photoImage.naturalHeight));
          canvasEl.width = Math.max(1, Math.round(photoImage.naturalWidth * scale));
          canvasEl.height = Math.max(1, Math.round(photoImage.naturalHeight * scale));
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
          ctx.drawImage(photoImage, 0, 0, canvasEl.width, canvasEl.height);
          return true;
        }
        const vw = videoEl.videoWidth || 0;
        const vh = videoEl.videoHeight || 0;
        if (!vw || !vh) return false;
        const videoRect = videoEl.getBoundingClientRect();
        const guideRect = guideBoxEl.getBoundingClientRect();
        const displayW = videoRect.width || 0;
        const displayH = videoRect.height || 0;
        if (!displayW || !displayH) return false;

        const scale = Math.max(displayW / vw, displayH / vh);
        const scaledW = vw * scale;
        const scaledH = vh * scale;
        const offsetX = (displayW - scaledW) / 2;
        const offsetY = (displayH - scaledH) / 2;

        const relLeft = guideRect.left - videoRect.left;
        const relTop = guideRect.top - videoRect.top;
        const insetX = guideRect.width * 0.035;
        const insetY = guideRect.height * 0.08;

        const cropX = Math.max(0, (relLeft + insetX - offsetX) / scale);
        const cropY = Math.max(0, (relTop + insetY - offsetY) / scale);
        const cropW = Math.min(vw - cropX, Math.max(20, (guideRect.width - insetX * 2) / scale));
        const cropH = Math.min(vh - cropY, Math.max(20, (guideRect.height - insetY * 2) / scale));
        const cropAspect = cropW / cropH;

        canvasEl.width = 1440;
        canvasEl.height = Math.max(220, Math.min(520, Math.round(canvasEl.width / Math.max(1.6, cropAspect))));
        ctx.drawImage(videoEl, cropX, cropY, cropW, cropH, 0, 0, canvasEl.width, canvasEl.height);

        const img = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
        const data = img.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          const boosted = gray > 162 ? 255 : gray < 108 ? 0 : Math.min(255, Math.max(0, (gray - 108) * 3.1));
          data[i] = boosted;
          data[i + 1] = boosted;
          data[i + 2] = boosted;
        }
        ctx.putImageData(img, 0, 0);
        return true;
      }

      function frameImageDataUrl() {
        return canvasEl.toDataURL("image/jpeg", 0.92);
      }

      async function searchPlate(query) {
        searchAbort?.abort();
        const q = manualPlateQuery(query);
        if (!q) {
          manualInputEl.setAttribute("aria-invalid", "true");
          manualErrorEl.textContent = t("manualInvalid");
          manualInputEl.focus();
          return;
        }
        manualInputEl.removeAttribute("aria-invalid");
        manualErrorEl.textContent = "";
        if (searchAbort) searchAbort.abort();
        const controller = new AbortController();
        searchAbort = controller;
        lastSearchedQuery = q;
        manualInputEl.value = q;
        updateNavLinks();
        resultsBadgeEl.className = "status-badge";
        resultsBadgeEl.textContent = t("resultsBadgeLoading");
        resultsHintEl.textContent = "";
        resultsEl.setAttribute("aria-busy", "true");
        try {
          setStatus("", t("statusSearching"));
          const mode = q.length >= 3 ? "&mode=exact_prefix" : "";
          const resp = await fetch(`./api/search?dataset=all&q=${encodeURIComponent(q)}&page=1&page_size=5&sort=amount_desc${mode}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!resp.ok) {
            let message = await resp.text();
            if (resp.headers.get("Content-Type")?.toLowerCase().includes("application/json")) {
              let payload = {};
              try {
                payload = JSON.parse(message || "{}");
              } catch {}
              if (String(payload?.error || "") === "rate_limited") {
                const retryAfter = Number(resp.headers.get("Retry-After") || 0) || 0;
                throw new Error(t("searchRateLimited")(retryAfter));
              }
              message = String(payload?.message || payload?.error || message || "");
            }
            throw new Error(message || "search_failed");
          }
          const payload = await resp.json();
          if (controller.signal.aborted) return;
          renderResults(Array.isArray(payload.rows) ? payload.rows : [], Number(payload.total || 0), q);
          setStatus("ok", t("statusDetected"));
        } catch (err) {
          if (err?.name === "AbortError") return;
          renderResults([], 0, q);
          resultsHintEl.textContent = /rate|too many|過於頻繁/i.test(err?.message || "") ? err.message : t("searchFailed");
          setStatus("error", t("statusError"));
        } finally {
          if (searchAbort === controller) resultsEl.removeAttribute("aria-busy");
        }
      }

      async function runVisionScan() {
        if (!(mediaStream || photoImage) || scanRunning || photoLoading) return;
        const cooldownMs = remainingVisionCooldownMs();
        if (cooldownMs > 0) {
          const seconds = Math.max(1, Math.ceil(cooldownMs / 1000));
          setStatus("warn", t("statusError"));
          ocrMetaEl.textContent = t("visionCooldownActive")(seconds);
          return;
        }
        if (!drawFrameToCanvas()) {
          ocrMetaEl.textContent = t("frameNotReady");
          return;
        }
        const generation = sourceGeneration;
        const controller = new AbortController();
        visionAbort = controller;
        const imageDataUrl = frameImageDataUrl();
        scanRunning = true;
        updateSourceUi();
        try {
          setStatus("", t("statusVision"));
          ocrMetaEl.textContent = photoImage ? t("scanPhoto") : visionSendingText();
          renderCandidates([]);
          const visionToken = await ensureVisionSessionToken(controller.signal);
          if (controller.signal.aborted || generation !== sourceGeneration) return;
          const resp = await fetch("./api/vision_plate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
            body: JSON.stringify({
              lang: currentLang,
              vision_token: visionToken,
              image_data_url: imageDataUrl,
            }),
          });
          const payload = await resp.json().catch(() => ({}));
          if (controller.signal.aborted || generation !== sourceGeneration) return;
          if (!resp.ok) {
            const code = String(payload?.error || "");
            if (code === "vision_not_configured") {
              throw new Error(t("visionNotConfigured"));
            }
            if (code === "rate_limited") {
              const retryAfter = Number(resp.headers.get("Retry-After") || 0) || 10;
              applyVisionCooldown(retryAfter);
              const err = new Error(t("visionCooldownActive")(retryAfter));
              err.code = "rate_limited";
              throw err;
            }
            if (code === "invalid_origin" || code === "origin_required" || code === "vision_token_required" || code === "vision_token_invalid" || code === "vision_token_expired") {
              visionSessionToken = "";
              visionSessionExpiresAt = 0;
              throw new Error(t("visionOriginDenied"));
            }
            throw new Error(t("visionFailed"));
          }
          const ignoredPlateType = ignoredPlateTypeFromPayload(payload);
          const modelPlate = normalizePlate(payload?.plate || "");
          latestRawText = normalizePlate(payload?.raw_text || modelPlate);
          latestConfidence = Math.round(Math.max(0, Math.min(100, Number(payload?.confidence || 0) * 100)));
          ocrMetaEl.textContent = t("ocrMetaFmt")(latestRawText, latestConfidence);
          if (ignoredPlateType) {
            const ignoredMessage = t("nonHongKongPlateIgnored")(ignoredPlateLabel(ignoredPlateType));
            ocrMetaEl.textContent = latestRawText
              ? `${ignoredMessage} ${t("ocrMetaFmt")(latestRawText, latestConfidence)}`
              : ignoredMessage;
            setDetectedPlate("--", ignoredMessage);
            renderCandidates([]);
            setStatus("warn", t("statusError"));
            return;
          }
          const primaryPlate =
            modelPlate && latestRawText && latestRawText !== modelPlate && latestConfidence < 85
              ? latestRawText
              : modelPlate;
          if (!primaryPlate) {
            setDetectedPlate("--", t("detectedHintIdle"));
            renderCandidates([]);
            setStatus("warn", t("statusError"));
            return;
          }
          const candidates = Array.from(new Set([
            primaryPlate,
            modelPlate,
            modelPlate ? latestRawText : "",
          ].filter(Boolean)));
          renderCandidates(candidates);
          setDetectedPlate(primaryPlate, t("detectedHintDetected")(primaryPlate));
          setStatus("ok", t("statusDetected"));
          await searchPlate(primaryPlate);
        } catch (err) {
          if (controller.signal.aborted || generation !== sourceGeneration) return;
          setStatus(err?.code === "rate_limited" ? "warn" : "error", t("statusError"));
          ocrMetaEl.textContent = String(err?.message || err || "");
        } finally {
          scanRunning = false;
          if (visionAbort === controller) visionAbort = null;
          updateSourceUi();
        }
      }

      async function startCamera() {
        if (cameraStarting || scanRunning || photoLoading || mediaStream) return;
        cancelSourceWork();
        releasePhoto();
        const generation = sourceGeneration;
        cameraStarting = true;
        cameraEmptyEl.hidden = false;
        updateSourceUi();
        try {
          cameraEmptyEl.textContent = t("statusLoading");
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
          if (generation !== sourceGeneration) {
            for (const track of stream.getTracks()) track.stop();
            return;
          }
          mediaStream = stream;
          videoEl.srcObject = mediaStream;
          await videoEl.play();
          if (generation !== sourceGeneration) return;
          cameraEmptyEl.hidden = true;
          startBtnEl.disabled = true;
          aiScanBtnEl.disabled = false;
          stopBtnEl.disabled = false;
          setDetectedPlate("--", t("detectedHintReady"));
          setStatus("ok", t("statusReady"));
          ocrMetaEl.textContent = t("ocrMetaIdle");
          renderCandidates([]);
        } catch (err) {
          if (generation !== sourceGeneration) return;
          cancelSourceWork();
          cameraEmptyEl.hidden = false;
          cameraEmptyEl.textContent = t("cameraPermissionHelp");
          setStatus("error", t("statusError"));
          ocrMetaEl.textContent = readableCameraError(err);
        } finally {
          cameraStarting = false;
          updateSourceUi();
        }
      }

      function stopCamera() {
        cancelSourceWork();
        cameraEmptyEl.hidden = Boolean(photoImage);
        cameraEmptyEl.textContent = t("cameraPermissionHelp");
        startBtnEl.disabled = false;
        aiScanBtnEl.disabled = true;
        stopBtnEl.disabled = true;
        setStatus(photoImage ? "ok" : "", t(photoImage ? "photoReady" : "statusIdle"));
        updateSourceUi();
      }

      function setLang(lang) {
        currentLang = lang === "en" ? "en" : "zh";
        params.set("lang", currentLang);
        history.replaceState({}, "", `${location.pathname}?${params.toString()}`);
        applyLanguage();
        if (photoImage) {
          setStatus("ok", t(latestRawText ? "statusDetected" : "photoReady"));
        } else if (!mediaStream && !lastResults) {
          setIdleUi();
        } else if (lastResults) {
          setStatus("ok", t("statusDetected"));
        }
        updateSourceUi();
      }

      function bindEvents() {
        startBtnEl.addEventListener("click", startCamera);
        aiScanBtnEl.addEventListener("click", runVisionScan);
        stopBtnEl.addEventListener("click", stopCamera);
        choosePhotoEl.addEventListener("click", () => photoInputEl.click());
        photoInputEl.addEventListener("change", () => loadPhoto(photoInputEl.files?.[0]));
        removePhotoEl.addEventListener("click", removePhoto);
        manualSearchBtnEl.addEventListener("click", () => {
          searchPlate(manualInputEl.value);
        });
        manualInputEl.addEventListener("input", () => {
          manualInputEl.removeAttribute("aria-invalid");
          manualErrorEl.textContent = "";
          updateNavLinks();
        });
        manualInputEl.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            searchPlate(manualInputEl.value);
          }
        });
        candidateListEl.addEventListener("click", (ev) => {
          const btn = ev.target.closest("[data-candidate]");
          if (!btn) return;
          const candidate = btn.getAttribute("data-candidate") || "";
          searchPlate(candidate);
        });
        langZhEl.addEventListener("click", () => setLang("zh"));
        langEnEl.addEventListener("click", () => setLang("en"));
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "visible") stopCamera();
        });
        window.addEventListener("pagehide", () => {
          cancelSourceWork();
          releasePhoto();
        });
      }

      applyLanguage();
      bindEvents();
      setIdleUi();
      updateSourceUi();
