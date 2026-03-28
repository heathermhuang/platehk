#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def _read_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def _is_pdf_magic(p: Path) -> bool:
    try:
        with p.open("rb") as f:
            return f.read(4) == b"%PDF"
    except Exception:
        return False


def _filesize(p: Path) -> int:
    try:
        return p.stat().st_size
    except Exception:
        return 0


def _safe_local_path(p: Path) -> str:
    """
    Never leak absolute user paths (e.g. /Users/<name>/...) into a public artifact.
    Return a workspace-relative path when possible; else fall back to basename.
    """
    try:
        if not p:
            return ""
        pp = p
        if not pp.is_absolute():
            pp = (ROOT / pp).resolve()
        else:
            pp = pp.resolve()
        rel = pp.relative_to(ROOT.resolve())
        return str(rel).replace("\\", "/")
    except Exception:
        try:
            return p.name
        except Exception:
            return ""


def _compact_plate(s: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "", (s or "").upper())


def _pvrm_len_ok(plate: str) -> bool:
    # PVRM max 8 chars; spaces count as a char; no newlines in single_line.
    return 1 <= len(plate or "") <= 8


def _tvrm_plate_ok(plate: str) -> bool:
    s = (plate or "").strip().upper()
    if not s:
        return False
    if re.fullmatch(r"\d{1,4}", s):
        return True
    if re.fullmatch(r"[A-Z]{1,2}\s+\d{1,4}", s):
        return True
    return False


def _parse_sources_tsv(p: Path) -> dict[str, str]:
    # filename<TAB>url
    out: dict[str, str] = {}
    if not p.exists():
        return out
    for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        out[parts[1].strip()] = parts[0].strip()
    return out


def _url_basename(url: str) -> str:
    try:
        path = urlsplit(url).path
        name = Path(path).name
        # For local-relative paths, keep raw name to match on-disk filenames (may contain %20).
        if path.startswith("/data/") or path.startswith("./data/") or path.startswith("data/"):
            return name
        return unquote(name)
    except Exception:
        return ""


def _resolve_local_source_path(base: Path, url: str, fallback_name: str) -> Path:
    raw = str(url or "").strip()
    if not raw:
        return Path("")
    decoded = unquote(raw)
    if raw.startswith("./"):
        return (ROOT / decoded[2:]).resolve()
    if raw.startswith("/data/"):
        return (ROOT / decoded.lstrip("/")).resolve()
    if raw.startswith("data/"):
        return (ROOT / decoded).resolve()
    return base / "pdfs" / fallback_name if fallback_name else Path("")


def _is_workbook_source(issue: dict, url: str) -> bool:
    source_format = str(issue.get("source_format") or "").lower()
    lowered = str(url or "").lower()
    return source_format in {"xls", "xlsx"} or lowered.endswith(".xls") or lowered.endswith(".xlsx")


@dataclass
class FileRow:
    dataset: str
    issue_date: str
    issue_label: str
    pdf_url: str
    pdf_title: str
    local_path: str
    local_name: str
    exists: bool
    pdf_ok: bool
    size: int
    issue_rows: int
    amount_missing: Optional[int]
    total_proceeds_hkd: Optional[int]
    is_lny: bool
    error: Optional[str]


