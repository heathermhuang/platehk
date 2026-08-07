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
        self.assertIn("PLATE", logo)
        self.assertIn(".HK", logo)

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
                "./assets/index.js",
            ],
            "landing.html": ["./assets/landing.js"],
            "audit.html": ["./assets/audit.js"],
            "api.html": ["./assets/api-page.js"],
            "changelog.html": ["./assets/changelog.js"],
            "camera.html": ["./assets/camera.js"],
        }
        for html_name, script_paths in expectations.items():
            html = (ROOT / html_name).read_text(encoding="utf-8")
            for script_path in script_paths:
                self.assertIn(script_path, html, f"{html_name}: {script_path}")

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
        self.assertIn("enforceSearchWindow(dataset, query, page)", worker_api)
        self.assertIn("export function enforcePublicReadRateLimit(", worker_lib)

    def test_frontend_maps_rate_limited_api_states_to_readable_messages(self) -> None:
        index_config = (ROOT / "assets" / "index.config.js").read_text(encoding="utf-8")
        index_data = (ROOT / "assets" / "index.data.js").read_text(encoding="utf-8")
        camera_js = (ROOT / "assets" / "camera.js").read_text(encoding="utf-8")
        self.assertIn("apiRateLimited", index_config)
        self.assertIn("apiQueryWindowExceeded", index_config)
        self.assertIn("apiInvalidPaging", index_config)
        self.assertIn("readableApiError(", index_data)
        self.assertIn('err?.status === 429', index_data)
        self.assertIn('err?.code === "query_window_exceeded"', index_data)
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
        self.assertIn("vision:ocr", openapi)
        self.assertIn("OAUTH_CLIENTS_JSON", dev_vars)
        self.assertIn("OAUTH_JWT_PRIVATE_JWK", dev_vars)
        self.assertIn("OAUTH_JWKS_JSON", dev_vars)

    def test_security_ci_and_worker_guardrails_exist(self) -> None:
        worker_lib = (ROOT / "cloudflare-worker" / "src" / "lib.mjs").read_text(encoding="utf-8")
        workflow = (ROOT / ".github" / "workflows" / "security.yml").read_text(encoding="utf-8")
        check_security = (ROOT / "scripts" / "check_security.sh").read_text(encoding="utf-8")
        secrets_scan = (ROOT / "scripts" / "scan_repo_secrets.py").read_text(encoding="utf-8")
        summarize_security = (ROOT / "scripts" / "summarize_security_events.py").read_text(encoding="utf-8")
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("enforceSearchWindow(", worker_lib)
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
