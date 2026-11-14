"""Canonical auction outcomes; a positive amount alone never establishes a sale."""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

LABELS = {
    "sold": ("拍賣售出", "Auction sale"),
    "assigned_special_fee": ("特別費用分配（無人競投）", "Special-fee allocation (no bidder)"),
    "unsold": ("未售出（U/S）", "Unsold (U/S)"),
    "unknown": ("結果未核實", "Outcome unverified"),
}


def status(row: dict) -> str:
    value = row.get("result_status")
    if value == "special_fee":
        value = "assigned_special_fee"
    return value if value in LABELS else "unknown"


def outcome_label(row: dict, lang: str = "zh") -> str:
    return LABELS[status(row)][lang == "en"]


def amount_with_outcome(row: dict, lang: str = "zh") -> str:
    amount = row.get("amount_hkd")
    value = "—" if amount is None or status(row) == "unsold" else f"HK${int(amount):,}"
    return f"{value} · {outcome_label(row, lang)}"


def raw_status(row: dict) -> str:
    raw = re.sub(r"\s+", "", str(row.get("amount_raw") or ""))
    if raw.upper() == "U/S" and row.get("amount_hkd") is None:
        return "unsold"
    # Require the retained source token to agree with the parsed amount.
    if re.fullmatch(r"@?\$?\d[\d,]*@?", raw):
        digits = raw.replace("@", "").replace("$", "").replace(",", "")
        if int(digits) == row.get("amount_hkd"):
            return "assigned_special_fee" if "@" in raw else "sold"
    return status(row)


def identity(row: dict) -> tuple:
    mark = row.get("single_line") or "".join(row.get("double_line") or [])
    return row.get("auction_date"), re.sub(r"\s+", "", mark), row.get("amount_hkd")


def write_json(path: Path, value) -> None:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if not path.exists() or path.read_text(encoding="utf-8") != encoded:
        path.write_text(encoded, encoding="utf-8")


def enrich_sources(data: Path, rounds: list[dict]) -> dict:
    """Backfill retained evidence and verified handouts before deriving any view.

    Re-running is idempotent. Unreviewed records remain explicit unknowns. Only
    already-indexed rounds can gain omitted unsold rows from a verified handout.
    """
    counts = {}
    for dataset in ("pvrm", "tvrm_physical", "tvrm_eauction", "tvrm_legacy"):
        base = data if dataset == "pvrm" else data / dataset
        source = base / "results.slim.json"
        if not source.exists():
            continue
        rows = json.loads(source.read_text(encoding="utf-8"))
        raw_path = base / "results.json"
        raw_rows = json.loads(raw_path.read_text(encoding="utf-8")) if raw_path.exists() else []
        evidence = defaultdict(set)
        for row in raw_rows:
            value = raw_status(row)
            if value != "unknown":
                evidence[identity(row)].add(value)
        verified = {}
        dates = {row.get("auction_date") for row in rows}
        for auction in rounds:
            if auction["dataset"] != dataset or auction["start_date"] not in dates:
                continue
            indexed = {identity(row)[1]: row for row in rows if row.get("auction_date") == auction["start_date"]}
            for record in auction["rows"]:
                key = auction["start_date"], re.sub(r"\s+", "", record["mark"])
                verified[key] = record
                if key[1] not in indexed:
                    if record["status"] != "unsold":
                        raise ValueError(f"Verified priced mark missing from index: {auction['id']} {record['mark']}")
                    rows.append({"auction_date": auction["start_date"], "single_line": record["mark"],
                                 "double_line": None, "amount_hkd": None, "pdf_url": auction["source_url"],
                                 "page": record["page"]})
        for row in rows:
            key = identity(row)
            record = verified.get(key[:2])
            if record:
                if row.get("amount_hkd") != record["amount_hkd"]:
                    raise ValueError(f"Verified amount conflicts with index: {dataset} {key[:2]}")
                value = status({"result_status": record["status"]})
            else:
                candidates = evidence.get(key, set())
                if len(candidates) > 1:
                    raise ValueError(f"Conflicting source outcomes: {dataset} {key}")
                value = next(iter(candidates)) if candidates else raw_status(row)
            amount = row.get("amount_hkd")
            if value == "unsold" and amount is not None:
                raise ValueError(f"Unsold record has an amount: {dataset} {key}")
            if value in ("sold", "assigned_special_fee") and (type(amount) is not int or amount <= 0):
                raise ValueError(f"Priced outcome has no positive amount: {dataset} {key}")
            row["result_status"] = value
            row["result_text"] = LABELS[value][1]
        by_date = defaultdict(list)
        for row in rows:
            by_date[row["auction_date"]].append(row)
        write_json(source, rows)
        for day, issue_rows in by_date.items():
            write_json(base / "issues" / f"{day}.json", issue_rows)
        preset = sorted(rows, key=lambda r: (-(r["amount_hkd"] if r.get("amount_hkd") is not None else -1),
                                             r["auction_date"], r.get("single_line") or ""))[:1000]
        write_json(base / "preset.amount_desc.top1000.json", preset)
        manifest_path = base / "issues.manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["total_rows"] = len(rows)
        manifest["top_result_status"] = status(preset[0]) if preset else "unknown"
        for issue in manifest["issues"]:
            issue["count"] = len(by_date[issue["auction_date"]])
        write_json(manifest_path, manifest)
        counts[dataset] = dict(Counter(row["result_status"] for row in rows))
    return counts