def build() -> int:
    today = date.today().isoformat()
    files: list[dict] = []
    summary: dict[str, dict] = {}
    validation: dict[str, dict] = {}
    overlap_report = {}
    overlap_path = DATA / "all.tvrm_legacy_overlap.json"
    if overlap_path.exists():
        try:
            overlap_report = _read_json(overlap_path)
        except Exception:
            overlap_report = {}

    # --- PVRM ---
    pvrm_meta_p = DATA / "auctions.json"
    pvrm_rows_p = DATA / "results.slim.json"
    pvrm_meta = _read_json(pvrm_meta_p) if pvrm_meta_p.exists() else []
    pvrm_rows = _read_json(pvrm_rows_p) if pvrm_rows_p.exists() else []

    pvrm_issue_counts = {}
    for m in pvrm_meta:
        pvrm_issue_counts[m.get("auction_date")] = int(m.get("entry_count") or 0)
    pvrm_issue_sum: dict[str, int] = {}
    for r in pvrm_rows:
        d = str(r.get("auction_date") or "")
        if not d:
            continue
        a = r.get("amount_hkd")
        if isinstance(a, int):
            pvrm_issue_sum[d] = pvrm_issue_sum.get(d, 0) + a

    bad_len = 0
    bad_double_mismatch = 0
    null_amount_rows = 0
    for r in pvrm_rows:
        sl = r.get("single_line") or ""
        if not _pvrm_len_ok(sl):
            bad_len += 1
        dl = r.get("double_line")
        if dl:
            joined = "".join(dl)
            if _compact_plate(sl) != _compact_plate(joined):
                bad_double_mismatch += 1
        if r.get("amount_hkd") is None:
            null_amount_rows += 1

    validation["pvrm"] = {
        "rows_total": len(pvrm_rows),
        "pvrm_len_violations": bad_len,
        "double_line_mismatch": bad_double_mismatch,
        "null_amount_rows": null_amount_rows,
    }

    pvrm_ok = 0
    for m in pvrm_meta:
        pdf_local = Path(m.get("pdf_local") or "")
        exists = pdf_local.exists()
        pdf_ok = exists and _is_pdf_magic(pdf_local) and _filesize(pdf_local) > 1024
        if pdf_ok:
            pvrm_ok += 1

        total = m.get("total_sale_proceeds_hkd")
        if total is None:
            total = pvrm_issue_sum.get(str(m.get("auction_date") or ""))

        row = FileRow(
            dataset="pvrm",
            issue_date=str(m.get("auction_date") or ""),
            issue_label=str(m.get("auction_date_label") or ""),
            pdf_url=str(m.get("pdf_url") or ""),
            pdf_title=_url_basename(str(m.get("pdf_url") or "")),
            local_path=_safe_local_path(pdf_local),
            local_name=pdf_local.name if pdf_local else "",
            exists=exists,
            pdf_ok=pdf_ok,
            size=_filesize(pdf_local) if exists else 0,
            issue_rows=int(m.get("entry_count") or 0),
            amount_missing=int(m.get("amount_missing") or 0) if m.get("amount_missing") is not None else None,
            total_proceeds_hkd=total,
            is_lny=bool(m.get("is_lny")),
            error=m.get("error"),
        )
        files.append(row.__dict__)

    summary["pvrm"] = {
        "pdf_total": len(pvrm_meta),
        "pdf_ok": pvrm_ok,
        "issues_total": len(pvrm_issue_counts),
        "rows_total": len(pvrm_rows),
    }

    # --- TVRM datasets (parse from existing meta + sources.tsv) ---
    def audit_tvrm_dataset(key: str, base: Path) -> None:
        meta_p = base / "auctions.json"
        rows_p = base / "results.slim.json"
        sources_p = base / "sources.tsv"

        meta = _read_json(meta_p) if meta_p.exists() else []
        rows = _read_json(rows_p) if rows_p.exists() else []
        issue_sum: dict[str, int] = {}
        for r in rows:
            d = str(r.get("auction_date") or "")
            if not d:
                continue
            a = r.get("amount_hkd")
            if isinstance(a, int):
                issue_sum[d] = issue_sum.get(d, 0) + a

        url_to_fname = _parse_sources_tsv(sources_p)  # url -> local filename
        ok = 0
        pdf_total = 0
        for issue in meta:
            issue_date = str(issue.get("auction_date") or "")
            issue_label = str(issue.get("auction_date_label") or "")
            issue_rows = int(issue.get("entry_count") or 0)
            is_lny = bool(issue.get("is_lny"))
            total = issue.get("total_sale_proceeds_hkd")
            if total is None:
                total = issue_sum.get(issue_date)
            error = issue.get("error")
            pdf_urls = issue.get("pdf_urls") or []
            if not isinstance(pdf_urls, list) or not pdf_urls:
                pdf_urls = [issue.get("pdf_url")] if issue.get("pdf_url") else []

            for u in pdf_urls:
                url = str(u or "")
                if not url:
                    continue
                pdf_total += 1
                fname = url_to_fname.get(url) or _url_basename(url)
                pdf_local = _resolve_local_source_path(base, url, fname)
                exists = pdf_local.exists()
                if _is_workbook_source(issue, url):
                    pdf_ok = exists and _filesize(pdf_local) > 1024
                else:
                    pdf_ok = exists and _is_pdf_magic(pdf_local) and _filesize(pdf_local) > 1024
                if pdf_ok:
                    ok += 1
                files.append(
                    FileRow(
                        dataset=key,
                        issue_date=issue_date,
                        issue_label=issue_label,
                        pdf_url=url,
                        pdf_title=_url_basename(url),
                        local_path=_safe_local_path(pdf_local),
                        local_name=pdf_local.name if fname else "",
                        exists=exists,
                        pdf_ok=pdf_ok,
                        size=_filesize(pdf_local) if exists else 0,
                        issue_rows=issue_rows,
                        amount_missing=None,
                        total_proceeds_hkd=total,
                        is_lny=is_lny,
                        error=error,
                    ).__dict__
                )

        # validation
        bad_plate = 0
        null_amount_rows = 0
        for r in rows:
            sl = r.get("single_line") or ""
            if not _tvrm_plate_ok(sl):
                bad_plate += 1
            if r.get("amount_hkd") is None:
                null_amount_rows += 1
        validation[key] = {
            "rows_total": len(rows),
            "plate_format_violations": bad_plate,
            "null_amount_rows": null_amount_rows,
            "issues_with_errors": sum(1 for x in meta if x.get("error")),
        }
        if key == "tvrm_legacy":
            validation[key]["overlap_rows_hidden_in_all"] = int(overlap_report.get("rows_to_drop") or 0)

        summary[key] = {
            "pdf_total": pdf_total,
            "pdf_ok": ok,
            "issues_total": len(meta),
            "rows_total": len(rows),
        }

    audit_tvrm_dataset("tvrm_physical", DATA / "tvrm_physical")
    audit_tvrm_dataset("tvrm_eauction", DATA / "tvrm_eauction")
    audit_tvrm_dataset("tvrm_legacy", DATA / "tvrm_legacy")

    out = {
        "generated_at": today,
        "summary": summary,
        "validation": validation,
        "files": files,
    }
    (DATA / "audit.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
