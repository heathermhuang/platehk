from __future__ import annotations

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
        self.assertIn('.replace(/Q/g, "")', index_js)
        self.assertIn(".replace(/Q/g, '')", worker)

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
        self.assertIn('./assets/camera.js', camera)
        self.assertIn("./api/vision_plate.php", camera_js)
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
        endpoint = (ROOT / "api" / "vision_plate.php").read_text(encoding="utf-8")
        token_endpoint = (ROOT / "api" / "vision_session.php").read_text(encoding="utf-8")
        self.assertIn("enforce_post_request()", endpoint)
        self.assertIn("/responses", endpoint)
        self.assertIn("input_image", endpoint)
        self.assertIn("enforce_json_content_type()", endpoint)
        self.assertIn("enforce_same_origin_request()", endpoint)
        self.assertIn("enforce_rate_limit(", endpoint)
        self.assertIn("require_vision_session_token", endpoint)
        self.assertIn("issue_vision_session_token()", token_endpoint)
        self.assertIn("enforce_same_origin_request()", token_endpoint)

    def test_public_read_endpoints_are_rate_limited(self) -> None:
        for name in ["search.php", "results.php", "issues.php", "issue.php", "health.php"]:
            endpoint = (ROOT / "api" / name).read_text(encoding="utf-8")
            self.assertIn("enforce_public_read_rate_limit(", endpoint, name)
        search = (ROOT / "api" / "search.php").read_text(encoding="utf-8")
        results = (ROOT / "api" / "results.php").read_text(encoding="utf-8")
        self.assertIn("enforce_public_page_size('search', $page_size, 200)", search)
        self.assertIn("enforce_public_search_window($dataset, $qn, $page, $page_size)", search)
        self.assertIn("enforce_public_page_size('results', $page_size, 200)", results)

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

    def test_config_example_uses_placeholders_not_live_secrets(self) -> None:
        example = (ROOT / "api" / "config.local.php.example").read_text(encoding="utf-8")
        self.assertIn("OPENAI_API_KEY_HERE", example)
        self.assertIn("CHANGE_ME", example)
        self.assertIn("db.example.com", example)
        self.assertIn("example_database", example)
        self.assertNotIn("sk-proj-", example)

    def test_htaccess_hardening_blocks_sensitive_files_and_unused_ocr_sources(self) -> None:
        root_htaccess = (ROOT / ".htaccess").read_text(encoding="utf-8")
        api_htaccess = (ROOT / "api" / ".htaccess").read_text(encoding="utf-8")
        self.assertIn("config\\\\.local\\\\.php", root_htaccess)
        self.assertIn("\\\\.env", root_htaccess)
        self.assertIn("config\\\\.local", api_htaccess)
        self.assertNotIn("api.qrserver.com", root_htaccess)
        self.assertNotIn("cdn.jsdelivr.net", root_htaccess)
        self.assertNotIn("tessdata.projectnaptha.com", root_htaccess)

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
        webmcp = (ROOT / "assets" / "index.webmcp.js").read_text(encoding="utf-8")
        api_catalog = (ROOT / ".well-known" / "api-catalog.json").read_text(encoding="utf-8")
        agent_skills = (ROOT / ".well-known" / "agent-skills" / "index.json").read_text(encoding="utf-8")
        legacy_skills = (ROOT / ".well-known" / "skills" / "index.json").read_text(encoding="utf-8")

        self.assertIn("/.well-known/api-catalog", llms)
        self.assertIn("/.well-known/agent-skills/index.json", llms)
        self.assertIn("/agent.md", llms)
        self.assertIn("Plate.hk Agent Overview", agent_md)
        self.assertIn("name: platehk-public-data", skill_md)
        self.assertIn("text/markdown", worker)
        self.assertIn('rel="api-catalog"', worker)
        self.assertIn("serveHomepageMarkdown", worker)
        self.assertIn("platehk_search", webmcp)
        self.assertIn("navigator.modelContext", webmcp)
        self.assertIn('"linkset"', api_catalog)
        self.assertIn('"skills"', agent_skills)
        self.assertIn('"skills"', legacy_skills)

    def test_security_logging_and_ci_scaffolding_exist(self) -> None:
        api_lib = (ROOT / "api" / "lib.php").read_text(encoding="utf-8")
        workflow = (ROOT / ".github" / "workflows" / "security.yml").read_text(encoding="utf-8")
        check_security = (ROOT / "scripts" / "check_security.sh").read_text(encoding="utf-8")
        secrets_scan = (ROOT / "scripts" / "scan_repo_secrets.py").read_text(encoding="utf-8")
        summarize_security = (ROOT / "scripts" / "summarize_security_events.py").read_text(encoding="utf-8")
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("security_log_event(", api_lib)
        self.assertIn("enforce_public_search_window(", api_lib)
        self.assertIn("enforce_public_page_size(", api_lib)
        self.assertIn("pip_audit", check_security)
        self.assertIn('"ls-files"', secrets_scan)
        self.assertIn("Top events:", summarize_security)
        self.assertIn("pip-audit", workflow)
        self.assertIn("security-events.log", gitignore)


if __name__ == "__main__":
    unittest.main()
