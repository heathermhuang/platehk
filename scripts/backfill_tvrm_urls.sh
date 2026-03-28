#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

kind="${1:-}"
from_year="${2:-}"
to_year="${3:-}"

if [[ "$kind" != "physical" && "$kind" != "eauction" ]]; then
  echo "Usage: $0 physical|eauction FROM_YEAR TO_YEAR" >&2
  exit 2
fi
if [[ -z "$from_year" || -z "$to_year" ]]; then
  echo "Usage: $0 physical|eauction FROM_YEAR TO_YEAR" >&2
  exit 2
fi

out_dir="$ROOT_DIR/data/tvrm_${kind}"
mkdir -p "$out_dir"
master="$out_dir/urls.all.txt"
tmp_master="$(mktemp)"
trap 'rm -f "$tmp_master"' EXIT

touch "$master"

echo "Backfill: kind=$kind years=$from_year..$to_year"
for y in $(seq "$from_year" "$to_year"); do
  start="${y}-01-01"
  end="${y}-12-31"
  echo "== Discover $kind $start..$end"
  "$ROOT_DIR/scripts/discover_tvrm_urls.sh" "$kind" "$start" "$end" >/dev/null
  if [[ -f "$out_dir/urls.txt" ]]; then
    cat "$master" "$out_dir/urls.txt" | sort -u > "$tmp_master"
    mv "$tmp_master" "$master"
    echo "  master: $(wc -l < "$master" | tr -d ' ') URLs"
  fi
done

echo "Wrote: $master"
