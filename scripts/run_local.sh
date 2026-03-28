#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-8080}"
PID_FILE="/tmp/pvrm_php_${PORT}.pid"
LOG_FILE="/tmp/pvrm_php_${PORT}.log"

if [[ -x "/opt/homebrew/bin/php" ]]; then
  PHP_BIN="/opt/homebrew/bin/php"
elif command -v php >/dev/null 2>&1; then
  PHP_BIN="$(command -v php)"
else
  echo "Error: PHP not found. Install PHP first (Homebrew: brew install php)." >&2
  exit 1
fi

if lsof -iTCP:"${PORT}" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "Port ${PORT} is already in use. Stop it first or choose another port." >&2
  exit 1
fi

cd "${ROOT_DIR}"
nohup "${PHP_BIN}" -S 127.0.0.1:"${PORT}" -t . >"${LOG_FILE}" 2>&1 &
PID=$!
echo "${PID}" > "${PID_FILE}"
sleep 1

if curl -sS "http://127.0.0.1:${PORT}/" >/dev/null; then
  echo "PVRM started: http://127.0.0.1:${PORT}"
  echo "PID: ${PID}  Log: ${LOG_FILE}"
else
  echo "Server started but health check failed. Log: ${LOG_FILE}" >&2
  exit 1
fi
