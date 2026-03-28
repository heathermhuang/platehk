#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[1/4] Rebuild PVRM from local PDFs"
python3 scripts/build_dataset.py --offline

echo "[2/4] Rebuild TVRM datasets from local PDFs"
python3 scripts/parse_tvrm_pdfs.py

echo "[3/4] Verify integrity"
python3 scripts/verify_data_integrity.py

echo "[4/4] Build audit report"
python3 scripts/build_audit_report.py

echo "OK: ./data/audit.json and ./audit.html"

