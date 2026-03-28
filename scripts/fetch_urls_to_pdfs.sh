#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

kind="${1:-}"
if [[ "$kind" != "tvrm_physical" && "$kind" != "tvrm_eauction" ]]; then
  echo "Usage: $0 tvrm_physical|tvrm_eauction" >&2
  exit 2
fi

base="$ROOT_DIR/data/$kind"
urls="$base/urls.txt"
pdf_dir="$base/pdfs"
map_tsv="$base/sources.tsv"

if [[ ! -f "$urls" ]]; then
  echo "Missing $urls. Run scripts/discover_tvrm_urls.sh first." >&2
  exit 2
fi

mkdir -p "$pdf_dir"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

> "$tmp"

i=0
total="$(wc -l < "$urls" | tr -d ' ')"
while IFS= read -r url; do
  [[ -n "$url" ]] || continue
  i=$((i+1))

  name="$(printf "%s" "$url" | sed -E 's@.*/@@' | tr ' ' '_' )"
  out="$pdf_dir/$name"

  if [[ -s "$out" ]]; then
    printf "%s\t%s\n" "$name" "$url" >> "$tmp"
    continue
  fi

  echo "[$i/$total] $name"
  curl -L -s --retry 3 --retry-delay 1 "$url" -o "$out"
  printf "%s\t%s\n" "$name" "$url" >> "$tmp"
done < "$urls"

sort -u "$tmp" > "$map_tsv"
echo "Wrote: $map_tsv"

