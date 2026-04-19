#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-8080}"
PID_FILE="/tmp/pvrm_local_${PORT}.pid"
LOG_FILE="/tmp/pvrm_local_${PORT}.log"

if lsof -iTCP:"${PORT}" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "Port ${PORT} is already in use. Stop it first or choose another port." >&2
  exit 1
fi

cd "${ROOT_DIR}"

if [[ ! -f ".tmp/cloudflare-public/index.html" \
   || ! -f ".tmp/cloudflare-public/api/v1/index.json" \
   || ! -f ".tmp/cloudflare-public/api/v1/all/issues.manifest.json" ]]; then
  npm run build:cloudflare:assets >/dev/null
fi
nohup npx wrangler dev \
  --config wrangler.jsonc \
  --local \
  --ip 127.0.0.1 \
  --port "${PORT}" \
  --local-protocol http \
  --log-level error \
  --show-interactive-dev-session=false \
  >"${LOG_FILE}" 2>&1 &
PID=$!
echo "${PID}" > "${PID_FILE}"
sleep 3

if curl -sS "http://127.0.0.1:${PORT}/" >/dev/null; then
  echo "PVRM started: http://127.0.0.1:${PORT}"
  echo "PID: ${PID}  Log: ${LOG_FILE}"
else
  echo "Server started but health check failed. Log: ${LOG_FILE}" >&2
  exit 1
fi
