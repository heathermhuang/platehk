      const I18N = {
        zh: {
          title: "相機車牌辨識搜尋",
          subtitle: "打開手機相機，直接把香港車牌變成即時搜尋結果。",
          kicker: "Camera Search Prototype",
          lede:
            "這一版先做成 mobile web 原型：相機取景、OCR 辨識、香港車牌正規化，再直接查 {site} 的拍賣結果 API。適合先測使用場景與命中率。",
          tips: [
            "把車牌放在中央框內，盡量保持水平、避免強反光與背景文字。",
            "系統會把 I→1、O→0，並自動忽略香港車牌不會使用的 Q。",
            "點一下 AI 辨識會把框內車牌圖像送到伺服器端 vision 模型判讀，再回傳搜尋結果。"
          ],
          m1k: "輸入方式",
          m1v: "手機相機",
          m2k: "辨識方式",
          m2v: "伺服器端 Vision OCR",
          m3k: "搜尋資料源",
          m3v: "本站 API",
          m4k: "最佳情境",
          m4v: "白天 / 正面 / 單牌",
          privacyNote: "點擊 AI 辨識時，本站只會上傳白框內裁切後的車牌圖像供伺服器端 vision 模型判讀，不會上傳整個相機畫面。",
          guideLeft: "把車牌放進框內",
          guideRight: "對準後會自動 AI 辨識",
          start: "開始相機",
          aiScan: "AI 辨識",
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
          detectedHintReady: "把車牌放進白框就會自動辨識，也可手動點 AI 辨識",
          detectedHintSingle: "可直接點候選或手動修正",
          detectedHintDetected: (q) => `目前穩定候選：${q}`,
          manualPlaceholder: "手動輸入車牌，例如 HK88 或 L1BERTY",
          manualSearch: "手動搜尋",
          ocrMetaIdle: "尚未送出 AI 辨識。",
          ocrMetaFmt: (text, confidence) => `OCR 原文：${text || "—"}；信心 ${confidence}%`,
          resultsTitle: "搜尋結果",
          resultsBadgeIdle: "等待查詢",
          resultsBadgeLoading: "載入中",
          resultsBadgeOk: (count) => `${count} 筆`,
          resultsBadgeNone: "沒有結果",
          resultsHintIdle: "開始相機辨識後，這裡會顯示最相關的 5 筆結果。",
          resultsHintNoMatch: (q) => `找不到「${q}」的結果。你可以換角度重試，或改用手動輸入。`,
          resultsHintFound: (q, total) => `「${q}」目前共找到 ${total} 筆結果；以下先顯示最相關的 5 筆。`,
          resultsOpenFull: "查看完整結果",
          resultsOpenPdf: "原始來源",
          resultDate: "拍賣日期",
          resultDataset: "分類",
          resultAmount: "成交價",
          resultUnknown: "未能自動解析",
          resultLegacyRange: "1973-2006 年分段",
          cameraPermissionHelp: "請允許相機權限；此功能需要 HTTPS 與手機相機。",
          cameraUnsupported: "此裝置或瀏覽器暫不支援即時相機辨識。",
          cameraPermissionDenied: "尚未獲得相機權限；請允許相機後再試。",
          visionNotConfigured: "站點尚未設定 AI vision key。",
          visionFailed: "AI 辨識失敗，請調整角度後再試。",
          visionRateLimited: "辨識請求過於頻繁，請稍等片刻再試。",
          visionCooldownActive: (seconds) => `辨識過於頻繁，系統會在 ${seconds} 秒後再接受新請求。`,
          visionOriginDenied: "此辨識請求來源不被接受，請從本站重新打開相機頁。",
          searchRateLimited: (seconds) => seconds ? `搜尋請求過於頻繁，請在 ${seconds} 秒後再試。` : "搜尋請求過於頻繁，請稍後再試。",
          backHome: "返回搜尋首頁",
          apiDoc: "API 文檔",
          changelog: "更新日誌",
        },
        en: {
          title: "Camera Plate Search",
          subtitle: "Open your phone camera and turn a Hong Kong plate into instant search results.",
          kicker: "Camera Search Prototype",
          lede:
            "This first version is a mobile web prototype: camera preview, OCR, Hong Kong plate normalization, then a direct lookup against the {site} auction API. It is designed to validate the workflow before building a native app.",
          tips: [
            "Keep the plate inside the center frame, level, with limited glare and minimal background text.",
            "The recognizer maps I→1, O→0, and drops Q because Hong Kong plates do not use it.",
            "Tap AI Scan to send only the cropped plate region to the server-side vision model, then search the result."
          ],
          m1k: "Input",
          m1v: "Phone camera",
          m2k: "Recognition",
          m2v: "Server-side vision OCR",
          m3k: "Search source",
          m3v: "Site API",
          m4k: "Best case",
          m4v: "Daylight / front view / single target",
          privacyNote: "When you tap AI Scan, only the cropped plate region inside the frame is uploaded for server-side vision OCR, not the full camera view.",
          guideLeft: "Place the plate inside the frame",
          guideRight: "Auto AI scan when aligned",
          start: "Start camera",
          aiScan: "AI Scan",
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
          detectedHintReady: "Place the plate inside the frame to auto-scan, or tap AI Scan manually",
          detectedHintSingle: "Tap a candidate or correct it manually",
          detectedHintDetected: (q) => `Current stable candidate: ${q}`,
          manualPlaceholder: "Type a plate manually, e.g. HK88 or L1BERTY",
          manualSearch: "Search manually",
          ocrMetaIdle: "No AI scan sent yet.",
          ocrMetaFmt: (text, confidence) => `OCR raw text: ${text || "—"}; confidence ${confidence}%`,
          resultsTitle: "Search results",
          resultsBadgeIdle: "Waiting",
          resultsBadgeLoading: "Loading",
          resultsBadgeOk: (count) => `${count} rows`,
          resultsBadgeNone: "No result",
          resultsHintIdle: "Once camera search starts, the top 5 matches will appear here.",
          resultsHintNoMatch: (q) => `No results were found for "${q}". Try another angle or correct the text manually.`,
          resultsHintFound: (q, total) => `"${q}" currently returns ${total} results; the 5 most relevant rows are shown first.`,
          resultsOpenFull: "Open full results",
          resultsOpenPdf: "Source file",
          resultDate: "Auction date",
          resultDataset: "Dataset",
          resultAmount: "Amount",
          resultUnknown: "Unparsed",
          resultLegacyRange: "1973-2006 range",
          cameraPermissionHelp: "Please allow camera access; this feature needs HTTPS and a phone camera.",
          cameraUnsupported: "Live camera scanning is not supported on this device or browser.",
          cameraPermissionDenied: "Camera access is blocked. Please allow camera permission and try again.",
          visionNotConfigured: "AI vision is not configured on the server.",
          visionFailed: "AI scan failed. Please adjust the angle and try again.",
          visionRateLimited: "Too many AI scan requests. Please wait a moment and try again.",
          visionCooldownActive: (seconds) => `Too many scans. New AI requests will be accepted again in ${seconds} seconds.`,
          visionOriginDenied: "This scan request origin was rejected. Please reopen the camera page from this site.",
          searchRateLimited: (seconds) => seconds ? `Too many search requests. Please try again in ${seconds} seconds.` : "Too many search requests. Please try again shortly.",
          backHome: "Back to search home",
          apiDoc: "API Docs",
          changelog: "Changelog",
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
      const backHomeEl = document.getElementById("backHome");
      const apiDocEl = document.getElementById("apiDoc");
      const changelogEl = document.getElementById("changelog");
      const langZhEl = document.getElementById("langZh");
      const langEnEl = document.getElementById("langEn");

      const params = new URLSearchParams(location.search);
      let currentLang = params.get("lang") === "en" ? "en" : "zh";
      let mediaStream = null;
      let scanRunning = false;
      let lastSearchedQuery = "";
      let latestCandidates = [];
      let latestConfidence = 0;
      let latestRawText = "";
      let searchAbort = null;
      let autoScanTimer = null;
      let lastFrameSignature = null;
      let stableFrameHits = 0;
      let lastVisionScanAt = 0;
      let visionCooldownUntil = 0;
      let visionSessionToken = "";
      let visionSessionExpiresAt = 0;

      function t(key) {
        return I18N[currentLang][key];
      }

      function normalizePlate(value) {
        return String(value || "")
          .toUpperCase()
          .replace(/\s+/g, "")
          .replace(/[^A-Z0-9]+/g, "")
          .replace(/I/g, "1")
          .replace(/O/g, "0")
          .replace(/Q/g, "")
          .trim();
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
        openSearchLinkEl.href = `./index.html?lang=${currentLang}`;
        backHomeEl.href = `./index.html?lang=${currentLang}`;
        apiDocEl.href = `./api.html?lang=${currentLang}`;
        changelogEl.href = `./changelog.html?lang=${currentLang}`;
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
        manualSearchBtnEl.textContent = t("manualSearch");
        backHomeEl.textContent = t("backHome");
        apiDocEl.textContent = t("apiDoc");
        changelogEl.textContent = t("changelog");
        updateNavLinks();
        renderCandidates(latestCandidates);
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

      function resetAutoScanState() {
        stableFrameHits = 0;
        lastFrameSignature = null;
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

      async function ensureVisionSessionToken() {
        const now = Math.floor(Date.now() / 1000);
        if (visionSessionToken && visionSessionExpiresAt - now > 20) return visionSessionToken;
        const resp = await fetch("./api/vision_session.php", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
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
            const searchHref = `./index.html?lang=${currentLang}&q=${encodeURIComponent(normalizePlate(row.single_line || row.double_line))}`;
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

      function currentFrameSignature() {
        const ctx = canvasEl.getContext("2d", { willReadFrequently: true });
        const img = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
        const data = img.data;
        const cols = 12;
        const rows = 4;
        const sig = [];
        const stepX = canvasEl.width / cols;
        const stepY = canvasEl.height / rows;
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            const x = Math.min(canvasEl.width - 1, Math.floor((col + 0.5) * stepX));
            const y = Math.min(canvasEl.height - 1, Math.floor((row + 0.5) * stepY));
            const idx = (y * canvasEl.width + x) * 4;
            sig.push(data[idx] / 255);
          }
        }
        return sig;
      }

      function signatureDistance(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 1;
        let sum = 0;
        for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
        return sum / a.length;
      }

      async function searchPlate(query) {
        const q = normalizePlate(query);
        if (!q) return;
        if (searchAbort) searchAbort.abort();
        searchAbort = new AbortController();
        lastSearchedQuery = q;
        manualInputEl.value = q;
        resultsBadgeEl.className = "status-badge";
        resultsBadgeEl.textContent = t("resultsBadgeLoading");
        resultsHintEl.textContent = "";
        try {
          setStatus("", t("statusSearching"));
          const mode = q.length >= 3 ? "&mode=exact_prefix" : "";
          const resp = await fetch(`./api/search.php?dataset=all&q=${encodeURIComponent(q)}&page=1&page_size=5&sort=amount_desc${mode}`, {
            cache: "no-store",
            signal: searchAbort.signal,
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
          renderResults(Array.isArray(payload.rows) ? payload.rows : [], Number(payload.total || 0), q);
          setStatus("ok", t("statusDetected"));
        } catch (err) {
          if (err?.name === "AbortError") return;
          renderResults([], 0, q);
          setStatus("error", t("statusError"));
        }
      }

      async function runVisionScan() {
        if (!mediaStream || scanRunning) return;
        const cooldownMs = remainingVisionCooldownMs();
        if (cooldownMs > 0) {
          const seconds = Math.max(1, Math.ceil(cooldownMs / 1000));
          setStatus("warn", t("statusError"));
          ocrMetaEl.textContent = t("visionCooldownActive")(seconds);
          return;
        }
        if (!drawFrameToCanvas()) return;
        scanRunning = true;
        lastVisionScanAt = Date.now();
        resetAutoScanState();
        aiScanBtnEl.disabled = true;
        try {
          setStatus("", t("statusVision"));
          ocrMetaEl.textContent = visionSendingText();
          renderCandidates([]);
          const visionToken = await ensureVisionSessionToken();
          const resp = await fetch("./api/vision_plate.php", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            cache: "no-store",
            credentials: "same-origin",
            body: JSON.stringify({
              lang: currentLang,
              vision_token: visionToken,
              image_data_url: frameImageDataUrl(),
            }),
          });
          const payload = await resp.json().catch(() => ({}));
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
          const modelPlate = normalizePlate(payload?.plate || "");
          latestRawText = normalizePlate(payload?.raw_text || modelPlate);
          latestConfidence = Math.round(Math.max(0, Math.min(100, Number(payload?.confidence || 0) * 100)));
          ocrMetaEl.textContent = t("ocrMetaFmt")(latestRawText, latestConfidence);
          const primaryPlate =
            latestRawText && latestRawText !== modelPlate && latestConfidence < 85
              ? latestRawText
              : (modelPlate || latestRawText);
          if (!primaryPlate) {
            setDetectedPlate("--", t("detectedHintIdle"));
            renderCandidates([]);
            setStatus("warn", t("statusError"));
            return;
          }
          renderCandidates(Array.from(new Set([primaryPlate, modelPlate, latestRawText].filter(Boolean))));
          setDetectedPlate(primaryPlate, t("detectedHintDetected")(primaryPlate));
          setStatus("ok", t("statusDetected"));
          await searchPlate(primaryPlate);
        } catch (err) {
          setStatus(err?.code === "rate_limited" ? "warn" : "error", t("statusError"));
          ocrMetaEl.textContent = String(err?.message || err || "");
        } finally {
          scanRunning = false;
          aiScanBtnEl.disabled = !mediaStream;
        }
      }

      function scheduleAutoVisionScan(delay = 700) {
        if (autoScanTimer) clearTimeout(autoScanTimer);
        if (!mediaStream) return;
        autoScanTimer = setTimeout(async () => {
          if (!mediaStream || scanRunning) {
            scheduleAutoVisionScan(700);
            return;
          }
          if (!drawFrameToCanvas()) {
            scheduleAutoVisionScan(700);
            return;
          }
          const sig = currentFrameSignature();
          const diff = signatureDistance(lastFrameSignature, sig);
          lastFrameSignature = sig;
          if (diff < 0.22) {
            stableFrameHits += 1;
          } else if (diff < 0.32) {
            stableFrameHits = Math.max(stableFrameHits, 1);
          } else {
            stableFrameHits = 0;
          }
          const now = Date.now();
          const cooldownMs = remainingVisionCooldownMs();
          if (cooldownMs > 0) {
            scheduleAutoVisionScan(Math.min(1000, Math.max(350, cooldownMs + 60)));
            return;
          }
          const sinceLastScan = now - lastVisionScanAt;
          const readyForAutoScan =
            (stableFrameHits >= 1 && diff < 0.22) ||
            (stableFrameHits >= 2 && diff < 0.32) ||
            sinceLastScan > 4200;
          if (readyForAutoScan && sinceLastScan > 1800) {
            await runVisionScan();
          }
          scheduleAutoVisionScan(800);
        }, delay);
      }

      async function startCamera() {
        try {
          cameraEmptyEl.textContent = t("statusLoading");
          mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
          videoEl.srcObject = mediaStream;
          await videoEl.play();
          cameraEmptyEl.hidden = true;
          startBtnEl.disabled = true;
          aiScanBtnEl.disabled = false;
          stopBtnEl.disabled = false;
          setDetectedPlate("--", t("detectedHintReady"));
          setStatus("ok", t("statusReady"));
          ocrMetaEl.textContent = t("ocrMetaIdle");
          renderCandidates([]);
          resetAutoScanState();
          scheduleAutoVisionScan(450);
        } catch (err) {
          cameraEmptyEl.hidden = false;
          cameraEmptyEl.textContent = t("cameraPermissionHelp");
          setStatus("error", t("statusError"));
          ocrMetaEl.textContent = readableCameraError(err);
        }
      }

      function stopCamera() {
        if (autoScanTimer) clearTimeout(autoScanTimer);
        autoScanTimer = null;
        if (searchAbort) searchAbort.abort();
        searchAbort = null;
        if (mediaStream) {
          for (const track of mediaStream.getTracks()) track.stop();
          mediaStream = null;
        }
        videoEl.srcObject = null;
        cameraEmptyEl.hidden = false;
        cameraEmptyEl.textContent = t("cameraPermissionHelp");
        startBtnEl.disabled = false;
        aiScanBtnEl.disabled = true;
        stopBtnEl.disabled = true;
        resetAutoScanState();
        setStatus("", t("statusIdle"));
      }

      function setLang(lang) {
        currentLang = lang === "en" ? "en" : "zh";
        params.set("lang", currentLang);
        history.replaceState({}, "", `${location.pathname}?${params.toString()}`);
        applyLanguage();
        if (!mediaStream) {
          setIdleUi();
        }
      }

      function bindEvents() {
        startBtnEl.addEventListener("click", startCamera);
        aiScanBtnEl.addEventListener("click", runVisionScan);
        stopBtnEl.addEventListener("click", stopCamera);
        manualSearchBtnEl.addEventListener("click", () => {
          searchPlate(manualInputEl.value);
        });
        manualInputEl.addEventListener("input", () => {
          const next = normalizePlate(manualInputEl.value);
          if (next !== manualInputEl.value) manualInputEl.value = next;
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
      }

      applyLanguage();
      bindEvents();
      setIdleUi();
      if (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1") {
        setTimeout(() => {
          startCamera();
        }, 120);
      }
