      // If you deploy hk.app as a directory listing site and host the VRM app elsewhere,
      // change this to a full URL (e.g. "https://vrm.hk.app/").
      const APP_VRM_BASE = "./index.html";

      const I18N = {
        zh: {
          h1: "hk.app 香港小應用",
          sub: "收錄香港相關的小工具與小應用",
          lead: "第一個案例：香港車牌拍賣結果搜尋（支援自訂車牌 PVRM、傳統車牌 TVRM）。",
          chips: ["搜尋", "PDF 核對", "排序", "分期/分頁", "中英文"],
          c1t: "香港車牌拍賣結果搜尋",
          c1p: "整合運輸署拍賣結果 PDF，支援搜尋、排序，並可連回原始 PDF 作核對。",
          c2t: "更多香港工具（即將推出）",
          c2p: "本頁未來會收錄更多香港相關的小應用與小工具。",
          c3t: "提交你的想法（即將推出）",
          c3p: "歡迎提供想法，我們會把好用的小工具做成 hk.app 的下一個應用。",
          foot1: "註：各應用的資料來源與聲明以其頁面所示為準。",
          openAll: "開啟第一個應用",
          open: "開啟",
          pvrm: "PVRM",
          tvp: "TVRM（實體）",
          tve: "TVRM（拍牌易）",
          popular: "熱門車牌",
          terms: "使用條款",
          privacy: "私隱政策",
          changelog: "更新日誌",
          feedback: "反饋表格",
        },
        en: {
          h1: "hk.app Hong Kong Mini Apps",
          sub: "A directory of small Hong Kong-focused tools",
          lead: "First featured app: Hong Kong VRM Auction Results Search (PVRM + TVRM).",
          chips: ["Search", "PDF links", "Sorting", "Issues & paging", "ZH/EN"],
          c1t: "Hong Kong VRM Auction Results Search",
          c1p: "Indexes Transport Department auction PDFs with search, sorting, and source-PDF verification links.",
          c2t: "More HK tools (coming soon)",
          c2p: "This page will list more Hong Kong-focused mini apps over time.",
          c3t: "Submit an idea (coming soon)",
          c3p: "Share ideas and we can turn useful ones into the next hk.app mini app.",
          foot1: "Note: Each app’s data source and disclaimer are shown within the app itself.",
          openAll: "Open the first app",
          open: "Open",
          pvrm: "PVRM",
          tvp: "TVRM (Physical)",
          tve: "TVRM (E-Auction)",
          popular: "Popular Plates",
          terms: "Terms of Use",
          privacy: "Privacy Policy",
          changelog: "Changelog",
          feedback: "Feedback Form",
        },
      };

      const langEl = document.getElementById("lang");
      const params = new URLSearchParams(location.search);
      let lang = params.get("lang") === "en" ? "en" : "zh";
      langEl.value = lang;

      const q = (k) => document.getElementById(k);
      const apply = () => {
        const t = I18N[lang];
        document.documentElement.lang = lang === "en" ? "en" : "zh-HK";
        document.title = `hk.app | ${t.h1}`;
        q("h1").textContent = t.h1;
        q("sub").textContent = t.sub;
        q("lead").textContent = t.lead;
        const chipsEl = q("chips");
        chipsEl.innerHTML = (t.chips || []).map((x) => `<span class="chip">${escapeHtml(x)}</span>`).join("");
        q("c1t").textContent = t.c1t;
        q("c1p").textContent = t.c1p;
        q("c2t").textContent = t.c2t;
        q("c2p").textContent = t.c2p;
        q("c3t").textContent = t.c3t;
        q("c3p").textContent = t.c3p;
        q("foot1").textContent = t.foot1;
        q("openAll").textContent = t.openAll;
        q("openPvrm").textContent = t.pvrm;
        q("openTvrmPhysical").textContent = t.tvp;
        q("openTvrmEAuction").textContent = t.tve;
        q("popular").textContent = t.popular;
        q("c1b").textContent = t.open;
        q("c2b").textContent = lang === "zh" ? "即將推出" : "Soon";
        q("c3b").textContent = lang === "zh" ? "即將推出" : "Soon";
        q("terms").textContent = t.terms;
        q("privacy").textContent = t.privacy;
        q("changelog").textContent = t.changelog;
        q("feedback").textContent = t.feedback;

        // Keep language in deep links.
        const withLang = (href) => {
          const u = new URL(href, location.href);
          u.searchParams.set("lang", lang);
          return u.pathname + "?" + u.searchParams.toString();
        };
        q("openAll").href = withLang(APP_VRM_BASE);
        q("openPvrm").href = withLang(`${APP_VRM_BASE}?d=pvrm`);
        q("openTvrmPhysical").href = withLang(`${APP_VRM_BASE}?d=tvrm_physical`);
        q("openTvrmEAuction").href = withLang(`${APP_VRM_BASE}?d=tvrm_eauction`);
        q("c1b").href = withLang(`${APP_VRM_BASE}?d=pvrm`);
        q("popular").href = withLang("./plates/index.html");
        q("terms").href = withLang("./terms.html");
        q("privacy").href = withLang("./privacy.html");
        q("changelog").href = withLang("./changelog.html");
        q("feedback").href = "https://forms.gle/1YFfSmraLp27YneU9";
      };

      function escapeHtml(s) {
        return String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      langEl.addEventListener("change", () => {
        lang = langEl.value === "en" ? "en" : "zh";
        apply();
        const u = new URL(location.href);
        u.searchParams.set("lang", lang);
        history.replaceState({}, "", u.pathname + "?" + u.searchParams.toString());
      });

      apply();
    
