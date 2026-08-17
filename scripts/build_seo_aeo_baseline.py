#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROMPTS = ROOT / "config" / "seo-aeo-prompts.json"
DEFAULT_INPUT_DIR = ROOT / ".private" / "seo-aeo"
REQUIRED_PLATFORMS = ("chatgpt", "claude", "gemini", "perplexity")
AUDIT_EVIDENCE_SCHEMA_VERSION = 1
PLATFORM_LABELS = {
    "chatgpt": "ChatGPT",
    "claude": "Claude",
    "gemini": "Gemini",
    "perplexity": "Perplexity",
}
AUDIT_BOOLEAN_FIELDS = (
    "brand_cited",
    "platehk_url_cited",
    "answer_accurate",
    "competitor_cited",
)
AUDIT_COLUMNS = (
    "audit_date",
    "platform",
    "prompt_id",
    "language",
    "category",
    "prompt",
    "run_id",
    "observed_prompt",
    "evidence_path",
    "evidence_sha256",
    "model_or_surface",
    "web_search_enabled",
    *AUDIT_BOOLEAN_FIELDS,
    "cited_domains",
    "answer_summary",
    "notes",
)
QUERY_COLUMNS = ("query", "clicks", "impressions", "ctr", "position")
QUERY_ALIASES = {
    "query": ("query", "top_queries", "search_query", "keyword", "keywords"),
    "clicks": ("clicks", "click"),
    "impressions": ("impressions", "impression"),
    "ctr": ("ctr", "click_through_rate"),
    "position": ("position", "average_position", "avg_position"),
}
CWV_STATUSES = {"good", "needs_improvement", "poor", "not_enough_data"}
MANUAL_ACTION_STATUSES = {"none", "detected"}
BRAND_QUERY_RE = re.compile(r"(?<![a-z0-9])(?:plate\s*\.?\s*hk|platehk)(?![a-z0-9])", re.IGNORECASE)
FIX_BY_CATEGORY = {
    "aggregate-answer": "Strengthen source-linked aggregate answers and make every highlighted result independently verifiable.",
    "api-access": "Clarify the public JSON/API entry points and the boundary between Plate.hk and official government services.",
    "data-freshness": "Expose a dated coverage statement and a direct path to the latest official source documents.",
    "dataset-definition": "Strengthen the bilingual PVRM, TVRM, E-Auction, and physical-auction definitions on the methodology surface.",
    "historical-coverage": "Clarify workbook-backed legacy coverage and its limits without implying PDF provenance for every row.",
    "limitations": "Put concise no-valuation, no-ownership, and no-availability answers beside relevant historical records.",
    "plate-record": "Improve the plate-specific direct answer, official source link, and citation-ready facts for the lost prompt.",
    "plate-search": "Make the historical plate-search entry point and its ownership/availability limitations explicit.",
    "source-verification": "Strengthen citation guidance and direct Transport Department source paths on the methodology and plate pages.",
}


class BaselineError(ValueError):
    pass


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _normalise_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lstrip("\ufeff").strip().lower()).strip("_")


def _parse_float(value: Any, *, field: str) -> float:
    text = str(value or "").strip().replace(",", "")
    if not text:
        raise BaselineError(f"Missing number for {field}")
    if text.endswith("%"):
        text = text[:-1]
    try:
        return float(text)
    except ValueError as exc:
        raise BaselineError(f"Invalid number for {field}: {value!r}") from exc


def _parse_bool(value: Any, *, field: str) -> bool | None:
    text = str(value or "").strip().lower()
    if not text:
        return None
    if text in {"1", "true", "yes", "y"}:
        return True
    if text in {"0", "false", "no", "n"}:
        return False
    raise BaselineError(f"Invalid boolean for {field}: {value!r}; use yes/no or true/false")


def _rate(numerator: int, denominator: int) -> float | None:
    if not denominator:
        return None
    return round((numerator / denominator) * 100, 1)


def _is_iso_date(value: Any) -> bool:
    text = str(value or "").strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return False
    try:
        date.fromisoformat(text)
    except ValueError:
        return False
    return True


def _parse_iso_datetime(value: Any, *, field: str) -> datetime:
    text = str(value or "").strip()
    if not text:
        raise BaselineError(f"Missing timestamp for {field}")
    candidate = text[:-1] + "+00:00" if text.endswith("Z") else text
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise BaselineError(f"Invalid ISO-8601 timestamp for {field}: {value!r}") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise BaselineError(f"Timestamp for {field} must include a timezone: {value!r}")
    return parsed


