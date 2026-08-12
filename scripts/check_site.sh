#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"
export PYTHONPYCACHEPREFIX="${PYTHONPYCACHEPREFIX:-${TMPDIR:-/tmp}/pvrm-pycache}"

"${PYTHON_BIN}" -m py_compile \
  scripts/build_all_search_index.py \
  scripts/build_all_short_exact_index.py \
  scripts/build_hot_search_cache.py \
  scripts/build_cloudflare_public.py \
  scripts/scrape_28car_market.py \
  scripts/build_events.py \
  scripts/build_dataset.py \
  scripts/merge_tvrm_exact_workbook.py \
  scripts/build_public_api.py \
  scripts/build_tvrm_dataset.py \
  scripts/build_tvrm_legacy_dataset.py \
  scripts/build_all_results_preset.py \
  scripts/check_duplicate_generated_artifacts.py \
  scripts/check_production_freshness.py \
  scripts/check_market_production.py \
  scripts/verify_data_integrity.py \
  scripts/build_audit_report.py \
  scripts/auto_heal_update.py \
  scripts/scan_repo_secrets.py \
  scripts/process_broker_notifications.py

bash -n scripts/run_local.sh
bash -n scripts/stop_local.sh
bash -n scripts/build_site.sh
bash -n scripts/package_release.sh
bash -n scripts/release_ready.sh
bash -n scripts/check_security.sh
"${PYTHON_BIN}" scripts/scan_repo_secrets.py
"${PYTHON_BIN}" scripts/check_duplicate_generated_artifacts.py
"${PYTHON_BIN}" scripts/build_cloudflare_public.py >/dev/null
node --check cloudflare-worker/src/lib.mjs
node --check cloudflare-worker/src/api.mjs
node --check cloudflare-worker/src/index.mjs
node --check assets/index.market.js
node tests/market_worker_test.mjs

if [[ "${CHECK_SITE_SKIP_TESTS:-0}" != "1" ]]; then
  "${PYTHON_BIN}" -m unittest discover -s tests
fi

echo "Checks completed."
