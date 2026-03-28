#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FAST=0
for arg in "$@"; do
  case "$arg" in
    --fast) FAST=1 ;;
    *)
      echo "Usage: $0 [--fast]" >&2
      exit 1
      ;;
  esac
done

echo "[1/3] Running checks"
if [[ "$FAST" -eq 1 ]]; then
  python3 -m py_compile \
    scripts/build_all_search_index.py \
    scripts/build_all_short_exact_index.py \
    scripts/build_dataset.py \
    scripts/merge_tvrm_exact_workbook.py \
    scripts/build_public_api.py \
    scripts/build_tvrm_dataset.py \
    scripts/build_tvrm_legacy_dataset.py \
    scripts/verify_data_integrity.py \
    scripts/build_audit_report.py \
    scripts/export_mysql_dump.py
  php -l api/lib.php >/dev/null
  php -l api/admin/sync.php >/dev/null
  bash -n scripts/run_local.sh
  bash -n scripts/stop_local.sh
  bash -n scripts/build_site.sh
  bash -n scripts/package_release.sh
  bash -n scripts/release_ready.sh
  echo "Checks completed."
else
  ./scripts/check_site.sh
fi

echo "[2/3] Building smoke package"
SMOKE_PATH="$(./scripts/package_release.sh --smoke)"
echo "Smoke package: $SMOKE_PATH"

echo "[3/3] Release checklist"
cat <<'EOF'
- If data changed, run ./scripts/build_site.sh first.
- Deploy data/, api/v1/, index.html, api.html, audit.html, sw.js, and assets/.
- Hard refresh once after deploy to activate the new service worker cache.
- Verify issue links, all-datasets search, and audit filters on the live site.
EOF
