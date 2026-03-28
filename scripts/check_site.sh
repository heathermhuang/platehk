#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

python3 -m py_compile \
  scripts/build_all_search_index.py \
  scripts/build_all_short_exact_index.py \
  scripts/build_hot_search_cache.py \
  scripts/build_cloudflare_public.py \
  scripts/build_dataset.py \
  scripts/merge_tvrm_exact_workbook.py \
  scripts/build_public_api.py \
  scripts/build_tvrm_dataset.py \
  scripts/build_tvrm_legacy_dataset.py \
  scripts/build_all_results_preset.py \
  scripts/verify_data_integrity.py \
  scripts/build_audit_report.py \
  scripts/export_mysql_dump.py \
  scripts/scan_repo_secrets.py

php -l api/lib.php >/dev/null
php -l api/admin/sync.php >/dev/null
bash -n scripts/run_local.sh
bash -n scripts/stop_local.sh
bash -n scripts/build_site.sh
bash -n scripts/package_release.sh
bash -n scripts/release_ready.sh
bash -n scripts/check_security.sh
python3 scripts/scan_repo_secrets.py
python3 scripts/build_cloudflare_public.py >/dev/null
node --check cloudflare-worker/src/lib.mjs
node --check cloudflare-worker/src/api.mjs
node --check cloudflare-worker/src/index.mjs

if [[ "${CHECK_SITE_SKIP_TESTS:-0}" != "1" ]]; then
  python3 -m unittest discover -s tests
fi

echo "Checks completed."
