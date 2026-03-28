#!/usr/bin/env bash
set -euo pipefail

BASE="https://www.td.gov.hk"
INDEX="https://www.td.gov.hk/tc/public_services/vehicle_registration_mark/tvrm_auction/index.html"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_PHY="$ROOT_DIR/data/tvrm_physical/pdfs"
OUT_EA="$ROOT_DIR/data/tvrm_eauction/pdfs"
MAP_PHY="$ROOT_DIR/data/tvrm_physical/sources.tsv"
MAP_EA="$ROOT_DIR/data/tvrm_eauction/sources.tsv"

mkdir -p "$OUT_PHY" "$OUT_EA"
mkdir -p "$(dirname "$MAP_PHY")" "$(dirname "$MAP_EA")"

tmp_phy="$(mktemp)"
tmp_ea="$(mktemp)"
trap 'rm -f "$tmp_phy" "$tmp_ea"' EXIT

html=""
for i in 1 2 3 4 5; do
  html="$(curl -L -s --retry 2 --retry-delay 1 -A "PVRM-Indexer/1.0" "$INDEX" || true)"
  if [[ -n "$html" ]]; then
    break
  fi
  sleep 1
done
if [[ -z "$html" ]]; then
  echo "Failed to fetch index: $INDEX" >&2
  exit 1
fi

extract_href() {
  # Extract href values (may be relative) that contain a given substring.
  # Usage: extract_href "needle"
  local needle="$1"
  printf "%s" "$html" \
    | rg -o "href=\"[^\"]+\"" \
    | sed -E 's/^href=\"(.*)\"$/\1/' \
    | rg -F "$needle" || true
}

download_one() {
  local href="$1"
  # Normalize to absolute URL.
  local url="$href"
  if [[ "$url" == /* ]]; then url="${BASE}${url}"; fi

  # Use a stable local filename from URL path.
  local name
  name="$(printf "%s" "$url" | sed -E 's@.*/@@' | tr ' ' '_' )"
  local out="$2/$name"
  local mapfile="$3"

  if [[ -s "$out" ]]; then
    echo "skip $out"
    printf "%s\t%s\n" "$name" "$url" >> "$mapfile"
    return 0
  fi

  echo "get  $url"
  curl -L -s --retry 3 --retry-delay 1 -A "PVRM-Indexer/1.0" "$url" -o "$out"
  printf "%s\t%s\n" "$name" "$url" >> "$mapfile"
}

echo "[1/2] Fetch physical (seed on TD page)..."
while IFS= read -r href; do
  [[ -n "$href" ]] || continue
  download_one "$href" "$OUT_PHY" "$tmp_phy"
done < <(extract_href "content_4804/" | rg -i "tvrm_auction_result_|TVRMs Auction Result Handout" || true)

echo "[2/2] Fetch e-auction (seed on TD page)..."
while IFS= read -r href; do
  [[ -n "$href" ]] || continue
  download_one "$href" "$OUT_EA" "$tmp_ea"
done < <(extract_href "E-Auction Result Handout" || true)

sort -u "$tmp_phy" > "$MAP_PHY"
sort -u "$tmp_ea" > "$MAP_EA"

echo "OK"
