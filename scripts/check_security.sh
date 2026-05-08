#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"

"${PYTHON_BIN}" scripts/scan_repo_secrets.py

if [[ "${CHECK_SECURITY_SKIP_DEPS:-0}" == "1" ]]; then
  echo "Dependency audit skipped (CHECK_SECURITY_SKIP_DEPS=1)."
  exit 0
fi

if ! "${PYTHON_BIN}" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 10) else 1)
PY
then
  echo "Dependency audit skipped: requirements need Python 3.10+; current runtime is $("${PYTHON_BIN}" --version 2>&1)."
  exit 0
fi

if "${PYTHON_BIN}" - <<'PY' >/dev/null 2>&1
import importlib.util
raise SystemExit(0 if importlib.util.find_spec("pip_audit") else 1)
PY
then
  "${PYTHON_BIN}" -m pip_audit -r requirements.txt --progress-spinner=off
else
  echo "pip-audit not installed; skipping dependency audit."
fi