def _load_audit_evidence(
    audit_path: Path,
    raw: dict[str, Any],
    *,
    line_number: int,
    platform: str,
    prompt_id: str,
    prompt: dict[str, Any],
    model_or_surface: str,
    web_search_enabled: bool,
) -> dict[str, Any]:
    field_prefix = f"AI audit line {line_number}"
    run_id = str(raw.get("run_id") or "").strip()
    observed_prompt = str(raw.get("observed_prompt") or "").strip()
    evidence_value = str(raw.get("evidence_path") or "").strip()
    expected_sha256 = str(raw.get("evidence_sha256") or "").strip().lower()
    if not run_id:
        raise BaselineError(f"{field_prefix} needs a run_id")
    if observed_prompt != str(prompt["prompt"]):
        raise BaselineError(f"{field_prefix} observed_prompt does not match prompt config")
    if not evidence_value:
        raise BaselineError(f"{field_prefix} needs an evidence_path")
    relative_path = Path(evidence_value)
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise BaselineError(f"{field_prefix} evidence_path must stay inside the private input directory")
    input_dir = audit_path.parent.resolve()
    evidence_path = (input_dir / relative_path).resolve()
    if not evidence_path.is_relative_to(input_dir) or not evidence_path.is_file():
        raise BaselineError(f"{field_prefix} evidence_path is missing or outside the private input directory")
    if not re.fullmatch(r"[0-9a-f]{64}", expected_sha256):
        raise BaselineError(f"{field_prefix} needs a 64-character evidence_sha256")
    evidence_bytes = evidence_path.read_bytes()
    actual_sha256 = hashlib.sha256(evidence_bytes).hexdigest()
    if actual_sha256 != expected_sha256:
        raise BaselineError(f"{field_prefix} evidence_sha256 does not match {evidence_value}")
    try:
        evidence = json.loads(evidence_bytes)
    except json.JSONDecodeError as exc:
        raise BaselineError(f"{field_prefix} evidence file is not valid JSON: {evidence_value}") from exc
    if not isinstance(evidence, dict) or evidence.get("schema_version") != AUDIT_EVIDENCE_SCHEMA_VERSION:
        raise BaselineError(
            f"{field_prefix} evidence must use schema_version {AUDIT_EVIDENCE_SCHEMA_VERSION}"
        )
    expected_identity = {
        "run_id": run_id,
        "platform": platform,
        "prompt_id": prompt_id,
        "observed_prompt": str(prompt["prompt"]),
        "model_or_surface": model_or_surface,
        "web_search_enabled": web_search_enabled,
    }
    for field, expected_value in expected_identity.items():
        if evidence.get(field) != expected_value:
            raise BaselineError(f"{field_prefix} evidence {field} does not match the audit row")
    _parse_iso_datetime(evidence.get("captured_at"), field=f"{field_prefix} evidence captured_at")
    if not str(evidence.get("verbatim_answer") or "").strip():
        raise BaselineError(f"{field_prefix} evidence needs a non-empty verbatim_answer")
    cited_urls = evidence.get("cited_urls", [])
    screenshot_paths = evidence.get("screenshot_paths", [])
    if not isinstance(cited_urls, list) or not all(isinstance(item, str) for item in cited_urls):
        raise BaselineError(f"{field_prefix} evidence cited_urls must be a string list")
    if not isinstance(screenshot_paths, list) or not all(isinstance(item, str) for item in screenshot_paths):
        raise BaselineError(f"{field_prefix} evidence screenshot_paths must be a string list")
    for cited_url in cited_urls:
        parsed_url = urlparse(cited_url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise BaselineError(f"{field_prefix} evidence contains an invalid cited URL")
    conversation_url = str(evidence.get("conversation_url") or "").strip()
    if conversation_url:
        parsed_url = urlparse(conversation_url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise BaselineError(f"{field_prefix} evidence conversation_url must be HTTP(S)")
    for screenshot_value in screenshot_paths:
        screenshot_relative = Path(screenshot_value)
        if screenshot_relative.is_absolute() or ".." in screenshot_relative.parts:
            raise BaselineError(f"{field_prefix} evidence screenshot path must stay inside the private input directory")
        screenshot_path = (input_dir / screenshot_relative).resolve()
        if not screenshot_path.is_relative_to(input_dir) or not screenshot_path.is_file():
            raise BaselineError(f"{field_prefix} evidence screenshot path is missing or outside the private input directory")
    if not conversation_url and not screenshot_paths:
        raise BaselineError(f"{field_prefix} evidence needs a conversation_url or screenshot")
    return {
        "run_id": run_id,
        "observed_prompt": observed_prompt,
        "evidence_path": relative_path.as_posix(),
        "evidence_sha256": actual_sha256,
        "captured_at": str(evidence["captured_at"]),
    }


def _prompt_corpus_sha256(config: dict[str, Any]) -> str:
    encoded = json.dumps(config, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _markdown(value: Any) -> str:
    text = html.escape(str(value if value is not None else "—").replace("\n", " "), quote=False)
    text = text.replace("\\", "\\\\")
    for character in ("`", "*", "_", "[", "]", "|"):
        text = text.replace(character, f"\\{character}")
    return text


def _metric(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.1f}"
    return str(value)


def _percent_metric(value: Any) -> str:
    return "—" if value is None else f"{_metric(value)}%"


def _yes_no(value: Any) -> str:
    if value is True:
        return "Yes"
    if value is False:
        return "No"
    return "—"


def load_prompt_config(path: Path) -> dict[str, Any]:
    payload = load_json(path)
    if not isinstance(payload, dict) or payload.get("schema_version") != 1:
        raise BaselineError("Prompt config must be an object with schema_version 1")
    if not str(payload.get("corpus_version") or "").strip():
        raise BaselineError("Prompt config must include a non-empty corpus_version")

    platforms = tuple(str(item).strip().lower() for item in payload.get("platforms") or [])
    if platforms != REQUIRED_PLATFORMS:
        raise BaselineError(f"Prompt config platforms must be {', '.join(REQUIRED_PLATFORMS)} in that order")

    prompts = payload.get("prompts") or []
    if not isinstance(prompts, list) or not 20 <= len(prompts) <= 40:
        raise BaselineError("Prompt config must contain between 20 and 40 prompts")

    seen_ids: set[str] = set()
    pairs: dict[str, set[str]] = defaultdict(set)
    for index, item in enumerate(prompts, start=1):
        if not isinstance(item, dict):
            raise BaselineError(f"Prompt {index} must be an object")
        prompt_id = str(item.get("id") or "").strip()
        pair_id = str(item.get("pair_id") or "").strip()
        language = str(item.get("language") or "").strip()
        category = str(item.get("category") or "").strip()
        prompt = str(item.get("prompt") or "").strip()
        target_url = str(item.get("target_url") or "").strip()
        priority = item.get("priority")
        if not prompt_id or prompt_id in seen_ids:
            raise BaselineError(f"Prompt IDs must be unique and non-empty: {prompt_id!r}")
        if language not in {"zh-HK", "en"}:
            raise BaselineError(f"Prompt {prompt_id} has unsupported language {language!r}")
        if not pair_id or not category or not prompt:
            raise BaselineError(f"Prompt {prompt_id} is missing pair_id, category, or prompt text")
        if not isinstance(priority, int) or priority not in {1, 2, 3}:
            raise BaselineError(f"Prompt {prompt_id} priority must be 1, 2, or 3")
        if not target_url.startswith("https://plate.hk/"):
            raise BaselineError(f"Prompt {prompt_id} target_url must use https://plate.hk/")
        checks = item.get("accuracy_checks") or []
        if not isinstance(checks, list) or not checks or not all(str(check).strip() for check in checks):
            raise BaselineError(f"Prompt {prompt_id} needs at least one accuracy check")
        seen_ids.add(prompt_id)
        pairs[pair_id].add(language)

    invalid_pairs = sorted(pair_id for pair_id, languages in pairs.items() if languages != {"zh-HK", "en"})
    if invalid_pairs:
        raise BaselineError("Every prompt pair must contain zh-HK and en variants: " + ", ".join(invalid_pairs))
    return payload


def _site_metrics_template() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "snapshot_date": None,
        "search_window": {"start_date": None, "end_date": None},
        "google_search_console": {
            "property": "",
            "property_verified": None,
            "sitemap_submitted": None,
            "submitted_urls": None,
            "indexed_urls": None,
            "manual_actions": "unknown",
            "core_web_vitals": {
                "mobile": {"lcp": None, "inp": None, "cls": None},
                "desktop": {"lcp": None, "inp": None, "cls": None},
            },
        },
        "bing_webmaster_tools": {
            "site_verified": None,
            "sitemap_submitted": None,
            "submitted_urls": None,
            "indexed_urls": None,
        },
        "notes": [],
    }


def initialise_ai_audit(
    path: Path,
    config: dict[str, Any],
    *,
    platforms: list[str] | tuple[str, ...] | None = None,
    prompt_ids: list[str] | tuple[str, ...] | None = None,
) -> Path:
    if path.exists():
        raise BaselineError(f"Refusing to overwrite existing AI audit input: {path}")
    selected_platforms = list(platforms or config["platforms"])
    selected_prompt_ids = list(prompt_ids or [item["id"] for item in config["prompts"]])
    unknown_platforms = sorted(set(selected_platforms) - set(config["platforms"]))
    unknown_prompts = sorted(set(selected_prompt_ids) - {item["id"] for item in config["prompts"]})
    if unknown_platforms:
        raise BaselineError("Unknown audit platforms: " + ", ".join(unknown_platforms))
    if unknown_prompts:
        raise BaselineError("Unknown audit prompt IDs: " + ", ".join(unknown_prompts))
    if len(selected_platforms) != len(set(selected_platforms)) or len(selected_prompt_ids) != len(set(selected_prompt_ids)):
        raise BaselineError("Audit matrix selections must not contain duplicates")

    path.parent.mkdir(parents=True, exist_ok=True)
    prompt_by_id = {item["id"]: item for item in config["prompts"]}
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=AUDIT_COLUMNS)
        writer.writeheader()
        for platform in selected_platforms:
            for prompt_id in selected_prompt_ids:
                prompt = prompt_by_id[prompt_id]
                writer.writerow(
                    {
                        "audit_date": "",
                        "platform": platform,
                        "prompt_id": prompt_id,
                        "language": prompt["language"],
                        "category": prompt["category"],
                        "prompt": prompt["prompt"],
                        "run_id": "",
                        "observed_prompt": "",
                        "evidence_path": "",
                        "evidence_sha256": "",
                        "model_or_surface": "",
                        "web_search_enabled": "",
                        "brand_cited": "",
                        "platehk_url_cited": "",
                        "answer_accurate": "",
                        "competitor_cited": "",
                        "cited_domains": "",
                        "answer_summary": "",
                        "notes": "",
                    }
                )
    return path


def initialise_inputs(output_dir: Path, config: dict[str, Any]) -> list[Path]:
    targets = [
        output_dir / "ai-audit.csv",
        output_dir / "gsc-queries.csv",
        output_dir / "bing-queries.csv",
        output_dir / "site-metrics.json",
    ]
    existing = [path for path in targets if path.exists()]
    if existing:
        raise BaselineError("Refusing to overwrite existing baseline inputs: " + ", ".join(str(path) for path in existing))

    output_dir.mkdir(parents=True, exist_ok=True)
    initialise_ai_audit(output_dir / "ai-audit.csv", config)

    for filename in ("gsc-queries.csv", "bing-queries.csv"):
        with (output_dir / filename).open("w", encoding="utf-8", newline="") as handle:
            csv.writer(handle).writerow(QUERY_COLUMNS)

    (output_dir / "site-metrics.json").write_text(
        json.dumps(_site_metrics_template(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return targets


def load_ai_audit(path: Path, config: dict[str, Any]) -> dict[str, Any]:
    prompts = {item["id"]: item for item in config["prompts"]}
    expected = {(platform, prompt_id) for platform in config["platforms"] for prompt_id in prompts}
    if not path.exists():
        return {"present": False, "rows": [], "evidence_rows": [], "missing": sorted(expected), "partial": []}

    completed: list[dict[str, Any]] = []
    validated_evidence: list[dict[str, Any]] = []
    partial: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    seen_run_ids: set[str] = set()
    seen_evidence_paths: set[str] = set()
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise BaselineError(f"AI audit CSV has no header: {path}")
        missing_columns = [column for column in AUDIT_COLUMNS if column not in reader.fieldnames]
        if missing_columns:
            raise BaselineError("AI audit CSV is missing columns: " + ", ".join(missing_columns))
        for line_number, raw in enumerate(reader, start=2):
            if not any(str(value or "").strip() for value in raw.values()):
                continue
            platform = str(raw.get("platform") or "").strip().lower()
            prompt_id = str(raw.get("prompt_id") or "").strip()
            key = (platform, prompt_id)
            if platform not in REQUIRED_PLATFORMS:
                raise BaselineError(f"AI audit line {line_number} has unknown platform {platform!r}")
            if prompt_id not in prompts:
                raise BaselineError(f"AI audit line {line_number} has unknown prompt_id {prompt_id!r}")
            if key in seen:
                raise BaselineError(f"AI audit contains duplicate platform/prompt row: {platform}/{prompt_id}")
            seen.add(key)

            prompt = prompts[prompt_id]
            for field in ("language", "category", "prompt"):
                supplied = str(raw.get(field) or "").strip()
                if supplied != str(prompt[field]):
                    raise BaselineError(f"AI audit line {line_number} {field} does not match prompt config")

            booleans = {
                field: _parse_bool(raw.get(field), field=f"line {line_number} {field}")
                for field in AUDIT_BOOLEAN_FIELDS
            }
            has_any_score = any(value is not None for value in booleans.values())
            has_all_scores = all(value is not None for value in booleans.values())
            audit_date = str(raw.get("audit_date") or "").strip()
            model_or_surface = str(raw.get("model_or_surface") or "").strip()
            web_search_enabled = _parse_bool(
                raw.get("web_search_enabled"), field=f"line {line_number} web_search_enabled"
            )
            if has_any_score != has_all_scores:
                raise BaselineError(f"AI audit line {line_number} must fill all four yes/no score fields")
            if has_all_scores and not _is_iso_date(audit_date):
                raise BaselineError(f"AI audit line {line_number} needs a valid audit_date in YYYY-MM-DD format")
            if has_all_scores and (not model_or_surface or web_search_enabled is None):
                raise BaselineError(
                    f"AI audit line {line_number} needs model_or_surface and web_search_enabled when scored"
                )
            evidence_markers = (
                str(raw.get("run_id") or "").strip(),
                str(raw.get("observed_prompt") or "").strip(),
                str(raw.get("evidence_path") or "").strip(),
                str(raw.get("evidence_sha256") or "").strip(),
                model_or_surface,
                str(raw.get("web_search_enabled") or "").strip(),
            )
            has_evidence_marker = any(evidence_markers)
            evidence: dict[str, Any] | None = None
            if has_evidence_marker or has_all_scores:
                if not model_or_surface or web_search_enabled is None:
                    raise BaselineError(
                        f"AI audit line {line_number} needs model_or_surface and web_search_enabled with evidence"
                    )
                declared_run_id = str(raw.get("run_id") or "").strip()
                declared_evidence_path = Path(str(raw.get("evidence_path") or "").strip()).as_posix()
                if declared_run_id and declared_run_id in seen_run_ids:
                    raise BaselineError(f"AI audit reuses run_id {declared_run_id!r}")
                if declared_evidence_path not in {"", "."} and declared_evidence_path in seen_evidence_paths:
                    raise BaselineError(f"AI audit reuses evidence_path {declared_evidence_path!r}")
                evidence = _load_audit_evidence(
                    path,
                    raw,
                    line_number=line_number,
                    platform=platform,
                    prompt_id=prompt_id,
                    prompt=prompt,
                    model_or_surface=model_or_surface,
                    web_search_enabled=bool(web_search_enabled),
                )
                seen_run_ids.add(evidence["run_id"])
                seen_evidence_paths.add(evidence["evidence_path"])
                validated_evidence.append({"platform": platform, "prompt_id": prompt_id, **evidence})
            if not has_all_scores:
                partial.append(key)
                continue
            if not str(raw.get("answer_summary") or "").strip():
                raise BaselineError(f"AI audit line {line_number} needs an answer_summary when scored")
            if booleans["platehk_url_cited"] and not booleans["brand_cited"]:
                raise BaselineError(f"AI audit line {line_number} cannot cite a Plate.hk URL while brand_cited is no")
            if evidence is None:
                raise BaselineError(f"AI audit line {line_number} needs retrievable evidence when scored")
            completed.append(
                {
                    "audit_date": audit_date,
                    "platform": platform,
                    "prompt_id": prompt_id,
                    "language": prompt["language"],
                    "category": prompt["category"],
                    "priority": prompt["priority"],
                    "prompt": prompt["prompt"],
                    "target_url": prompt["target_url"],
                    "model_or_surface": model_or_surface,
                    "web_search_enabled": web_search_enabled,
                    **evidence,
                    **booleans,
                    "cited_domains": str(raw.get("cited_domains") or "").strip(),
                    "answer_summary": str(raw.get("answer_summary") or "").strip(),
                    "notes": str(raw.get("notes") or "").strip(),
                }
            )

    completed_keys = {(row["platform"], row["prompt_id"]) for row in completed}
    return {
        "present": True,
        "rows": completed,
        "evidence_rows": validated_evidence,
        "missing": sorted(expected - completed_keys),
        "partial": sorted(partial),
    }


def _find_columns(fieldnames: list[str], *, source: str) -> dict[str, str]:
    normalised = {_normalise_header(name): name for name in fieldnames}
    columns: dict[str, str] = {}
    for field, aliases in QUERY_ALIASES.items():
        match = next((normalised[alias] for alias in aliases if alias in normalised), None)
        if match is None and field != "ctr":
            raise BaselineError(f"{source} query export is missing a {field} column")
        if match is not None:
            columns[field] = match
    return columns


def load_query_export(path: Path, *, source: str) -> dict[str, Any]:
    if not path.exists():
        return {"present": False, "rows": [], "path": str(path)}
    rows: list[dict[str, Any]] = []
    seen_queries: set[str] = set()
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise BaselineError(f"{source} query export has no header: {path}")
        columns = _find_columns(reader.fieldnames, source=source)
        for line_number, raw in enumerate(reader, start=2):
            query = str(raw.get(columns["query"]) or "").strip()
            if not query:
                continue
            query_key = query.casefold()
            if query_key in seen_queries:
                raise BaselineError(f"{source} query export contains duplicate query {query!r}")
            seen_queries.add(query_key)
            clicks = _parse_float(raw.get(columns["clicks"]), field=f"{source} line {line_number} clicks")
            impressions = _parse_float(
                raw.get(columns["impressions"]), field=f"{source} line {line_number} impressions"
            )
            position = _parse_float(raw.get(columns["position"]), field=f"{source} line {line_number} position")
            if clicks < 0 or not clicks.is_integer():
                raise BaselineError(f"{source} line {line_number} clicks must be a non-negative integer")
            if impressions < 0 or not impressions.is_integer():
                raise BaselineError(f"{source} line {line_number} impressions must be a non-negative integer")
            if clicks > impressions:
                raise BaselineError(f"{source} line {line_number} clicks cannot exceed impressions")
            if position < 0:
                raise BaselineError(f"{source} line {line_number} position cannot be negative")
            rows.append(
                {
                    "query": query,
                    "clicks": int(clicks),
                    "impressions": int(impressions),
                    "position": position,
                }
            )
    return {"present": True, "rows": rows, "path": str(path)}


def summarise_search_export(export: dict[str, Any]) -> dict[str, Any]:
    rows = export["rows"]
    clicks = sum(int(row["clicks"]) for row in rows)
    impressions = sum(int(row["impressions"]) for row in rows)
    weighted_position = sum(float(row["position"]) * int(row["impressions"]) for row in rows)
    branded = [row for row in rows if BRAND_QUERY_RE.search(str(row["query"]))]
    nonbranded = [row for row in rows if row not in branded]
    opportunities = [
        row
        for row in nonbranded
        if 4 <= float(row["position"]) <= 20 and int(row["impressions"]) >= 10
    ]
    opportunities.sort(key=lambda row: (-int(row["impressions"]), float(row["position"]), str(row["query"])))
    return {
        "present": bool(export["present"]),
        "query_count": len(rows),
        "clicks": clicks,
        "impressions": impressions,
        "ctr_percent": _rate(clicks, impressions),
        "average_position": round(weighted_position / impressions, 1) if impressions else None,
        "branded_queries": len(branded),
        "nonbranded_queries": len(nonbranded),
        "opportunities": opportunities[:20],
    }


def load_site_metrics(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    value = load_json(path)
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise BaselineError("site-metrics.json must be an object with schema_version 1")
    return value


def _nested(value: dict[str, Any], *path: str) -> Any:
    current: Any = value
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def site_metric_gaps(metrics: dict[str, Any] | None) -> list[str]:
    if metrics is None:
        return ["site-metrics.json is missing"]
    gaps: list[str] = []
    if not _is_iso_date(metrics.get("snapshot_date")):
        gaps.append("site metrics snapshot_date")
    start_date = _nested(metrics, "search_window", "start_date")
    end_date = _nested(metrics, "search_window", "end_date")
    if not _is_iso_date(start_date):
        gaps.append("search_window.start_date")
    if not _is_iso_date(end_date):
        gaps.append("search_window.end_date")
    if _is_iso_date(start_date) and _is_iso_date(end_date) and str(start_date) > str(end_date):
        gaps.append("search_window start_date must not be after end_date")
    if _is_iso_date(end_date) and _is_iso_date(metrics.get("snapshot_date")) and str(end_date) > str(metrics["snapshot_date"]):
        gaps.append("search_window end_date must not be after snapshot_date")
    if not str(_nested(metrics, "google_search_console", "property") or "").strip():
        gaps.append("google_search_console.property")
    required_booleans = (
        ("google_search_console", "property_verified"),
        ("google_search_console", "sitemap_submitted"),
        ("bing_webmaster_tools", "site_verified"),
        ("bing_webmaster_tools", "sitemap_submitted"),
    )
    for path in required_booleans:
        if not isinstance(_nested(metrics, *path), bool):
            gaps.append(".".join(path))
    required_counts = (
        ("google_search_console", "submitted_urls"),
        ("google_search_console", "indexed_urls"),
        ("bing_webmaster_tools", "submitted_urls"),
        ("bing_webmaster_tools", "indexed_urls"),
    )
    for path in required_counts:
        value = _nested(metrics, *path)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            gaps.append(".".join(path))
    manual_actions = str(_nested(metrics, "google_search_console", "manual_actions") or "unknown").strip().lower()
    if manual_actions not in MANUAL_ACTION_STATUSES:
        gaps.append("google_search_console.manual_actions")
    for device in ("mobile", "desktop"):
        for metric in ("lcp", "inp", "cls"):
            status = _nested(metrics, "google_search_console", "core_web_vitals", device, metric)
            if status not in CWV_STATUSES:
                gaps.append(f"google_search_console.core_web_vitals.{device}.{metric}")
    return gaps


def summarise_ai(audit: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    rows = audit["rows"]
    by_platform: dict[str, dict[str, Any]] = {}
    for platform in config["platforms"]:
        platform_rows = [row for row in rows if row["platform"] == platform]
        brand_cited = sum(bool(row["brand_cited"]) for row in platform_rows)
        url_cited = sum(bool(row["platehk_url_cited"]) for row in platform_rows)
        accurate = sum(bool(row["answer_accurate"]) for row in platform_rows)
        competitor_cited = sum(bool(row["competitor_cited"]) for row in platform_rows)
        by_platform[platform] = {
            "tested": len(platform_rows),
            "expected": len(config["prompts"]),
            "models_or_surfaces": sorted({row["model_or_surface"] for row in platform_rows}),
            "web_search_enabled": sum(bool(row["web_search_enabled"]) for row in platform_rows),
            "brand_cited": brand_cited,
            "platehk_url_cited": url_cited,
            "accurate": accurate,
            "competitor_cited": competitor_cited,
            "citation_rate_percent": _rate(brand_cited, len(platform_rows)),
            "url_citation_rate_percent": _rate(url_cited, len(platform_rows)),
            "accuracy_rate_percent": _rate(accurate, len(platform_rows)),
        }

    lost: dict[str, dict[str, Any]] = {}
    for row in rows:
        if row["brand_cited"]:
            continue
        item = lost.setdefault(
            row["prompt_id"],
            {
                "prompt_id": row["prompt_id"],
                "language": row["language"],
                "category": row["category"],
                "priority": row["priority"],
                "prompt": row["prompt"],
                "target_url": row["target_url"],
                "platforms": [],
                "competitor_cited_count": 0,
            },
        )
        item["platforms"].append(row["platform"])
        item["competitor_cited_count"] += int(bool(row["competitor_cited"]))
    lost_prompts = sorted(
        lost.values(),
        key=lambda item: (int(item["priority"]), -len(item["platforms"]), -int(item["competitor_cited_count"]), item["prompt_id"]),
    )

    inaccurate: dict[str, dict[str, Any]] = {}
    for row in rows:
        if row["answer_accurate"]:
            continue
        item = inaccurate.setdefault(
            row["prompt_id"],
            {
                "prompt_id": row["prompt_id"],
                "language": row["language"],
                "category": row["category"],
                "priority": row["priority"],
                "prompt": row["prompt"],
                "target_url": row["target_url"],
                "platforms": [],
            },
        )
        item["platforms"].append(row["platform"])
    inaccurate_prompts = sorted(
        inaccurate.values(),
        key=lambda item: (int(item["priority"]), -len(item["platforms"]), item["prompt_id"]),
    )

    category_losses = Counter(row["category"] for row in rows if not row["brand_cited"])
    category_inaccuracies = Counter(row["category"] for row in rows if not row["answer_accurate"])
    gap_categories = set(category_losses) | set(category_inaccuracies)
    fix_pack = [
        {
            "priority": rank,
            "category": category,
            "lost_platform_prompt_cells": category_losses[category],
            "inaccurate_platform_prompt_cells": category_inaccuracies[category],
            "recommendation": FIX_BY_CATEGORY.get(category, f"Review lost prompts in {category} and strengthen the matching source-grounded answer."),
        }
        for rank, category in enumerate(
            sorted(
                gap_categories,
                key=lambda item: (-(category_losses[item] + category_inaccuracies[item]), item),
            ),
            start=1,
        )
    ]

    total = len(rows)
    brand_total = sum(bool(row["brand_cited"]) for row in rows)
    return {
        "expected_rows": len(config["prompts"]) * len(config["platforms"]),
        "tested_rows": total,
        "validated_evidence_rows": len(audit.get("evidence_rows", [])),
        "missing_rows": len(audit["missing"]),
        "citation_rate_percent": _rate(brand_total, total),
        "platforms_with_citations": sum(bool(item["brand_cited"]) for item in by_platform.values()),
        "platforms": by_platform,
        "lost_prompts": lost_prompts,
        "inaccurate_prompts": inaccurate_prompts,
        "fix_pack": fix_pack,
    }


def build_baseline(
    config: dict[str, Any],
    ai_audit: dict[str, Any],
    gsc_export: dict[str, Any],
    bing_export: dict[str, Any],
    site_metrics: dict[str, Any] | None,
) -> dict[str, Any]:
    gaps: list[str] = []
    if not ai_audit["present"]:
        gaps.append("AI audit CSV is missing")
    if ai_audit["missing"]:
        gaps.append(f"AI audit has {len(ai_audit['missing'])} untested platform/prompt rows")
    if not gsc_export["present"]:
        gaps.append("Google Search Console query export is missing")
    if not bing_export["present"]:
        gaps.append("Bing Webmaster Tools query export is missing")
    gaps.extend(site_metric_gaps(site_metrics))

    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "status": "complete" if not gaps else "incomplete",
        "brand": config["brand"],
        "prompt_corpus_version": config["corpus_version"],
        "prompt_corpus_sha256": _prompt_corpus_sha256(config),
        "prompt_count": len(config["prompts"]),
        "prompt_pair_count": len({item["pair_id"] for item in config["prompts"]}),
        "platforms": list(config["platforms"]),
        "evidence_gaps": gaps,
        "site_metrics": site_metrics,
        "search": {
            "google_search_console": summarise_search_export(gsc_export),
            "bing_webmaster_tools": summarise_search_export(bing_export),
        },
        "ai_citations": summarise_ai(ai_audit, config),
        "methodology": {
            "ai_results_are_point_in_time": True,
            "citation_outcomes_are_not_guaranteed": True,
            "audit_evidence_schema_version": AUDIT_EVIDENCE_SCHEMA_VERSION,
            "verbatim_private_evidence_required": True,
            "official_source_authority": config["brand"]["official_source_authority"],
        },
    }


def _index_coverage(metrics: dict[str, Any] | None, key: str) -> str:
    if metrics is None:
        return "—"
    section = metrics.get(key) or {}
    submitted = section.get("submitted_urls")
    indexed = section.get("indexed_urls")
    if not isinstance(submitted, int) or submitted <= 0 or not isinstance(indexed, int):
        return "—"
    return f"{indexed:,}/{submitted:,} ({_rate(indexed, submitted)}%)"


def render_markdown(baseline: dict[str, Any]) -> str:
    ai = baseline["ai_citations"]
    search = baseline["search"]
    site_metrics = baseline["site_metrics"] or {}
    lines = [
        "# Plate.hk SEO/AEO Baseline",
        "",
        f"Generated: `{baseline['generated_at']}`",
        f"Status: **{baseline['status'].upper()}**",
        "",
        "> AI answers and citations are non-deterministic point-in-time observations. This report measures signals; it does not guarantee future citations or rankings.",
        "",
        "## Evidence coverage",
        "",
        f"- Prompt corpus: {baseline['prompt_count']} bilingual prompt variants across {baseline['prompt_pair_count']} paired intents",
        f"- Prompt corpus version: `{baseline['prompt_corpus_version']}` (`{baseline['prompt_corpus_sha256'][:12]}`)",
        f"- Expected AI observations: {ai['expected_rows']}",
        f"- Completed AI observations: {ai['tested_rows']}/{ai['expected_rows']}",
        f"- Validated private evidence records: {ai['validated_evidence_rows']}/{ai['expected_rows']}",
        f"- Google Search Console export: {'present' if search['google_search_console']['present'] else 'missing'}",
        f"- Bing Webmaster Tools export: {'present' if search['bing_webmaster_tools']['present'] else 'missing'}",
        "",
        "## Search baseline",
        "",
        f"Search window: **{_metric(_nested(baseline['site_metrics'] or {}, 'search_window', 'start_date'))} through {_metric(_nested(baseline['site_metrics'] or {}, 'search_window', 'end_date'))}**",
        "",
        "| Source | Queries | Clicks | Impressions | CTR | Average position | Index coverage |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    source_rows = (
        ("Google Search Console", search["google_search_console"], "google_search_console"),
        ("Bing Webmaster Tools", search["bing_webmaster_tools"], "bing_webmaster_tools"),
    )
    for label, item, key in source_rows:
        lines.append(
            f"| {label} | {item['query_count']:,} | {item['clicks']:,} | {item['impressions']:,} | "
            f"{_percent_metric(item['ctr_percent'])} | {_metric(item['average_position'])} | {_index_coverage(baseline['site_metrics'], key)} |"
        )

    lines.extend(
        [
            "",
            "### Technical discovery status",
            "",
            "| Source | Site/property verified | Sitemap submitted | Manual actions |",
            "| --- | --- | --- | --- |",
            f"| Google Search Console | {_yes_no(_nested(site_metrics, 'google_search_console', 'property_verified'))} | "
            f"{_yes_no(_nested(site_metrics, 'google_search_console', 'sitemap_submitted'))} | "
            f"{_metric(_nested(site_metrics, 'google_search_console', 'manual_actions'))} |",
            f"| Bing Webmaster Tools | {_yes_no(_nested(site_metrics, 'bing_webmaster_tools', 'site_verified'))} | "
            f"{_yes_no(_nested(site_metrics, 'bing_webmaster_tools', 'sitemap_submitted'))} | — |",
            "",
            "| Core Web Vitals | LCP | INP | CLS |",
            "| --- | --- | --- | --- |",
        ]
    )
    for device in ("mobile", "desktop"):
        lines.append(
            f"| {device.title()} | {_metric(_nested(site_metrics, 'google_search_console', 'core_web_vitals', device, 'lcp'))} | "
            f"{_metric(_nested(site_metrics, 'google_search_console', 'core_web_vitals', device, 'inp'))} | "
            f"{_metric(_nested(site_metrics, 'google_search_console', 'core_web_vitals', device, 'cls'))} |"
        )

    lines.extend(
        [
            "",
            "### Non-branded opportunities (positions 4–20)",
            "",
            "| Source | Query | Impressions | Clicks | Position |",
            "| --- | --- | ---: | ---: | ---: |",
        ]
    )
    opportunity_count = 0
    for label, item, _ in source_rows:
        for row in item["opportunities"]:
            opportunity_count += 1
            lines.append(
                f"| {label} | {_markdown(row['query'])} | {row['impressions']:,} | {row['clicks']:,} | {row['position']:.1f} |"
            )
    if not opportunity_count:
        lines.append("| — | No measured opportunities yet | — | — | — |")

    lines.extend(
        [
            "",
            "## AI citation scorecard",
            "",
            "| Platform | Model/surface | Web search | Tested | Brand cited | Plate.hk URL cited | Accurate | Competitor cited | Citation rate |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    for platform, item in ai["platforms"].items():
        lines.append(
            f"| {PLATFORM_LABELS[platform]} | {_markdown(', '.join(item['models_or_surfaces']))} | "
            f"{item['web_search_enabled']}/{item['tested']} | {item['tested']}/{item['expected']} | {item['brand_cited']} | "
            f"{item['platehk_url_cited']} | {item['accurate']} | {item['competitor_cited']} | "
            f"{_percent_metric(item['citation_rate_percent'])} |"
        )
    lines.extend(
        [
            "",
            f"Overall measured citation rate: **{_percent_metric(ai['citation_rate_percent'])}**",
            "",
            "### Lost prompts",
            "",
            "| Priority | Prompt | Lost on | Competitor cited | Target |",
            "| ---: | --- | --- | ---: | --- |",
        ]
    )
    for item in ai["lost_prompts"][:20]:
        lines.append(
            f"| P{item['priority']} | {_markdown(item['prompt'])} | {', '.join(item['platforms'])} | "
            f"{item['competitor_cited_count']} | {item['target_url']} |"
        )
    if not ai["lost_prompts"]:
        lines.append("| — | No measured lost prompts yet | — | — | — |")

    lines.extend(
        [
            "",
            "### Inaccurate answers",
            "",
            "| Priority | Prompt | Inaccurate on | Target |",
            "| ---: | --- | --- | --- |",
        ]
    )
    for item in ai["inaccurate_prompts"][:20]:
        lines.append(
            f"| P{item['priority']} | {_markdown(item['prompt'])} | {', '.join(item['platforms'])} | {item['target_url']} |"
        )
    if not ai["inaccurate_prompts"]:
        lines.append("| — | No measured inaccurate answers yet | — | — |")

    lines.extend(["", "## Evidence-driven fix pack", ""])
    if ai["fix_pack"]:
        for item in ai["fix_pack"]:
            lines.extend(
                [
                    f"{item['priority']}. **{item['category']}** — {item['lost_platform_prompt_cells']} lost and "
                    f"{item['inaccurate_platform_prompt_cells']} inaccurate platform/prompt cells",
                    f"   - {item['recommendation']}",
                ]
            )
    else:
        lines.append("No fix pack is generated until lost prompts or inaccurate answers are measured.")

    lines.extend(["", "## Remaining evidence gates", ""])
    if baseline["evidence_gaps"]:
        lines.extend(f"- [ ] {gap}" for gap in baseline["evidence_gaps"])
    else:
        lines.append("- None. This baseline has complete search, site-health, and four-platform AI evidence.")
    lines.extend(
        [
            "",
            "## Method",
            "",
            "- Search opportunities include non-branded queries with at least 10 impressions and an average position from 4 through 20.",
            "- AI citation rate is the share of completed prompt tests where Plate.hk was cited by name; URL citation and answer accuracy are measured separately.",
            "- A missing citation does not prove that a platform can never cite Plate.hk, and a citation does not prove that an answer is accurate.",
            "- Hong Kong Transport Department source documents remain authoritative when a generated or AI answer differs.",
            "",
        ]
    )
    return "\n".join(lines)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a source-grounded Plate.hk SEO/AEO measurement baseline.")
    parser.add_argument("--prompts", type=Path, default=DEFAULT_PROMPTS, help="Tracked bilingual prompt config")
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR, help="Private input/output directory")
    parser.add_argument("--init", action="store_true", help="Create non-overwriting input templates and exit")
    parser.add_argument(
        "--init-ai-only",
        action="store_true",
        help="Create only ai-audit.csv, optionally filtered by --platform and --prompt-id",
    )
    parser.add_argument("--platform", action="append", help="Platform to include with --init-ai-only; repeatable")
    parser.add_argument("--prompt-id", action="append", help="Prompt ID to include with --init-ai-only; repeatable")
    parser.add_argument("--allow-incomplete", action="store_true", help="Write a report that explicitly lists missing evidence")
    parser.add_argument("--output-json", type=Path, help="Output JSON path; defaults to INPUT_DIR/baseline.json")
    parser.add_argument("--output-markdown", type=Path, help="Output Markdown path; defaults to INPUT_DIR/baseline.md")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        config = load_prompt_config(args.prompts)
        if args.init and args.init_ai_only:
            raise BaselineError("Use only one of --init or --init-ai-only")
        if args.init:
            created = initialise_inputs(args.input_dir, config)
            print(f"Created {len(created)} private baseline input templates in {args.input_dir}")
            print(f"AI audit matrix: {len(config['prompts']) * len(config['platforms'])} platform/prompt rows")
            return 0
        if args.init_ai_only:
            created = initialise_ai_audit(
                args.input_dir / "ai-audit.csv",
                config,
                platforms=args.platform,
                prompt_ids=args.prompt_id,
            )
            with created.open(encoding="utf-8", newline="") as handle:
                row_count = sum(1 for _ in csv.DictReader(handle))
            print(f"Created private AI audit matrix with {row_count} rows: {created}")
            return 0

        ai_audit = load_ai_audit(args.input_dir / "ai-audit.csv", config)
        gsc_export = load_query_export(args.input_dir / "gsc-queries.csv", source="Google Search Console")
        bing_export = load_query_export(args.input_dir / "bing-queries.csv", source="Bing Webmaster Tools")
        site_metrics = load_site_metrics(args.input_dir / "site-metrics.json")
        baseline = build_baseline(config, ai_audit, gsc_export, bing_export, site_metrics)
        if baseline["status"] != "complete" and not args.allow_incomplete:
            print("Baseline is incomplete:", file=sys.stderr)
            for gap in baseline["evidence_gaps"]:
                print(f"- {gap}", file=sys.stderr)
            print("Fill the private templates or pass --allow-incomplete for a gap report.", file=sys.stderr)
            return 2

        output_json = args.output_json or args.input_dir / "baseline.json"
        output_markdown = args.output_markdown or args.input_dir / "baseline.md"
        output_json.parent.mkdir(parents=True, exist_ok=True)
        output_markdown.parent.mkdir(parents=True, exist_ok=True)
        output_json.write_text(
            json.dumps(baseline, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        output_markdown.write_text(render_markdown(baseline), encoding="utf-8")
        print(f"SEO/AEO baseline {baseline['status']}: {output_markdown}")
        print(f"Machine-readable baseline: {output_json}")
        return 0
    except (BaselineError, OSError, json.JSONDecodeError) as exc:
        print(f"SEO/AEO baseline error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
