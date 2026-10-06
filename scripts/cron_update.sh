#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
LOG_DIR="$ROOT/logs"
MODE="${MODE:-incremental}" # incremental | full
SCOPE="${REFRESH_BUILD_SCOPE:-official}" # official | events
if [[ "$MODE" == "full" ]]; then export PDF_PARSE_FORCE=1; fi
case "$SCOPE" in official|events) ;; *) echo "Invalid refresh build scope" >&2; exit 1 ;; esac
mkdir -p "$LOG_DIR"

cd "$ROOT"

# If you use a virtual environment, enable it here.
# source "$ROOT/.venv/bin/activate"

# Update source datasets only when the source observer found changes.
if [[ "$SCOPE" == "official" ]]; then
# Update source datasets.
# PVRM dataset builder currently runs full normalization; keep it for data correctness.
if [[ -f .tmp/source-probe.json ]]; then
  python3 scripts/run_cached_builder.py pvrm --reset
else
  python3 scripts/build_dataset.py
fi
python3 scripts/sync_lny_urls_to_tvrm_physical.py

# TVRM default path is incremental-safe inventory merge; keep full legacy re-parse for manual repair only.
issue_count() {
  python3 - "$1" <<'PY'
import json
import sys
from pathlib import Path

p = Path(sys.argv[1])
print(json.loads(p.read_text()).get("issue_count", 0) if p.exists() else 0)
PY
}

before_phy_issues="$(issue_count data/tvrm_physical/issues.manifest.json)"
before_ea_issues="$(issue_count data/tvrm_eauction/issues.manifest.json)"

if [[ -f .tmp/source-probe.json ]]; then
  python3 scripts/run_cached_builder.py tvrm
else
  python3 scripts/build_tvrm_dataset.py
fi

after_phy_issues="$(issue_count data/tvrm_physical/issues.manifest.json)"
after_ea_issues="$(issue_count data/tvrm_eauction/issues.manifest.json)"

need_repair=0
if [[ "$MODE" == "full" ]]; then
  need_repair=1
elif [[ "$after_phy_issues" -lt "$before_phy_issues" || "$after_ea_issues" -lt "$before_ea_issues" ]]; then
  # Guardrail: if incremental build unexpectedly shrinks historical issues, trigger repair parser.
  need_repair=1
fi

if [[ "$need_repair" -eq 1 ]]; then
  python3 scripts/parse_tvrm_pdfs.py
fi

# TVRM already rebuilds the legacy dataset during its inventory merge.
# Rebuild derived datasets and downstream artifacts.
python3 scripts/build_events.py
python3 scripts/build_all_dataset.py
python3 scripts/build_all_results_preset.py
python3 scripts/build_all_search_index.py
python3 scripts/build_hot_search_cache.py
else
  python3 scripts/build_events.py
fi
python3 scripts/build_popular_plate_pages.py

# Rebuild public API + audit report
python3 scripts/build_public_api.py
python3 scripts/build_audit_report.py
python3 scripts/verify_data_integrity.py
