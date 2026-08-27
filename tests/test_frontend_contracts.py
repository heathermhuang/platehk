from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendContractsTests(unittest.TestCase):
    def test_index_contains_issue_mode_and_search_assist_hooks(self) -> None:
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        index_js = (ROOT / "assets" / "index.js").read_text(encoding="utf-8")
        index_state_js = (ROOT / "assets" / "index.state.js").read_text(encoding="utf-8")
        index_issue_js = (ROOT / "assets" / "index.issue.js").read_text(encoding="utf-8")
        index_present_js = (ROOT / "assets" / "index.present.js").read_text(encoding="utf-8")
        index_home_js = (ROOT / "assets" / "index.home.js").read_text(encoding="utf-8")
        self.assertIn('id="issuePanel"', html)
        self.assertIn('id="searchNote"', html)
        self.assertIn('id="datasetGuide"', html)
        self.assertIn('id="issueGuide"', html)
        self.assertIn('id="searchPanelTitle"', html)
        self.assertIn('id="homeShelf"', html)
        self.assertIn('id="resultsContext"', html)
        self.assertIn('id="marketSignal"', html)
        self.assertIn('id="brokerModal"', html)
        self.assertIn('id="brokerForm"', html)
        self.assertIn('id="queryLabel"', html)
        self.assertIn('id="datasetLabel"', html)
        self.assertIn('id="issueLabel"', html)
        self.assertIn('id="sortLabel"', html)
        self.assertIn("function renderDatasetSwitcher(", index_home_js)
        self.assertIn("function renderAuctionAgendaCard(", index_home_js)
        self.assertIn("function initAgendaSlider(", index_home_js)
        self.assertIn("data-agenda-previous", index_home_js)
        self.assertIn("data-agenda-next", index_home_js)
        self.assertIn("grid-auto-columns: calc((100% - 30px) / 4)", html)
        self.assertIn("getEventFeed", index_home_js)
        self.assertIn("./data/events.json", index_js)
        self.assertIn("function renderHomeCards(", index_home_js)
        self.assertIn("function syncFocusModeChrome(", index_home_js)
        self.assertIn("function renderResultsContext(", index_home_js)
        self.assertIn("function syncResultsTableMode(", index_home_js)
        self.assertIn("function emptyResultsMessage(", index_home_js)
        self.assertIn("function renderSearchAssist(", index_present_js)
        market_js = (ROOT / "assets" / "index.market.js").read_text(encoding="utf-8")
        plate_market_js = (ROOT / "assets" / "plate.market.js").read_text(encoding="utf-8")
        self.assertIn("function createPlateMarketFlow(", market_js)
        self.assertIn("./api/market_signal", market_js)
        self.assertIn("https://wa.me/", market_js)
        self.assertIn('const WHATSAPP_NUMBER = "85268591577"', market_js)
        self.assertIn("window.open(url", market_js)
        self.assertNotIn("./api/broker_inquiry", market_js)
        self.assertNotIn('id="brokerContact"', html)
        self.assertNotIn('id="brokerConsent"', html)
        self.assertIn('class="plate"', market_js)
        self.assertIn("whatsapp-icon", market_js)
        self.assertIn("nofollow noopener noreferrer", market_js)
        self.assertIn("marketFlow.update({ query: qEl.value, rows: list })", index_js)
        self.assertIn("availability_detected", plate_market_js)
        self.assertIn('url.hostname === "m.28car.com"', plate_market_js)
        self.assertIn("card.hidden = false", plate_market_js)
        self.assertIn('node("span", "plate", plate)', plate_market_js)
        self.assertIn("function formatAuctionDate(", index_present_js)
        self.assertIn("function updateIssueTotal(", index_present_js)
        self.assertIn("function parseInitialState(", index_state_js)
        self.assertIn("function bindControlEvents(", index_state_js)
        self.assertIn("function renderIssuePanel(", index_issue_js)
        self.assertIn("function clearIssueSelection(", index_issue_js)
        self.assertIn("function issueSummaryText(", index_issue_js)
        self.assertIn("data-dataset-switch", index_js)
        self.assertIn("data-open-issue", index_js)
        self.assertIn("function openIssueByKey(", index_issue_js)
        self.assertIn("issue-jump-link", html)
        self.assertIn("issue-summary", index_issue_js)

    def test_audit_contains_filterable_qa_panel_hooks(self) -> None:
        html = (ROOT / "audit.html").read_text(encoding="utf-8")
        audit_js = (ROOT / "assets" / "audit.js").read_text(encoding="utf-8")
        self.assertIn('id="statusSel"', html)
        self.assertIn('id="issueQuery"', html)
        self.assertIn('id="problemsOnly"', html)
        self.assertIn('id="validationStats"', html)
        self.assertIn("function filterRows(", audit_js)
        self.assertIn("function renderValidation(", audit_js)

    def test_issue_state_url_support_stays_in_frontend(self) -> None:
        index_state_js = (ROOT / "assets" / "index.state.js").read_text(encoding="utf-8")
        self.assertRegex(index_state_js, re.compile(r'params\.get\("issue"\)'))
        self.assertRegex(index_state_js, re.compile(r'params\.set\("issue", nextIssue\)'))

    def test_plate_normalization_ignores_q_in_main_and_worker(self) -> None:
        index_js = (ROOT / "assets" / "index.js").read_text(encoding="utf-8")
        worker = (ROOT / "assets" / "search.worker.js").read_text(encoding="utf-8")
        camera_js = (ROOT / "assets" / "camera.js").read_text(encoding="utf-8")
        self.assertIn('.replace(/Q/g, "")', index_js)
        self.assertIn(".replace(/Q/g, '')", worker)
        self.assertIn('.replace(/I/g, "1")', camera_js)
        self.assertIn('.replace(/O/g, "0")', camera_js)
        self.assertIn('.replace(/Q/g, "")', camera_js)

    def test_logo_wordmark_uses_plate_hk(self) -> None:
        logo = (ROOT / "assets" / "logo.svg").read_text(encoding="utf-8")
        favicon = (ROOT / "assets" / "favicon.svg").read_text(encoding="utf-8")
        ledger = (ROOT / "assets" / "ledger.css").read_text(encoding="utf-8")
        plate_fill = re.search(r"--plate-fill:\s*(#[0-9a-fA-F]{6})", ledger)
        plate_ink = re.search(r"--plate-ink:\s*(#[0-9a-fA-F]{6})", ledger)
        self.assertIsNotNone(plate_fill)
        self.assertIsNotNone(plate_ink)
        self.assertIn(">PLATE</text>", logo)
        self.assertIn(">HK</text>", logo)
        self.assertNotIn(">HONG</text>", logo)
        self.assertIn(">PLATE</text>", favicon)
        self.assertIn(">HK</text>", favicon)
        self.assertNotIn(">P</text>", favicon)
        for asset in (logo, favicon):
            self.assertIn(f'fill="{plate_fill.group(1)}"', asset)
            self.assertIn(f'fill="{plate_ink.group(1)}"', asset)

    def test_plate_logo_assets_are_wired_across_surfaces(self) -> None:
        logo_ref = "logo.svg?v=20260827-05"
        favicon_ref = "favicon.svg?v=20260827-05"
        for path in ("index.html", "camera.html", "assets/index.js", "assets/index.share.js"):
            self.assertIn(logo_ref, (ROOT / path).read_text(encoding="utf-8"), path)
        for path in (
            "index.html",
            "camera.html",
            "landing.html",
            "about.html",
            "api.html",
            "audit.html",
            "changelog.html",
            "mcp.html",
            "privacy.html",
            "terms.html",
            "plates/index.html",
            "scripts/build_popular_plate_pages.py",
        ):
            self.assertIn(favicon_ref, (ROOT / path).read_text(encoding="utf-8"), path)
        self.assertIn("pvrm-static-v153", (ROOT / "sw.js").read_text(encoding="utf-8"))

    def test_camera_prototype_page_and_links_exist(self) -> None:
        camera = (ROOT / "camera.html").read_text(encoding="utf-8")
        camera_js = (ROOT / "assets" / "camera.js").read_text(encoding="utf-8")
        index = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="video"', camera)
        self.assertIn('id="startBtn"', camera)
        self.assertIn('id="aiScanBtn"', camera)
        self.assertIn('id="candidateList"', camera)
        self.assertIn('id="brandHomeLink"', camera)
        self.assertIn('./assets/camera.js', camera)
        self.assertIn("./api/vision_plate", camera_js)
        self.assertIn("brandHomeLinkEl.href", camera_js)
        self.assertIn('id="cameraTopLink"', index)

    def test_app_pages_use_external_scripts(self) -> None:
        expectations = {
            "index.html": [
                "./assets/index.config.js",
                "./assets/index.home.js",
                "./assets/index.data.js",
                "./assets/index.webmcp.js",
                "./assets/index.state.js",
                "./assets/index.issue.js",
                "./assets/index.present.js",
                "./assets/index.share.js",
                "./assets/index.market.js",
                "./assets/index.js",
            ],
            "landing.html": ["./assets/landing.js"],
            "audit.html": ["./assets/audit.js"],
            "api.html": ["./assets/api-page.js", "./assets/info-shell.js"],
            "changelog.html": ["./assets/changelog.js", "./assets/info-shell.js"],
            "camera.html": ["./assets/camera.js"],
        }
        for html_name, script_paths in expectations.items():
            html = (ROOT / html_name).read_text(encoding="utf-8")
            for script_path in script_paths:
                self.assertIn(script_path, html, f"{html_name}: {script_path}")

    def test_information_pages_share_one_current_shell(self) -> None:
        page_keys = {
            "about.html": "about",
            "terms.html": "terms",
            "privacy.html": "privacy",
            "changelog.html": "changelog",
            "audit.html": "audit",
            "api.html": "api",
            "mcp.html": "api",
        }
        for html_name, page_key in page_keys.items():
            html = (ROOT / html_name).read_text(encoding="utf-8")
            self.assertIn('class="info-page', html, html_name)
            self.assertIn(f'data-info-page="{page_key}"', html, html_name)
            self.assertIn('data-info-shell-header', html, html_name)
            self.assertIn('data-info-shell-footer', html, html_name)
            self.assertIn('id="main-content"', html, html_name)
            self.assertIn('assets/info-shell.js?v=20260825-01', html, html_name)
            self.assertIn('assets/ledger.css?v=20260825-02', html, html_name)
            self.assertIn('name="theme-color" content="#f4f1e8"', html, html_name)

        shell = (ROOT / "assets" / "info-shell.js").read_text(encoding="utf-8")
        self.assertIn('aria-current="page"', shell)
        self.assertIn("Information page navigation", shell)
        self.assertIn('id="infoLangZh"', shell)
        self.assertIn('id="infoLangEn"', shell)
        self.assertIn('location.assign(', shell)
        self.assertIn("/privacy.html", shell)
        self.assertIn("/mcp.html", shell)
        self.assertIn("https://github.com/heathermhuang/platehk", shell)

        changelog = (ROOT / "assets" / "changelog.js").read_text(encoding="utf-8")
        self.assertIn('date: "2026-08-27"', changelog)
        self.assertIn('date: "2026-08-25"', changelog)
        self.assertIn('./data/audit.json', changelog)
        self.assertIn('class="changelog-archive"', changelog)

        api = (ROOT / "assets" / "api-page.js").read_text(encoding="utf-8")
        self.assertIn("page_size", api)
        self.assertIn("Retry-After", api)
        self.assertIn("The result array is named <code>rows</code>, not <code>results</code>", api)
        self.assertIn("/api/v1/{dataset}/results.chunks.json", api)
        self.assertIn("not a DATA.GOV.HK vehicle-registration-mark auction API", api)
        self.assertIn('./data/audit.json', api)

        mcp = (ROOT / "mcp.html").read_text(encoding="utf-8")
        self.assertNotIn("MCP 文件 | PVRM", mcp)
        self.assertIn("MCP-Protocol-Version: 2025-06-18", mcp)
        self.assertIn("vision:ocr", mcp)
        self.assertIn("drop <code>Q</code>", mcp)

    def test_public_pages_do_not_merge_chinese_and_english_in_visible_copy(self) -> None:
        public_pages = [
            ROOT / name
            for name in [
                "index.html",
                "about.html",
                "terms.html",
                "privacy.html",
                "changelog.html",
                "audit.html",
                "api.html",
                "mcp.html",
            ]
        ]
        public_pages.extend(
            path for path in (ROOT / "plates").glob("*.html") if " " not in path.name
        )
        merged_legacy_copy = [
            "資料說明 Guide",
            "返回搜尋 / Back to Search",
            "收錄範圍 / Coverage",
            "直接答案 / Direct Answers",
            "資料流程 / Method",
            "限制 / Limits",
            "頁面狀態 / Page Status",
            "官方 PDF / Official source",
            'data-label="日期 / Date"',
            'data-label="分類 / Dataset"',
            'data-label="成交價 / Price"',
            'data-label="來源 / Source"',
            'data-label="資料集 / Dataset"',
        ]
        for page_path in public_pages:
            page_html = page_path.read_text(encoding="utf-8")
            with self.subTest(public_page=page_path.relative_to(ROOT)):
                for legacy_copy in merged_legacy_copy:
                    self.assertNotIn(legacy_copy, page_html)

        for page_path in [ROOT / "about.html", ROOT / "plates" / "index.html", ROOT / "plates" / "88.html"]:
            page_html = page_path.read_text(encoding="utf-8")
            self.assertIn("assets/info-locale.js?v=20260825-01", page_html, page_path.name)
            self.assertIn("data-copy-zh=", page_html, page_path.name)
            self.assertIn("data-copy-en=", page_html, page_path.name)

    def test_popular_index_is_filterable_without_hiding_crawlable_links(self) -> None:
        index = (ROOT / "plates" / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "assets" / "popular-index.js").read_text(encoding="utf-8")
        builder = (ROOT / "scripts" / "build_popular_plate_pages.py").read_text(encoding="utf-8")
        self.assertIn('id="popularQuery"', index)
        self.assertIn('id="popularShowAll"', index)
        self.assertGreaterEqual(index.count("data-popular-card"), 400)
        self.assertIn("initialLimit", script)
        self.assertIn("card.hidden", script)
        self.assertIn('data-popular-card', builder)
        self.assertIn('assets/popular-index.js', builder)

    def test_service_worker_precaches_every_required_homepage_script(self) -> None:
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        service_worker = (ROOT / "sw.js").read_text(encoding="utf-8")
        self.assertIn("'./about.html'", service_worker)
        required_scripts = re.findall(r'<script src="(\./assets/[^"]+\.js)(?:\?[^"\s]+)?"></script>', html)
        self.assertIn("./assets/index.market.js", required_scripts)
        for script_path in required_scripts:
            self.assertIn(f"'{script_path}'", service_worker, script_path)
        for shell_asset in [
            "./assets/audit.js?v=20260825-01",
            "./assets/api-page.js?v=20260827-02",
            "./assets/changelog.js?v=20260827-02",
            "./assets/info-locale.js?v=20260825-01",
            "./assets/info-shell.js?v=20260825-01",
            "./assets/popular-index.js?v=20260825-01",
            "./assets/plate.market.js?v=20260825-01",
            "./assets/ledger.css?v=20260825-02",
        ]:
            self.assertIn(f"'{shell_asset}'", service_worker, shell_asset)

        for html_name in ["audit.html", "api.html", "changelog.html"]:
            page = (ROOT / html_name).read_text(encoding="utf-8")
            exact_assets = re.findall(r'(?:src|href)="(\./assets/[^"]+\?v=[^"]+)"', page)
            self.assertGreater(len(exact_assets), 0, html_name)
            for asset in exact_assets:
                self.assertIn(f"'{asset}'", service_worker, f"{html_name}: {asset}")

    def test_public_footers_link_to_github_repository(self) -> None:
        repo_url = "https://github.com/heathermhuang/platehk"
        for html_name in ["index.html", "landing.html", "camera.html"]:
            html = (ROOT / html_name).read_text(encoding="utf-8")
            self.assertIn(repo_url, html, html_name)
            self.assertIn('target="_blank"', html, html_name)
            self.assertIn('rel="noopener"', html, html_name)

        index_config = (ROOT / "assets" / "index.config.js").read_text(encoding="utf-8")
        index_js = (ROOT / "assets" / "index.js").read_text(encoding="utf-8")
        landing_js = (ROOT / "assets" / "landing.js").read_text(encoding="utf-8")
        camera_js = (ROOT / "assets" / "camera.js").read_text(encoding="utf-8")
        self.assertIn("githubUrl", index_config)
        self.assertIn("githubLinkEl.href", index_js)
        self.assertIn('q("github").href', landing_js)
        self.assertIn("githubEl.href", camera_js)

    def test_index_config_does_not_redeclare_global_i18n_symbols(self) -> None:
        index_config = (ROOT / "assets" / "index.config.js").read_text(encoding="utf-8")
        index_js = (ROOT / "assets" / "index.js").read_text(encoding="utf-8")
        self.assertIn("const INDEX_I18N =", index_config)
        self.assertIn("const INDEX_DATASETS =", index_config)
        self.assertNotIn("const I18N =", index_config)
        self.assertNotIn("const DATASETS =", index_config)
        self.assertIn("window.PLATE_INDEX_CONFIG = { I18N: INDEX_I18N, DATASETS: INDEX_DATASETS };", index_config)
        self.assertIn("window.PLATE_INDEX_CONFIG", index_js)

    def test_vision_api_endpoint_exists(self) -> None:
        worker_api = (ROOT / "cloudflare-worker" / "src" / "api.mjs").read_text(encoding="utf-8")
        worker_lib = (ROOT / "cloudflare-worker" / "src" / "lib.mjs").read_text(encoding="utf-8")
        self.assertIn("async function handleVisionPlate(", worker_api)
        self.assertIn("/responses", worker_api)
        self.assertIn("input_image", worker_api)
        self.assertIn("requireJsonContentType(request)", worker_api)
        self.assertIn("sameOriginError(request)", worker_api)
        self.assertIn("requireVisionSessionToken(request, env", worker_api)
        self.assertIn("async function handleVisionSession(", worker_api)
        self.assertIn("issueVisionSessionToken(request, env)", worker_api)
        self.assertIn("export async function issueVisionSessionToken(", worker_lib)
        self.assertIn("Hong Kong registration marks do not use the letters I, O, or Q", worker_api)
        self.assertIn("香港車牌不使用英文字母 I、O、Q", worker_api)

    def test_market_signal_minimises_third_party_data_and_intake_stays_client_side(self) -> None:
        worker_api = (ROOT / "cloudflare-worker" / "src" / "api.mjs").read_text(encoding="utf-8")
        worker_index = (ROOT / "cloudflare-worker" / "src" / "index.mjs").read_text(encoding="utf-8")
        builder = (ROOT / "scripts" / "build_cloudflare_public.py").read_text(encoding="utf-8")
        popular_builder = (ROOT / "scripts" / "build_popular_plate_pages.py").read_text(encoding="utf-8")
        scraper = (ROOT / "scripts" / "scrape_28car_market.py").read_text(encoding="utf-8")

        self.assertIn('route === "market_signal"', worker_api)
        self.assertIn('url.searchParams.get("plates")', worker_api)
        self.assertIn('plates must contain 1 to 200 exact plates', worker_api)
        self.assertNotIn('route === "broker_inquiry"', worker_api)
        self.assertNotIn("BROKER_LEADS", worker_api)
        self.assertNotIn("BROKER_NOTIFY_TOKEN", worker_api)
        self.assertIn("decodeURIComponent(url.pathname)", worker_index)
        self.assertIn('decodedPathname.startsWith("/_market/")', worker_index)
        self.assertIn("copy_private_market_signals", builder)
        self.assertIn(".market-card .plate {", popular_builder)
        self.assertNotIn(".market-plate::before", popular_builder)
        self.assertIn("validate_payload(payload)", scraper)
        self.assertNotIn('"seller_name"', scraper)
        self.assertNotIn('"seller_phone"', scraper)

        index_html = (ROOT / "index.html").read_text(encoding="utf-8")
        ledger_css = (ROOT / "assets" / "ledger.css").read_text(encoding="utf-8")
        self.assertIn('class="plate broker-plate-value"', index_html)
        self.assertNotIn(".market-plate {", index_html)
        self.assertNotIn(".market-plate", ledger_css)
        self.assertIn(".info-page .actions a:not(.primary)", ledger_css)
        self.assertIn(".lang-toggle:not(.info-lang-toggle) button", ledger_css)
        self.assertIn(".info-lang-toggle button", ledger_css)
        self.assertIn("./assets/ledger.css?v=20260812-11", index_html)

        generated_market_pages = []
        for page_path in (ROOT / "plates").glob("*.html"):
            if " " in page_path.name:
                continue
            page_html = page_path.read_text(encoding="utf-8")
            if "data-market-card" in page_html:
                generated_market_pages.append(page_path)
                self.assertIn(".market-card .plate {", page_html, page_path.name)
                self.assertNotIn(".market-plate::before", page_html, page_path.name)
                self.assertNotIn("background:#fff; color:#111", page_html, page_path.name)
        self.assertGreater(len(generated_market_pages), 0)

    def test_camera_vision_ignores_non_hong_kong_plate_formats(self) -> None:
        camera_js = (ROOT / "assets" / "camera.js").read_text(encoding="utf-8")
        worker_api = (ROOT / "cloudflare-worker" / "src" / "api.mjs").read_text(encoding="utf-8")

        for source in [worker_api]:
            self.assertIn("M-12-34", source)
            self.assertIn("MA-12-34", source)
            self.assertIn("粤Z1234港", source)
            self.assertIn("plate_type", source)
            self.assertIn("is_hong_kong_plate", source)
            self.assertIn("ignored_plate_type", source)

        self.assertIn("ignoredPlateTypeFromPayload", camera_js)
        self.assertIn("nonHongKongPlateIgnored", camera_js)
        self.assertIn("modelPlate ? latestRawText : \"\"", camera_js)

    def test_plate_search_preserves_hk_ioq_normalization_rule(self) -> None:
        camera_js = (ROOT / "assets" / "camera.js").read_text(encoding="utf-8")
        index_js = (ROOT / "assets" / "index.js").read_text(encoding="utf-8")
        index_state_js = (ROOT / "assets" / "index.state.js").read_text(encoding="utf-8")
        search_worker = (ROOT / "assets" / "search.worker.js").read_text(encoding="utf-8")
        worker_lib = (ROOT / "cloudflare-worker" / "src" / "lib.mjs").read_text(encoding="utf-8")
        worker_api = (ROOT / "cloudflare-worker" / "src" / "api.mjs").read_text(encoding="utf-8")

        for source in [index_js, index_state_js, search_worker, worker_lib]:
            self.assertRegex(source, re.compile(r'I["\']?,\s*["\']1|/I/g,\s*["\']1["\']|replaceAll\("I", "1"\)'))
            self.assertRegex(source, re.compile(r'O["\']?,\s*["\']0|/O/g,\s*["\']0["\']|replaceAll\("O", "0"\)'))
            self.assertRegex(source, re.compile(r'Q["\']?,\s*["\']["\']|/Q/g,\s*["\']["\']|replaceAll\("Q", ""\)'))

        self.assertIn('.replace(/I/g, "1")', camera_js)
        self.assertIn('.replace(/O/g, "0")', camera_js)
        self.assertIn('.replace(/Q/g, "")', camera_js)
        self.assertIn("IRIS LAM should normalize as 1R1SLAM", worker_api)
        self.assertIn("IRIS LAM 時，plate 應正規化為 1R1SLAM", worker_api)

    def test_cloudflare_deploy_checks_required_vision_secret(self) -> None:
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        wrangler = json.loads((ROOT / "wrangler.jsonc").read_text(encoding="utf-8"))
        script = (ROOT / "scripts" / "check_cloudflare_worker_secrets.mjs").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("cf:secrets:check", package["scripts"])
        self.assertIn("cf:deploy:ci", package["scripts"])
        self.assertIn("cf:secrets:check", package["scripts"]["cf:deploy"])
        self.assertNotIn("cf:secrets:check", package["scripts"]["cf:deploy:ci"])
        self.assertIn("OPENAI_API_KEY", wrangler["secrets"]["required"])
        self.assertIn("OPENAI_API_KEY", script)
        self.assertIn("wrangler secret put OPENAI_API_KEY", script)
        self.assertIn("wrangler secret put OPENAI_API_KEY", readme)

    def test_public_read_endpoints_are_rate_limited(self) -> None:
        worker_api = (ROOT / "cloudflare-worker" / "src" / "api.mjs").read_text(encoding="utf-8")
        worker_lib = (ROOT / "cloudflare-worker" / "src" / "lib.mjs").read_text(encoding="utf-8")
        self.assertIn("enforcePublicReadRateLimit(request, `issues:${dataset}`", worker_api)
        self.assertIn("enforcePublicReadRateLimit(request, `issue:${dataset}`", worker_api)
        self.assertIn("enforcePublicReadRateLimit(request, `results:${dataset}`", worker_api)
        self.assertIn("enforcePublicReadRateLimit(request, `search:${dataset}`", worker_api)
        self.assertIn('enforcePageSize("search", pageSize, 200)', worker_api)
        self.assertIn('enforcePageSize("results", pageSize, 200)', worker_api)
        self.assertIn("export function enforcePublicReadRateLimit(", worker_lib)

    def test_frontend_maps_rate_limited_api_states_to_readable_messages(self) -> None:
        index_config = (ROOT / "assets" / "index.config.js").read_text(encoding="utf-8")
        index_data = (ROOT / "assets" / "index.data.js").read_text(encoding="utf-8")
        camera_js = (ROOT / "assets" / "camera.js").read_text(encoding="utf-8")
        self.assertIn("apiRateLimited", index_config)
        self.assertIn("apiInvalidPaging", index_config)
        self.assertIn("readableApiError(", index_data)
        self.assertIn('err?.status === 429', index_data)
        self.assertIn('err?.code === "invalid_paging"', index_data)
        self.assertIn("visionCooldownActive", camera_js)
        self.assertIn("remainingVisionCooldownMs(", camera_js)
        self.assertIn("readableCameraError(", camera_js)
        self.assertIn("ocrMetaEl.textContent = readableCameraError(err);", camera_js)
        self.assertIn("ensureVisionSessionToken()", camera_js)
        self.assertIn("vision_token: visionToken", camera_js)

    def test_no_legacy_php_runtime_files_remain(self) -> None:
        self.assertFalse(list((ROOT / "api").glob("*.php")))
        self.assertFalse(list((ROOT / "api").glob("**/*.php")))
        self.assertFalse((ROOT / ".htaccess").exists())
        self.assertFalse((ROOT / "api" / ".htaccess").exists())
        self.assertFalse((ROOT / "server").exists())

    def test_worker_hardening_blocks_sensitive_files_and_unused_ocr_sources(self) -> None:
        worker = (ROOT / "cloudflare-worker" / "src" / "index.mjs").read_text(encoding="utf-8")
        self.assertIn("securityHeadersForAsset(", worker)
        self.assertIn("content-security-policy", worker)
        self.assertIn("x-content-type-options", worker)
        self.assertNotIn("api.qrserver.com", worker)
        self.assertNotIn("cdn.jsdelivr.net", worker)
        self.assertNotIn("tessdata.projectnaptha.com", worker)

    def test_share_poster_uses_local_qr_generator(self) -> None:
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        share_js = (ROOT / "assets" / "index.share.js").read_text(encoding="utf-8")
        self.assertIn("./assets/vendor/qrcode-generator.js", html)
        self.assertIn("./assets/index.share.js", html)
        self.assertIn('typeof qrcode !== "function"', share_js)
        self.assertNotIn("api.qrserver.com", share_js)

    def test_security_document_exists(self) -> None:
        security = (ROOT / "SECURITY.md").read_text(encoding="utf-8")
        self.assertIn("## Trust Boundaries", security)
        self.assertIn("## Attack Surface", security)
        self.assertIn("## STRIDE Summary", security)

    def test_agent_readiness_discovery_artifacts_exist(self) -> None:
        llms = (ROOT / "llms.txt").read_text(encoding="utf-8")
        agent_md = (ROOT / "agent.md").read_text(encoding="utf-8")
        skill_md = (ROOT / "skill.md").read_text(encoding="utf-8")
        worker = (ROOT / "cloudflare-worker" / "src" / "index.mjs").read_text(encoding="utf-8")
        worker_api = (ROOT / "cloudflare-worker" / "src" / "api.mjs").read_text(encoding="utf-8")
        worker_lib = (ROOT / "cloudflare-worker" / "src" / "lib.mjs").read_text(encoding="utf-8")
        worker_mcp = (ROOT / "cloudflare-worker" / "src" / "mcp.mjs").read_text(encoding="utf-8")
        webmcp = (ROOT / "assets" / "index.webmcp.js").read_text(encoding="utf-8")
        api_catalog = (ROOT / ".well-known" / "api-catalog.json").read_text(encoding="utf-8")
        agent_skills = (ROOT / ".well-known" / "agent-skills" / "index.json").read_text(encoding="utf-8")
        legacy_skills = (ROOT / ".well-known" / "skills" / "index.json").read_text(encoding="utf-8")
        openapi = (ROOT / "api" / "openapi.yaml").read_text(encoding="utf-8")
        dev_vars = (ROOT / "cloudflare-worker" / ".dev.vars.example").read_text(encoding="utf-8")

        self.assertIn("/.well-known/api-catalog", llms)
        self.assertIn("/.well-known/agent-skills/index.json", llms)
        self.assertIn("/.well-known/oauth-protected-resource", llms)
        self.assertIn("/.well-known/oauth-authorization-server", llms)
        self.assertIn("/.well-known/jwks.json", llms)
        self.assertIn("/.well-known/mcp/server-card.json", llms)
        self.assertIn("/.well-known/mcp-server-card", llms)
        self.assertIn("/mcp", llms)
        self.assertIn("/agent.md", llms)
        self.assertIn("Public server-side search API", llms)
        self.assertIn("/api/search?dataset=all&q=88", llms)
        self.assertIn("Plate.hk Agent Overview", agent_md)
        self.assertIn("name: platehk-public-data", skill_md)
        self.assertIn("text/markdown", worker)
        self.assertIn('rel="api-catalog"', worker)
        self.assertIn("/.well-known/oauth-protected-resource", worker)
        self.assertIn("/.well-known/oauth-authorization-server", worker)
        self.assertIn("/.well-known/jwks.json", worker)
        self.assertIn("/.well-known/mcp/server-card.json", worker)
        self.assertIn("/.well-known/mcp-server-card", worker)
        self.assertIn('url.pathname === "/mcp"', worker)
        self.assertIn("serveHomepageMarkdown", worker)
        self.assertIn("oauth/token", worker_api)
        self.assertIn("handleOauthToken", worker_api)
        self.assertIn("buildOAuthProtectedResourceMetadata", worker_lib)
        self.assertIn("issueOAuthAccessToken", worker_lib)
        self.assertIn("requireOAuthAccessToken", worker_lib)
        self.assertIn("buildMcpServerCard", worker_mcp)
        self.assertIn("handleMcpRequest", worker_mcp)
        self.assertIn("platehk_search", worker_mcp)
        self.assertIn("platehk_search", webmcp)
        self.assertIn("navigator.modelContext", webmcp)
        self.assertIn('"linkset"', api_catalog)
        self.assertIn('"https://plate.hk/.well-known/oauth-protected-resource"', api_catalog)
        self.assertIn('"https://plate.hk/.well-known/mcp/server-card.json"', api_catalog)
        self.assertIn('"https://plate.hk/.well-known/oauth-authorization-server"', api_catalog)
        self.assertIn('"skills"', agent_skills)
        self.assertIn('"skills"', legacy_skills)
        self.assertIn("/api/oauth/token", openapi)
        self.assertIn("/api/search:", openapi)
        self.assertIn("url: https://plate.hk", openapi)
        self.assertIn("vision:ocr", openapi)
        self.assertIn("OAUTH_CLIENTS_JSON", dev_vars)
        self.assertIn("OAUTH_JWT_PRIVATE_JWK", dev_vars)
        self.assertIn("OAUTH_JWKS_JSON", dev_vars)

    def test_seo_and_answer_engine_surfaces_are_source_grounded(self) -> None:
        index_html = (ROOT / "index.html").read_text(encoding="utf-8")
        title_match = re.search(r'<h1 id="titleMain">\s*([^<]+)', index_html)
        self.assertIsNotNone(title_match)
        self.assertEqual(title_match.group(1).strip(), "香港車牌拍賣資料庫")

        index_ld = json.loads(
            re.search(
                r'<script type="application/ld\+json">\s*(.*?)\s*</script>',
                index_html,
                re.DOTALL,
            ).group(1)
        )
        index_types = {item["@type"] for item in index_ld["@graph"]}
        self.assertEqual(index_types, {"Organization", "WebSite", "Dataset"})
        index_dataset = next(item for item in index_ld["@graph"] if item["@type"] == "Dataset")
        self.assertEqual(index_dataset["provider"], {"@id": "https://plate.hk/#organization"})
        self.assertEqual(
            {item["contentUrl"] for item in index_dataset["distribution"]},
            {
                "https://plate.hk/api/v1/index.json",
                "https://plate.hk/api/v1/all/results.chunks.json",
            },
        )
        self.assertIn('id="aboutLink" href="./about.html?lang=zh"', index_html)

        plate_html = (ROOT / "plates" / "88.html").read_text(encoding="utf-8")
        self.assertIn('<span data-lang-only="zh">官方 PDF</span>', plate_html)
        self.assertIn('<span data-lang-only="en" hidden>Official source</span>', plate_html)
        self.assertIn('data-copy-zh="直接答案" data-copy-en="Direct Answers"', plate_html)
        self.assertIn("Is this a current valuation?", plate_html)
        self.assertIn("What public auction records exist for Hong Kong plate 88?", plate_html)
        self.assertIn('rel="alternate" type="application/json"', plate_html)
        self.assertIn('<table class="responsive-table">', plate_html)
        self.assertIn('<td data-label-zh="日期" data-label-en="Date">', plate_html)
        self.assertIn('<td data-label-zh="分類" data-label-en="Dataset">', plate_html)
        self.assertIn('data-label-zh="成交價" data-label-en="Price"', plate_html)
        self.assertIn('<td data-label-zh="來源" data-label-en="Source">', plate_html)
        self.assertIn(".grid > *, .stack, .card { min-width:0; }", plate_html)
        self.assertNotIn("If users search", plate_html)
        self.assertNotIn("built to answer direct searches", plate_html)
        for plate_path in sorted((ROOT / "plates").glob("*.html")):
            if plate_path.name == "index.html":
                continue
            with self.subTest(plate_page=plate_path.name):
                generated_plate_html = plate_path.read_text(encoding="utf-8")
                self.assertIn('<table class="responsive-table">', generated_plate_html)
                self.assertIn('<td data-label-zh="日期" data-label-en="Date">', generated_plate_html)
                self.assertIn('<td data-label-zh="分類" data-label-en="Dataset">', generated_plate_html)
                self.assertIn('data-label-zh="成交價" data-label-en="Price"', generated_plate_html)
                self.assertIn('<td data-label-zh="來源" data-label-en="Source">', generated_plate_html)
                self.assertIn(".grid > *, .stack, .card { min-width:0; }", generated_plate_html)
        plate_ld = json.loads(
            re.search(
                r'<script type="application/ld\+json">(.*?)</script>',
                plate_html,
                re.DOTALL,
            ).group(1)
        )
        plate_types = {item["@type"] for item in plate_ld["@graph"]}
        self.assertEqual(plate_types, {"Organization", "WebPage", "Dataset", "FAQPage", "BreadcrumbList"})
        plate_dataset = next(item for item in plate_ld["@graph"] if item["@type"] == "Dataset")
        self.assertGreaterEqual(len(plate_dataset["description"]), 50)
        self.assertEqual(plate_dataset["provider"], {"@id": "https://plate.hk/#organization"})
        self.assertTrue(all(url.startswith("https://www.td.gov.hk/") for url in plate_dataset["isBasedOn"]))

        about_html = (ROOT / "about.html").read_text(encoding="utf-8")
        self.assertIn("Plate.hk 是獨立、唯讀", about_html)
        self.assertIn("在哪裡可以查到香港車牌的官方拍賣成交紀錄？", about_html)
        self.assertIn("Where can I check official Hong Kong vehicle registration mark auction results?", about_html)
        self.assertIn("Plate.hk 不是政府網站", about_html)
        self.assertIn("independent, non-government", about_html)
        self.assertIn("歷史成交價等於現時估值、車主資料或放售狀態嗎？", about_html)
        self.assertIn("PVRM、TVRM 實體拍賣及拍牌易有甚麼分別？", about_html)
        self.assertIn("車牌可以獨立轉讓嗎？", about_html)
        self.assertIn("Can a mark be transferred on its own?", about_html)
        self.assertIn("Plate.hk 的拍賣紀錄不是來自 DATA.GOV.HK", about_html)
        self.assertIn("Plate.hk auction records do not come from DATA.GOV.HK", about_html)
        self.assertIn("https://www.elegislation.gov.hk/hk/cap374E/s12", about_html)
        self.assertIn("https://www.elegislation.gov.hk/hk/cap374E/s17", about_html)
        self.assertIn("W, R, D, H, S, and V", about_html)
        self.assertIn("不是現時估值、車主或持有人紀錄、即時放售證明", about_html)
        self.assertIn("GET /api/search?dataset=all&amp;q=88", about_html)
        self.assertIn('data-copy-en="API Dataset Index"', about_html)
        self.assertIn('<table class="responsive-table">', about_html)
        self.assertIn('data-label-zh="資料集" data-label-en="Dataset"', about_html)
        self.assertIn('<td data-label-zh="資料列" data-label-en="Rows">', about_html)
        self.assertIn('data-label-zh="範圍" data-label-en="Scope"', about_html)
        self.assertIn(".responsive-table th[scope=\"row\"]::before", about_html)
        about_ld = json.loads(
            re.search(
                r'<script type="application/ld\+json">(.*?)</script>',
                about_html,
                re.DOTALL,
            ).group(1)
        )
        about_types = {item["@type"] for item in about_ld["@graph"]}
        self.assertEqual(about_types, {"Organization", "WebPage", "Dataset", "FAQPage", "BreadcrumbList"})
        about_dataset = next(item for item in about_ld["@graph"] if item["@type"] == "Dataset")
        self.assertEqual(about_dataset["provider"], {"@id": "https://plate.hk/#organization"})

        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        for url in ["https://plate.hk/about.html", "https://plate.hk/camera.html", "https://plate.hk/mcp.html"]:
            self.assertIn(f"<loc>{url}</loc>", sitemap)
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        self.assertIn("Allow: /api/openapi.yaml", robots)
        self.assertIn("Allow: /api/v1/index.json", robots)
        self.assertIn("Disallow: /api/", robots)

        llms = (ROOT / "llms.txt").read_text(encoding="utf-8")
        agent_md = (ROOT / "agent.md").read_text(encoding="utf-8")
        worker = (ROOT / "cloudflare-worker" / "src" / "index.mjs").read_text(encoding="utf-8")
        cloudflare_builder = (ROOT / "scripts" / "build_cloudflare_public.py").read_text(encoding="utf-8")
        self.assertIn("Citation and verification guidance", llms)
        self.assertIn("Direct source-discovery answer", llms)
        self.assertIn("not a current valuation", llms)
        self.assertIn("not a vehicle-registration-mark auction dataset", llms)
        self.assertIn("top-level array name rows, not results", llms)
        self.assertIn("Data guide and methodology", agent_md)
        self.assertIn("Official auction result source discovery", agent_md)
        self.assertIn("Classification and transferability guardrails", agent_md)
        self.assertIn("The array is not named `results`", agent_md)
        self.assertIn('</about.html>; rel="describedby"', worker)
        self.assertIn("module.render_about()", cloudflare_builder)

    def test_all_generated_plate_pages_have_unique_source_grounded_schema(self) -> None:
        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        pages = sorted(
            path
            for path in (ROOT / "plates").glob("*.html")
            if path.name != "index.html" and " " not in path.name
        )
        self.assertEqual(len(pages), 800)

        canonicals = set()
        for path in pages:
            page_html = path.read_text(encoding="utf-8")
            canonical_match = re.search(r'<link rel="canonical" href="([^"]+)"', page_html)
            self.assertIsNotNone(canonical_match, path.name)
            canonical = canonical_match.group(1)
            self.assertNotIn(canonical, canonicals, path.name)
            canonicals.add(canonical)
            self.assertIn(f"<loc>{canonical}</loc>", sitemap, path.name)

            self.assertIn('data-copy-zh="直接答案" data-copy-en="Direct Answers"', page_html, path.name)
            self.assertIn('assets/info-locale.js?v=20260825-01', page_html, path.name)
            self.assertIn("What public auction records exist for Hong Kong plate", page_html, path.name)
            self.assertIn("Is this a current valuation?", page_html, path.name)
            self.assertNotIn("If users search", page_html, path.name)
            self.assertNotIn("built to answer direct searches", page_html, path.name)
            self.assertTrue(
                "Official source" in page_html
                or "Source file" in page_html
                or "Source unavailable" in page_html,
                path.name,
            )

            ld_match = re.search(
                r'<script type="application/ld\+json">(.*?)</script>',
                page_html,
                re.DOTALL,
            )
            self.assertIsNotNone(ld_match, path.name)
            graph = json.loads(ld_match.group(1))["@graph"]
            self.assertEqual(
                {item["@type"] for item in graph},
                {"Organization", "WebPage", "Dataset", "FAQPage", "BreadcrumbList"},
                path.name,
            )
            dataset = next(item for item in graph if item["@type"] == "Dataset")
            self.assertEqual(dataset["provider"], {"@id": "https://plate.hk/#organization"}, path.name)
            self.assertGreaterEqual(len(dataset["description"]), 50, path.name)
            for source in dataset.get("isBasedOn", []):
                self.assertTrue(
                    source.startswith("https://www.td.gov.hk/")
                    or source.startswith("https://plate.hk/data/"),
                    f"{path.name}: {source}",
                )

        self.assertEqual(len(canonicals), 800)

    def test_seo_hub_about_stats_and_auxiliary_metadata_are_complete(self) -> None:
        hub_html = (ROOT / "plates" / "index.html").read_text(encoding="utf-8")
        self.assertIn('<link rel="canonical" href="https://plate.hk/plates/index.html"', hub_html)
        self.assertIn('href="../about.html"', hub_html)
        self.assertIn("Historical prices are not current valuations", hub_html)
        hub_ld = json.loads(
            re.search(
                r'<script type="application/ld\+json">(.*?)</script>',
                hub_html,
                re.DOTALL,
            ).group(1)
        )
        self.assertEqual(
            {item["@type"] for item in hub_ld["@graph"]},
            {"CollectionPage", "BreadcrumbList"},
        )

        dataset_paths = [
            ROOT / "data" / "results.slim.json",
            ROOT / "data" / "tvrm_physical" / "results.slim.json",
            ROOT / "data" / "tvrm_eauction" / "results.slim.json",
            ROOT / "data" / "tvrm_legacy" / "results.slim.json",
        ]
        datasets = [json.loads(path.read_text(encoding="utf-8")) for path in dataset_paths]
        total_rows = sum(len(rows) for rows in datasets)
        dates = [str(row.get("auction_date")) for rows in datasets for row in rows if row.get("auction_date")]

        about_html = (ROOT / "about.html").read_text(encoding="utf-8")
        self.assertIn('<link rel="canonical" href="https://plate.hk/about.html"', about_html)
        self.assertIn(f"<strong>{total_rows:,}</strong>", about_html)
        about_ld = json.loads(
            re.search(
                r'<script type="application/ld\+json">(.*?)</script>',
                about_html,
                re.DOTALL,
            ).group(1)
        )
        about_dataset = next(item for item in about_ld["@graph"] if item["@type"] == "Dataset")
        self.assertEqual(about_dataset["temporalCoverage"], f"{min(dates)}/{max(dates)}")
        self.assertEqual(about_dataset["provider"], {"@id": "https://plate.hk/#organization"})

        camera_html = (ROOT / "camera.html").read_text(encoding="utf-8")
        self.assertIn("<title>香港車牌相機辨識搜尋 | Plate.hk</title>", camera_html)
        self.assertIn('<meta property="og:site_name" content="Plate.hk"', camera_html)
        self.assertIn('<meta name="twitter:card" content="summary"', camera_html)
        for html_name, title in [
            ("audit.html", "<title>資料審核 | Plate.hk</title>"),
            ("mcp.html", "<title>MCP 文件 | Plate.hk</title>"),
        ]:
            self.assertIn(title, (ROOT / html_name).read_text(encoding="utf-8"), html_name)

    def test_source_links_only_accept_local_data_or_transport_department_urls(self) -> None:
        import importlib.util

        module_path = ROOT / "scripts" / "build_popular_plate_pages.py"
        spec = importlib.util.spec_from_file_location("build_popular_plate_pages", module_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        self.assertEqual(
            module.source_url({"pdf_url": "./data/source%20file.xlsx"}),
            "https://plate.hk/data/source%20file.xlsx",
        )
        official = "https://www.td.gov.hk/filemanager/example.pdf"
        self.assertEqual(module.source_url({"pdf_url": official}), official)
        self.assertEqual(module.source_url({"pdf_url": "https://example.com/source.pdf"}), "")
        self.assertEqual(module.source_url({"pdf_url": "javascript:alert(1)"}), "")
        self.assertIn("p.&lt;2&gt;", module.source_link_html({"pdf_url": official, "page": "<2>"}))

    def test_security_ci_and_worker_guardrails_exist(self) -> None:
        worker_lib = (ROOT / "cloudflare-worker" / "src" / "lib.mjs").read_text(encoding="utf-8")
        workflow = (ROOT / ".github" / "workflows" / "security.yml").read_text(encoding="utf-8")
        check_security = (ROOT / "scripts" / "check_security.sh").read_text(encoding="utf-8")
        secrets_scan = (ROOT / "scripts" / "scan_repo_secrets.py").read_text(encoding="utf-8")
        summarize_security = (ROOT / "scripts" / "summarize_security_events.py").read_text(encoding="utf-8")
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("enforcePageSize(", worker_lib)
        self.assertIn("enforcePublicReadRateLimit(", worker_lib)
        self.assertIn("pip_audit", check_security)
        self.assertIn('"ls-files"', secrets_scan)
        self.assertIn("Top events:", summarize_security)
        self.assertIn("actions/checkout@v6", workflow)
        self.assertIn("actions/setup-python@v6", workflow)
        self.assertIn("python-version: \"3.12\"", workflow)
        self.assertIn("PYTHON_BIN: python", workflow)
        self.assertIn("sys.version_info < (3, 12)", workflow)
        self.assertIn("pip-audit", workflow)
        self.assertIn("security-events.log", gitignore)


if __name__ == "__main__":
    unittest.main()
