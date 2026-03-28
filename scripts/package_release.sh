#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$ROOT_DIR/.tmp/releases"
SMOKE=0
OUT_FILE=""

for arg in "$@"; do
  case "$arg" in
    --smoke) SMOKE=1 ;;
    *)
      if [[ -n "$OUT_FILE" ]]; then
        echo "Usage: $0 [--smoke] [output.tar.gz]" >&2
        exit 1
      fi
      OUT_FILE="$arg"
      ;;
  esac
done

OUT_FILE="${OUT_FILE:-$OUT_DIR/platehk-release-$STAMP.tar.gz}"

mkdir -p "$OUT_DIR"
cd "$ROOT_DIR"

if [[ "$SMOKE" -eq 1 ]]; then
  tar -cf - \
    data/all.search.meta.json \
    data/all.prefix1.top200.json \
    data/all.tvrm_legacy_overlap.json \
    data/hot_search/manifest.json \
    data/hot_search/all_amount_desc/88.json \
    api/v1/index.json \
    index.html \
    camera.html \
    sw.js \
    | gzip -1 > "$OUT_FILE"
else
  tar -cf - \
    --exclude='data/pdfs' \
    --exclude='data/results.json' \
    --exclude='data/results.slim.json' \
    --exclude='data/tvrm_physical/pdfs' \
    --exclude='data/tvrm_physical/results.json' \
    --exclude='data/tvrm_physical/results.slim.json' \
    --exclude='data/tvrm_eauction/results.json' \
    --exclude='data/tvrm_eauction/results.slim.json' \
    --exclude='data/tvrm_legacy/results.json' \
    --exclude='data/tvrm_legacy/results.slim.json' \
    data \
    api/v1 \
    index.html \
    camera.html \
    api.html \
    audit.html \
    landing.html \
    changelog.html \
    privacy.html \
    terms.html \
    sw.js \
    assets \
    | gzip -1 > "$OUT_FILE"
fi

echo "$OUT_FILE"
