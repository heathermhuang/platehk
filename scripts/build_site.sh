#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WITH_SQL=0

for arg in "$@"; do
  case "$arg" in
    --with-sql) WITH_SQL=1 ;;
    *)
      echo "Usage: $0 [--with-sql]" >&2
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"

python3 scripts/build_dataset.py
python3 scripts/sync_lny_urls_to_tvrm_physical.py
python3 scripts/build_tvrm_dataset.py
python3 scripts/build_tvrm_legacy_dataset.py
python3 scripts/build_all_results_preset.py
python3 scripts/build_all_search_index.py
python3 scripts/build_hot_search_cache.py
python3 scripts/build_popular_plate_pages.py
python3 scripts/build_public_api.py
python3 scripts/build_audit_report.py
python3 scripts/verify_data_integrity.py

if [[ "$WITH_SQL" -eq 1 ]]; then
  python3 scripts/export_mysql_dump.py
fi

echo "Build completed."
