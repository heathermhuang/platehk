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

RUNTIME="${PVRM_LOCAL_RUNTIME:-node}"
WRANGLER_LOG_DIR="${HOME:-}/.wrangler/logs"

if [[ ! -f ".tmp/cloudflare-public/index.html" \
   || ! -f ".tmp/cloudflare-public/api/v1/index.json" \
   || ! -f ".tmp/cloudflare-public/api/v1/all/issues.manifest.json" ]]; then
  npm run build:cloudflare:assets >/dev/null
fi

start_wrangler() {
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
}

start_node_shim() {
  nohup node scripts/local_worker_dev.mjs \
    --host 127.0.0.1 \
    --port "${PORT}" \
    --assets .tmp/cloudflare-public \
    >"${LOG_FILE}" 2>&1 &
  PID=$!
  echo "${PID}" > "${PID_FILE}"
}

if [[ "${RUNTIME}" == "wrangler" ]] && ! mkdir -p "${WRANGLER_LOG_DIR}" >/dev/null 2>&1; then
  echo "Wrangler log directory is not writable: ${WRANGLER_LOG_DIR}" >&2
  exit 1
fi

if [[ "${RUNTIME}" == "auto" ]] && ! mkdir -p "${WRANGLER_LOG_DIR}" >/dev/null 2>&1; then
  RUNTIME="node"
fi

if [[ "${RUNTIME}" == "node" ]]; then
  start_node_shim
else
  start_wrangler
fi

sleep 3

if ! curl --max-time 2 -sS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1 && [[ "${RUNTIME}" == "auto" ]]; then
  if kill "${PID}" >/dev/null 2>&1; then
    wait "${PID}" 2>/dev/null || true
  fi
  {
    echo
    echo "Wrangler did not become healthy on port ${PORT}; falling back to local Worker shim."
  } >>"${LOG_FILE}"
  start_node_shim
  sleep 1
fi

if curl --max-time 2 -sS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
  echo "PVRM started: http://127.0.0.1:${PORT}"
  echo "PID: ${PID}  Log: ${LOG_FILE}"
else
  echo "Server started but health check failed. Log: ${LOG_FILE}" >&2
  rm -f "${PID_FILE}"
  exit 1
fi
