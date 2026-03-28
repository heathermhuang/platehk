#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

kind="${1:-}"
start="${2:-}"
end="${3:-}"
urls_file="${4:-}"
concurrency="${CONCURRENCY:-40}"

if [[ "$kind" != "physical" && "$kind" != "eauction" ]]; then
  echo "Usage: $0 physical|eauction [start_iso] [end_iso]" >&2
  exit 2
fi
if [[ -n "${urls_file:-}" && "$urls_file" != "--urls-file" ]]; then
  echo "Usage: $0 physical|eauction [start_iso] [end_iso] [--urls-file PATH]" >&2
  exit 2
fi
if [[ "${urls_file:-}" == "--urls-file" && -z "${5:-}" ]]; then
  echo "Usage: $0 physical|eauction [start_iso] [end_iso] [--urls-file PATH]" >&2
  exit 2
fi

out_dir="$ROOT_DIR/data/tvrm_${kind}"
mkdir -p "$out_dir"

urls_tmp="$(mktemp)"
found_tmp="$(mktemp)"
trap 'rm -f "$urls_tmp" "$found_tmp"' EXIT

if [[ "${urls_file:-}" == "--urls-file" ]]; then
  src="${5}"
  if [[ ! -f "$src" ]]; then
    echo "URLs file not found: $src" >&2
    exit 1
  fi
  cat "$src" > "$urls_tmp"
else
  if [[ "$kind" == "physical" ]]; then
    if [[ -n "${start}" || -n "${end}" ]]; then
      python3 "$ROOT_DIR/scripts/gen_tvrm_physical_candidates.py" ${start:+$start} ${end:+$end} > "$urls_tmp"
    else
      python3 "$ROOT_DIR/scripts/gen_tvrm_physical_candidates.py" > "$urls_tmp"
    fi
  else
    if [[ -n "${start}" || -n "${end}" ]]; then
      python3 "$ROOT_DIR/scripts/gen_tvrm_eauction_candidates.py" ${start:+$start} ${end:+$end} > "$urls_tmp"
    else
      python3 "$ROOT_DIR/scripts/gen_tvrm_eauction_candidates.py" > "$urls_tmp"
    fi
  fi
fi

total="$(wc -l < "$urls_tmp" | tr -d ' ')"
echo "Candidates: $total"

check_one() {
  local url="$1"

  # Range GET magic check: first 4 bytes should be %PDF
  #
  # This is intentionally the first (and only) network request. It's faster than HEAD
  # and avoids servers that return HTML error pages with a 200 status.
  local tmpbin
  tmpbin="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f \"$tmpbin\"" RETURN

  local magic
  curl -L -s --retry 2 --retry-delay 1 --connect-timeout 4 --max-time 8 -r 0-3 -o "$tmpbin" "$url" 2>/dev/null || return 1
  magic="$(xxd -p -l 4 "$tmpbin" 2>/dev/null | head -n 1 || true)"
  if [[ "$magic" == "25504446" ]]; then
    echo "$url"
    return 0
  fi
  return 1
}
export -f check_one

echo "Checking with concurrency=$concurrency ..."
# xargs: pass URL as $1 (use "_" as $0 placeholder)
cat "$urls_tmp" | xargs -n 1 -P "$concurrency" bash -lc 'check_one "$1"' _ >> "$found_tmp" || true

sort -u "$found_tmp" > "$out_dir/urls.txt"
echo "Found: $(wc -l < "$out_dir/urls.txt" | tr -d ' ')"
echo "Wrote: $out_dir/urls.txt"
