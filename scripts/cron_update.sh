#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
LOG_DIR="$ROOT/logs"
MODE="${MODE:-incremental}" # incremental | full
mkdir -p "$LOG_DIR"

cd "$ROOT"

# If you use a virtual environment, enable it here.
# source "$ROOT/.venv/bin/activate"

# Update datasets
# PVRM dataset builder currently runs full normalization; keep it for data correctness.
python3 scripts/build_dataset.py
python3 scripts/sync_lny_urls_to_tvrm_physical.py

# TVRM default path is incremental-safe inventory merge; keep full legacy re-parse for manual repair only.
before_phy_issues="$(python3 - <<'PY'\nimport json\nfrom pathlib import Path\np=Path('data/tvrm_physical/issues.manifest.json')\nprint(json.loads(p.read_text()).get('issue_count',0) if p.exists() else 0)\nPY\n)"
before_ea_issues="$(python3 - <<'PY'\nimport json\nfrom pathlib import Path\np=Path('data/tvrm_eauction/issues.manifest.json')\nprint(json.loads(p.read_text()).get('issue_count',0) if p.exists() else 0)\nPY\n)"

python3 scripts/build_tvrm_dataset.py

after_phy_issues="$(python3 - <<'PY'\nimport json\nfrom pathlib import Path\np=Path('data/tvrm_physical/issues.manifest.json')\nprint(json.loads(p.read_text()).get('issue_count',0) if p.exists() else 0)\nPY\n)"
after_ea_issues="$(python3 - <<'PY'\nimport json\nfrom pathlib import Path\np=Path('data/tvrm_eauction/issues.manifest.json')\nprint(json.loads(p.read_text()).get('issue_count',0) if p.exists() else 0)\nPY\n)"

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

# Rebuild public API + audit report
python3 scripts/build_public_api.py
python3 scripts/build_audit_report.py
python3 scripts/verify_data_integrity.py
