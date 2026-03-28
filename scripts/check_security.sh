#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

python3 scripts/scan_repo_secrets.py

if [[ "${CHECK_SECURITY_SKIP_DEPS:-0}" == "1" ]]; then
  echo "Dependency audit skipped (CHECK_SECURITY_SKIP_DEPS=1)."
  exit 0
fi

if python3 - <<'PY' >/dev/null 2>&1
import importlib.util
raise SystemExit(0 if importlib.util.find_spec("pip_audit") else 1)
PY
then
  python3 -m pip_audit -r requirements.txt --progress-spinner=off
else
  echo "pip-audit not installed; skipping dependency audit."
fi
