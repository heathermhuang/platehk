#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "server" / "dump.sql"


def _read_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def _sql_str(s: object) -> str:
    if s is None:
        return "NULL"
    t = str(s)
    t = t.replace("\\", "\\\\").replace("'", "''")
    return f"'{t}'"


def _sql_int(v: object) -> str:
    if v is None:
        return "NULL"
    try:
        return str(int(v))
    except Exception:
        return "NULL"


def _sql_sha1_bin(s: object) -> str:
    if s is None:
        return "NULL"
    raw = str(s)
    if not raw:
        return "NULL"
    h = hashlib.sha1(raw.encode("utf-8")).hexdigest()
    return f"UNHEX('{h}')"


def normalize_plate_for_search(s: str) -> str:
    s = (s or "").upper()
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"[^A-Z0-9]+", "", s)
    return s


def emit_dataset(dataset: str, base: Path, fp) -> None:
    auctions = _read_json(base / "auctions.json")
    rows = _read_json(base / "results.slim.json")

    # auctions
    fp.write(f"-- dataset={dataset} auctions\n")
    fp.write("INSERT INTO vrm_auction (dataset,auction_date,auction_date_label,session_label,is_lny,pdf_url,total_sale_proceeds_hkd,error_text) VALUES\n")
    vals = []
    for a in auctions:
        vals.append(
            "("
            + ",".join(
                [
                    _sql_str(dataset),
                    _sql_str(a.get("auction_date")),
                    _sql_str(a.get("auction_date_label") or None),
                    _sql_str(a.get("session") or None),
                    "1" if a.get("is_lny") else "0",
                    _sql_str(a.get("pdf_url") or None),
                    _sql_int(a.get("total_sale_proceeds_hkd")),
                    _sql_str(a.get("error") or None),
                ]
            )
            + ")"
        )
    fp.write(",\n".join(vals))
    fp.write(
        "\nON DUPLICATE KEY UPDATE auction_date_label=VALUES(auction_date_label),session_label=VALUES(session_label),is_lny=VALUES(is_lny),pdf_url=VALUES(pdf_url),total_sale_proceeds_hkd=VALUES(total_sale_proceeds_hkd),error_text=VALUES(error_text);\n\n"
    )

    # results
    fp.write(f"-- dataset={dataset} results\n")
    fp.write(
        "INSERT INTO vrm_result (dataset,auction_date,single_line,double_top,double_bottom,amount_hkd,pdf_url,pdf_url_hash,single_norm,double_norm) VALUES\n"
    )
    vals = []
    for r in rows:
        dl = r.get("double_line")
        top = bottom = None
        if isinstance(dl, list) and dl:
            top = dl[0] if len(dl) > 0 else ""
            bottom = dl[1] if len(dl) > 1 else ""
        single = r.get("single_line") or ""
        single_norm = normalize_plate_for_search(single)
        double_norm = None
        if top is not None or bottom is not None:
            double_norm = normalize_plate_for_search((top or "") + (bottom or ""))
        row_pdf = r.get("pdf_url") or None
        vals.append(
            "("
            + ",".join(
                [
                    _sql_str(dataset),
                    _sql_str(r.get("auction_date")),
                    _sql_str(single),
                    _sql_str(top),
                    _sql_str(bottom),
                    _sql_int(r.get("amount_hkd")),
                    _sql_str(row_pdf),
                    _sql_sha1_bin(row_pdf),
                    _sql_str(single_norm),
                    _sql_str(double_norm),
                ]
            )
            + ")"
        )

    # Chunk to avoid max_packet issues.
    CHUNK = 2000
    for i in range(0, len(vals), CHUNK):
        part = vals[i : i + CHUNK]
        fp.write(",\n".join(part))
        fp.write(
            "\nON DUPLICATE KEY UPDATE double_top=VALUES(double_top),double_bottom=VALUES(double_bottom),amount_hkd=VALUES(amount_hkd),pdf_url=VALUES(pdf_url),pdf_url_hash=VALUES(pdf_url_hash),single_norm=VALUES(single_norm),double_norm=VALUES(double_norm);\n"
        )
        fp.write("\n")


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as fp:
        fp.write("-- Generated SQL dump for MySQL import (phpMyAdmin friendly)\n")
        fp.write("SET NAMES utf8mb4;\n")
        fp.write("SET time_zone = '+00:00';\n\n")

        emit_dataset("pvrm", DATA, fp)
        emit_dataset("tvrm_physical", DATA / "tvrm_physical", fp)
        emit_dataset("tvrm_eauction", DATA / "tvrm_eauction", fp)
        emit_dataset("tvrm_legacy", DATA / "tvrm_legacy", fp)

    print(str(OUT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
