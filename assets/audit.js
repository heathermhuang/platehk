      const I18N = {
        zh: {
          title: "資料審核",
          sub: "PDF 下載與清洗狀態總覽",
          back: "返回",
          datasetLabel: "資料集",
          statusLabel: "狀態",
          queryLabel: "期數 / 檔案",
          queryPlaceholder: "搜尋期數、PDF 名稱或本地檔案",
          problemsOnlyLabel: "只看問題",
          thDataset: "分類",
          thIssue: "期數",
          thPdf: "PDF",
          thOk: "狀態",
          thRows: "車牌數",
          thTotal: "總額",
          thErr: "錯誤",
          ok: "OK",
          missing: "缺少/損壞",
          statusAll: "全部狀態",
          statusOkOnly: "只看正常",
          statusProblemOnly: "只看問題",
          statusMissingTotal: "總額缺失",
          statusLny: "只看農曆新年",
          generatedAt: (d) => `最後更新：${d}`,
          dsAll: "全部",
          dsPvrm: "自訂車牌 PVRM",
          dsTvPhysical: "傳統車牌 TVRM (實體)",
          dsTvEA: "傳統車牌 TVRM (拍牌易)",
          dsTvLegacy: "傳統車牌 TVRM (1973-2006 年)",
          statPdfTotal: "PDF 總數",
          statPdfOk: "PDF 可用",
          statIssues: "期數",
          statRows: "車牌總數",
          statProblemFiles: "問題項目",
          qaNullAmount: "未解析金額",
          qaPlateViolations: "格式違規",
          qaIssueErrors: "期數錯誤",
          qaLegacyOverlap: "Legacy 重疊",
          summaryFmt: (shown, total, problems) => `目前顯示 ${shown} / ${total} 個項目，其中 ${problems} 個帶有 QA 問題。`,
          totalNaHandout: "不適用（當期僅拍賣清單）",
          totalMissing: "未能從資料計算",
        },
        en: {
          title: "Data Audit",
          sub: "Overview of PDF downloads and parsing status",
          back: "Back",
          datasetLabel: "Dataset",
          statusLabel: "Status",
          queryLabel: "Issue / File",
          queryPlaceholder: "Search issue, PDF title, or local file",
          problemsOnlyLabel: "Problems only",
          thDataset: "Category",
          thIssue: "Issue",
          thPdf: "PDF",
          thOk: "Status",
          thRows: "Plates",
          thTotal: "Total Proceeds",
          thErr: "Error",
          ok: "OK",
          missing: "Missing/Corrupt",
          statusAll: "All statuses",
          statusOkOnly: "Healthy only",
          statusProblemOnly: "Problems only",
          statusMissingTotal: "Missing totals",
          statusLny: "LNY only",
          generatedAt: (d) => `Last updated: ${d}`,
          dsAll: "All",
          dsPvrm: "Personalized PVRM",
          dsTvPhysical: "Traditional TVRM (Physical)",
          dsTvEA: "Traditional TVRM (E-Auction)",
          dsTvLegacy: "Traditional TVRM (1973-2006 Historical Ranges)",
          statPdfTotal: "Total PDFs",
          statPdfOk: "Valid PDFs",
          statIssues: "Issues",
          statRows: "Total plates",
          statProblemFiles: "Problem rows",
          qaNullAmount: "Unparsed amounts",
          qaPlateViolations: "Format violations",
          qaIssueErrors: "Issue errors",
          qaLegacyOverlap: "Legacy overlaps",
          summaryFmt: (shown, total, problems) => `Showing ${shown} / ${total} items. ${problems} currently have QA problems.`,
          totalNaHandout: "N/A (handout-only issue)",
          totalMissing: "Unavailable",
        },
      };

      let lang = "zh";
      let REPORT = null;
      function t(k) {
        return I18N[lang][k];
      }
      function dsLabel(key) {
        if (key === "pvrm") return t("dsPvrm");
        if (key === "tvrm_physical") return t("dsTvPhysical");
        if (key === "tvrm_eauction") return t("dsTvEA");
        if (key === "tvrm_legacy") return t("dsTvLegacy");
        return key;
      }
      function money(v, row) {
        if (v == null) {
          if (Number(row?.issue_rows || 0) === 0) return t("totalNaHandout");
          return t("totalMissing");
        }
        return "HK$" + Number(v).toLocaleString("en-US");
      }
      function esc(s) {
        return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      }

      function applyLang() {
        document.documentElement.lang = lang === "zh" ? "zh-HK" : "en";
        document.title = t("title");
        document.getElementById("title").textContent = t("title");
        document.getElementById("sub").textContent = t("sub");
        document.getElementById("backLink").textContent = t("back");
        document.getElementById("datasetLabel").textContent = t("datasetLabel");
        document.getElementById("thDataset").textContent = t("thDataset");
        document.getElementById("thIssue").textContent = t("thIssue");
        document.getElementById("thPdf").textContent = t("thPdf");
        document.getElementById("thOk").textContent = t("thOk");
        document.getElementById("thRows").textContent = t("thRows");
        document.getElementById("thTotal").textContent = t("thTotal");
        document.getElementById("thErr").textContent = t("thErr");
        // Make it obvious to English-only users too.
        document.getElementById("langBtn").textContent = lang === "zh" ? "中文 / English" : "English / 中文";
      }

      function setLang(next) {
        lang = next === "en" ? "en" : "zh";
        const u = new URL(location.href);
        u.searchParams.set("lang", lang);
        history.replaceState(null, "", u.toString());
        applyLang();
      }

      function buildDatasetOptions() {
        const sel = document.getElementById("datasetSel");
        const keep = sel.value || "";
        sel.innerHTML = "";
        const optAll = document.createElement("option");
        optAll.value = "";
        optAll.textContent = t("dsAll");
        sel.appendChild(optAll);
        for (const k of ["pvrm", "tvrm_physical", "tvrm_eauction", "tvrm_legacy"]) {
          const o = document.createElement("option");
          o.value = k;
          o.textContent = dsLabel(k);
          sel.appendChild(o);
        }
        sel.value = keep;
      }

      function buildStatusOptions() {
        const sel = document.getElementById("statusSel");
        const keep = sel.value || "";
        const opts = [
          ["", t("statusAll")],
          ["ok", t("statusOkOnly")],
          ["problem", t("statusProblemOnly")],
          ["missing_total", t("statusMissingTotal")],
          ["lny", t("statusLny")],
        ];
        sel.innerHTML = opts.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("");
        sel.value = keep;
      }

      function rowHasProblem(row) {
        return !row.pdf_ok || !!row.error || (row.total_proceeds_hkd == null && Number(row.issue_rows || 0) > 0) || Number(row.amount_missing || 0) > 0;
      }

      function filterRows(report) {
        const dataset = document.getElementById("datasetSel").value || "";
        const status = document.getElementById("statusSel").value || "";
        const q = String(document.getElementById("issueQuery").value || "").trim().toLowerCase();
        const problemsOnly = document.getElementById("problemsOnly").checked;
        return (report.files || []).filter((row) => {
          if (dataset && row.dataset !== dataset) return false;
          if (problemsOnly && !rowHasProblem(row)) return false;
          if (status === "ok" && rowHasProblem(row)) return false;
          if (status === "problem" && !rowHasProblem(row)) return false;
          if (status === "missing_total" && !(row.total_proceeds_hkd == null && Number(row.issue_rows || 0) > 0)) return false;
          if (status === "lny" && !row.is_lny) return false;
          if (q) {
            const hay = [row.issue_label, row.issue_date, row.pdf_title, row.local_name, row.local_path].join(" ").toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
      }

      function renderValidation(report, selectedDataset, rows, scopeTotal) {
        const keys = selectedDataset ? [selectedDataset] : Object.keys(report.validation || {});
        let nullAmounts = 0;
        let plateViolations = 0;
        let issueErrors = 0;
        let legacyOverlap = 0;
        for (const key of keys) {
          const item = (report.validation || {})[key] || {};
          nullAmounts += Number(item.null_amount_rows || 0);
          plateViolations += Number(item.plate_format_violations || 0) + Number(item.pvrm_len_violations || 0) + Number(item.double_line_mismatch || 0);
          issueErrors += Number(item.issues_with_errors || 0);
          legacyOverlap += Number(item.overlap_rows_hidden_in_all || 0);
        }
        document.getElementById("validationStats").innerHTML = [
          { k: t("qaNullAmount"), v: nullAmounts },
          { k: t("qaPlateViolations"), v: plateViolations },
          { k: t("qaIssueErrors"), v: issueErrors },
          { k: t("qaLegacyOverlap"), v: legacyOverlap },
        ]
          .map((x) => `<div class="stat"><div class="k">${esc(x.k)}</div><div class="v">${esc(String(x.v))}</div></div>`)
          .join("");
        const problems = rows.filter(rowHasProblem).length;
        document.getElementById("auditSummary").textContent = t("summaryFmt")(rows.length, scopeTotal, problems);
      }

      function render(report) {
        const selected = document.getElementById("datasetSel").value || "";
        const scopeRows = (report.files || []).filter((row) => !selected || row.dataset === selected);
        const rows = filterRows(report);

        const sumKeys = selected ? [selected] : Object.keys(report.summary || {});
        let pdfTotal = 0, pdfOk = 0, issues = 0, plates = 0;
        for (const k of sumKeys) {
          const s = (report.summary || {})[k];
          if (!s) continue;
          pdfTotal += Number(s.pdf_total || 0);
          pdfOk += Number(s.pdf_ok || 0);
          issues += Number(s.issues_total || 0);
          plates += Number(s.rows_total || 0);
        }
        const problems = rows.filter(rowHasProblem).length;

        const stats = document.getElementById("stats");
        stats.innerHTML = [
          { k: t("statPdfTotal"), v: pdfTotal },
          { k: t("statPdfOk"), v: pdfOk },
          { k: t("statIssues"), v: issues },
          { k: t("statRows"), v: plates },
          { k: t("statProblemFiles"), v: problems },
        ]
          .map((x) => `<div class="stat"><div class="k">${esc(x.k)}</div><div class="v">${esc(String(x.v))}</div></div>`)
          .join("");

        document.getElementById("generatedAt").textContent = t("generatedAt")(report.generated_at || "");
        renderValidation(report, selected, rows, scopeRows.length);

        const tbody = document.getElementById("tbody");
        tbody.innerHTML = rows
          .sort((a, b) => {
            const ap = rowHasProblem(a) ? 0 : 1;
            const bp = rowHasProblem(b) ? 0 : 1;
            if (ap !== bp) return ap - bp;
            return a.issue_date < b.issue_date ? 1 : a.issue_date > b.issue_date ? -1 : 0;
          })
          .map((r) => {
            const ok = r.pdf_ok ? `<span class="ok">${esc(t("ok"))}</span>` : `<span class="bad">${esc(t("missing"))}</span>`;
            const issue = esc(r.issue_label || r.issue_date || "");
            const pdf = r.pdf_url
              ? `<a href="${esc(r.pdf_url)}" target="_blank" rel="noopener">${esc(r.local_name || "PDF")}</a>
                 <div class="muted pdf-meta">${esc(r.pdf_title || "")}</div>
                 <div class="muted pdf-meta"><code>${esc(r.local_path || "")}</code></div>`
              : `<div class="muted"><code>${esc(r.local_path || "")}</code></div>`;
            const total = money(r.total_proceeds_hkd, r);
            const err = [r.error, Number(r.amount_missing || 0) > 0 ? `amount_missing=${r.amount_missing}` : "", rowHasProblem(r) && r.total_proceeds_hkd == null && Number(r.issue_rows || 0) > 0 ? "total_missing" : ""]
              .filter(Boolean)
              .map(esc)
              .join(" | ");
            const lny = r.is_lny ? "🧧" : "";
            return `<tr class="${rowHasProblem(r) ? "row-problem" : ""}">
              <td>${esc(dsLabel(r.dataset))}</td>
              <td>${lny} ${issue}</td>
              <td class="pdf-cell">${pdf}</td>
              <td>${ok}<div class="muted nowrap">${esc(String(r.size || 0))} bytes</div></td>
              <td class="nowrap">${esc(String(r.issue_rows || 0))}</td>
              <td>${esc(total)}</td>
              <td class="muted">${err}</td>
            </tr>`;
          })
          .join("");
      }

      async function main() {
        const params = new URLSearchParams(location.search);
        setLang(params.get("lang") === "en" ? "en" : "zh");
        buildDatasetOptions();
        buildStatusOptions();
        document.getElementById("issueQuery").placeholder = t("queryPlaceholder");
        document.getElementById("statusLabel").textContent = t("statusLabel");
        document.getElementById("queryLabel").textContent = t("queryLabel");
        document.getElementById("problemsOnlyLabel").textContent = t("problemsOnlyLabel");

        const sel = document.getElementById("datasetSel");
        const statusSel = document.getElementById("statusSel");
        const issueQuery = document.getElementById("issueQuery");
        const problemsOnly = document.getElementById("problemsOnly");
        const rerender = () => {
          if (REPORT) render(REPORT);
        };
        sel.addEventListener("change", rerender);
        statusSel.addEventListener("change", rerender);
        issueQuery.addEventListener("input", rerender);
        problemsOnly.addEventListener("change", rerender);

        document.getElementById("langBtn").addEventListener("click", () => {
          setLang(lang === "zh" ? "en" : "zh");
          buildDatasetOptions();
          buildStatusOptions();
          document.getElementById("issueQuery").placeholder = t("queryPlaceholder");
          document.getElementById("statusLabel").textContent = t("statusLabel");
          document.getElementById("queryLabel").textContent = t("queryLabel");
          document.getElementById("problemsOnlyLabel").textContent = t("problemsOnlyLabel");
          if (REPORT) render(REPORT);
        });

        const resp = await fetch("./data/audit.json", { cache: "no-store" });
        REPORT = await resp.json();
        render(REPORT);
      }
      main().catch((e) => {
        document.getElementById("sub").textContent = String(e);
      });
    
