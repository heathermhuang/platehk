#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import build_seo_aeo_baseline as baseline


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROMPTS = ROOT / "config" / "seo-aeo-prompts.json"
DEFAULT_INPUT_DIR = ROOT / ".private" / "seo-aeo"


def _private_relative_path(input_dir: Path, value: str, *, field: str, must_exist: bool) -> Path:
    relative = Path(str(value or "").strip())
    if not relative.as_posix() or relative.is_absolute() or ".." in relative.parts:
        raise baseline.BaselineError(f"{field} must be relative to the private input directory")
    root = input_dir.resolve()
    resolved = (root / relative).resolve()
    if not resolved.is_relative_to(root):
        raise baseline.BaselineError(f"{field} must stay inside the private input directory")
    if must_exist and not resolved.is_file():
        raise baseline.BaselineError(f"{field} does not exist: {relative.as_posix()}")
    return relative


def _atomic_write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            newline="",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temp_path = Path(handle.name)
            writer = csv.DictWriter(handle, fieldnames=baseline.AUDIT_COLUMNS)
            writer.writeheader()
            writer.writerows(rows)
        temp_path.replace(path)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def record_evidence(
    *,
    input_dir: Path,
    config: dict[str, Any],
    platform: str,
    prompt_id: str,
    observed_prompt: str,
    verbatim_answer: str,
    model_or_surface: str,
    web_search_enabled: bool,
    captured_at: str,
    conversation_url: str = "",
    screenshot_paths: list[str] | None = None,
    cited_urls: list[str] | None = None,
    run_id: str = "",
) -> dict[str, str]:
    platform = platform.strip().lower()
    prompts = {item["id"]: item for item in config["prompts"]}
    if platform not in config["platforms"]:
        raise baseline.BaselineError(f"Unknown platform: {platform!r}")
    if prompt_id not in prompts:
        raise baseline.BaselineError(f"Unknown prompt_id: {prompt_id!r}")
    prompt = prompts[prompt_id]
    if observed_prompt.strip() != str(prompt["prompt"]):
        raise baseline.BaselineError("Observed prompt does not match the tracked prompt corpus")
    if not verbatim_answer.strip():
        raise baseline.BaselineError("Verbatim answer must not be empty")
    if not model_or_surface.strip():
        raise baseline.BaselineError("model_or_surface must not be empty")
    parsed_at = baseline._parse_iso_datetime(captured_at, field="captured_at")
    if conversation_url:
        parsed_url = urlparse(conversation_url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise baseline.BaselineError("conversation_url must be an HTTP(S) URL")

    input_dir = input_dir.resolve()
    audit_path = input_dir / "ai-audit.csv"
    if not audit_path.is_file():
        raise baseline.BaselineError(f"AI audit CSV does not exist: {audit_path}")
    with audit_path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise baseline.BaselineError("AI audit CSV has no header")
        missing_columns = [column for column in baseline.AUDIT_COLUMNS if column not in reader.fieldnames]
        if missing_columns:
            raise baseline.BaselineError("AI audit CSV is missing columns: " + ", ".join(missing_columns))
        rows = list(reader)

    matches = [row for row in rows if row["platform"].strip().lower() == platform and row["prompt_id"] == prompt_id]
    if len(matches) != 1:
        raise baseline.BaselineError(f"Expected one audit row for {platform}/{prompt_id}, found {len(matches)}")
    row = matches[0]
    if any(str(row.get(field) or "").strip() for field in ("run_id", "evidence_path", "evidence_sha256")):
        raise baseline.BaselineError(f"Evidence already recorded for {platform}/{prompt_id}")

    run_id = run_id.strip() or (
        f"{parsed_at.strftime('%Y%m%dT%H%M%S%z')}--{platform}--{prompt_id}--{uuid4().hex[:12]}"
    )
    if not re.fullmatch(r"[A-Za-z0-9._+-]+", run_id):
        raise baseline.BaselineError("run_id may contain only letters, numbers, dot, underscore, plus, and hyphen")
    if any(str(existing.get("run_id") or "").strip() == run_id for existing in rows):
        raise baseline.BaselineError(f"run_id already exists: {run_id}")

    normalized_screenshots = [
        _private_relative_path(input_dir, value, field="screenshot_path", must_exist=True).as_posix()
        for value in (screenshot_paths or [])
    ]
    if not conversation_url and not normalized_screenshots:
        raise baseline.BaselineError("Evidence needs a conversation_url or screenshot_path")
    normalized_cited_urls: list[str] = []
    for value in cited_urls or []:
        parsed_url = urlparse(value)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise baseline.BaselineError(f"cited_url must be an HTTP(S) URL: {value!r}")
        normalized_cited_urls.append(value)

    evidence_relative = Path("evidence") / platform / prompt_id / f"{run_id}.json"
    evidence_relative = _private_relative_path(
        input_dir,
        evidence_relative.as_posix(),
        field="evidence_path",
        must_exist=False,
    )
    evidence_path = input_dir / evidence_relative
    if evidence_path.exists():
        raise baseline.BaselineError(f"Evidence file already exists: {evidence_relative.as_posix()}")
    evidence = {
        "schema_version": baseline.AUDIT_EVIDENCE_SCHEMA_VERSION,
        "run_id": run_id,
        "platform": platform,
        "prompt_id": prompt_id,
        "observed_prompt": str(prompt["prompt"]),
        "captured_at": captured_at,
        "model_or_surface": model_or_surface.strip(),
        "web_search_enabled": web_search_enabled,
        "verbatim_answer": verbatim_answer,
        "conversation_url": conversation_url,
        "screenshot_paths": normalized_screenshots,
        "cited_urls": normalized_cited_urls,
    }
    evidence_bytes = (json.dumps(evidence, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    evidence_sha256 = hashlib.sha256(evidence_bytes).hexdigest()
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        evidence_path.write_bytes(evidence_bytes)
        row.update(
            {
                "audit_date": parsed_at.date().isoformat(),
                "run_id": run_id,
                "observed_prompt": str(prompt["prompt"]),
                "evidence_path": evidence_relative.as_posix(),
                "evidence_sha256": evidence_sha256,
                "model_or_surface": model_or_surface.strip(),
                "web_search_enabled": "yes" if web_search_enabled else "no",
            }
        )
        _atomic_write_csv(audit_path, rows)
    except Exception:
        evidence_path.unlink(missing_ok=True)
        raise
    return {
        "run_id": run_id,
        "evidence_path": evidence_relative.as_posix(),
        "evidence_sha256": evidence_sha256,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Persist one exact SEO/AEO answer and bind it to its audit row.")
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--prompts", type=Path, default=DEFAULT_PROMPTS)
    parser.add_argument("--platform", required=True)
    parser.add_argument("--prompt-id", required=True)
    parser.add_argument("--observed-prompt-file", type=Path, required=True)
    parser.add_argument("--answer-file", type=Path, required=True)
    parser.add_argument("--model-or-surface", required=True)
    parser.add_argument("--web-search-enabled", choices=("yes", "no"), required=True)
    parser.add_argument("--captured-at", required=True, help="ISO-8601 timestamp with timezone")
    parser.add_argument("--conversation-url", default="")
    parser.add_argument("--screenshot-path", action="append", default=[])
    parser.add_argument("--cited-url", action="append", default=[])
    parser.add_argument("--run-id", default="")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        result = record_evidence(
            input_dir=args.input_dir,
            config=baseline.load_prompt_config(args.prompts),
            platform=args.platform,
            prompt_id=args.prompt_id,
            observed_prompt=args.observed_prompt_file.read_text(encoding="utf-8"),
            verbatim_answer=args.answer_file.read_text(encoding="utf-8"),
            model_or_surface=args.model_or_surface,
            web_search_enabled=args.web_search_enabled == "yes",
            captured_at=args.captured_at,
            conversation_url=args.conversation_url,
            screenshot_paths=args.screenshot_path,
            cited_urls=args.cited_url,
            run_id=args.run_id,
        )
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (baseline.BaselineError, OSError, json.JSONDecodeError) as exc:
        print(f"SEO/AEO evidence error: {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
