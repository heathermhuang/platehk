#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8080}"
PID_FILE="/tmp/pvrm_php_${PORT}.pid"

if [[ -f "${PID_FILE}" ]]; then
  PID="$(cat "${PID_FILE}")"
  if kill "${PID}" >/dev/null 2>&1; then
    rm -f "${PID_FILE}"
    echo "Stopped PVRM on port ${PORT} (PID ${PID})."
    exit 0
  fi
fi

PIDS="$(lsof -tiTCP:${PORT} -sTCP:LISTEN -n -P || true)"
if [[ -n "${PIDS}" ]]; then
  kill ${PIDS}
  echo "Stopped process(es) on port ${PORT}: ${PIDS}"
else
  echo "No running server found on port ${PORT}."
fi
