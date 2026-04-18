#!/usr/bin/env python3
from __future__ import annotations

import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

TEXT_EXTENSIONS = {
    ".py",
    ".php",
    ".js",
    ".html",
    ".css",
    ".md",
    ".txt",
    ".json",
    ".yml",
    ".yaml",
    ".sh",
    ".svg",
    ".xml",
    ".toml",
}

PATTERNS = [
    ("openai_api_key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b")),
    ("aws_access_key_id", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("private_key", re.compile(r"-----BEGIN (?:RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----")),
]

ALLOW_SUBSTRINGS = {
    "OPENAI_API_KEY_HERE",
    "CHANGE_ME",
    "example_database",
    "example_user",
    "db.example.com",
}


def tracked_files() -> list[Path]:
    proc = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    paths: list[Path] = []
    for raw in proc.stdout.split(b"\0"):
        if not raw:
            continue
        rel = Path(raw.decode("utf-8", errors="replace"))
        if rel.parts[:1] in {(".github",), (".git",), (".venv",), (".tmp",)}:
            continue
        if "data" in rel.parts or "plates" in rel.parts or "assets/vendor" in rel.as_posix():
            continue
        if rel.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        paths.append(ROOT / rel)
    return paths


def scan_file(path: Path) -> list[tuple[str, int, str]]:
    findings: list[tuple[str, int, str]] = []
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return findings
    except UnicodeDecodeError:
        return findings
    for lineno, line in enumerate(text.splitlines(), start=1):
        if any(allowed in line for allowed in ALLOW_SUBSTRINGS):
            continue
        for name, pattern in PATTERNS:
            if pattern.search(line):
                findings.append((name, lineno, line.strip()))
    return findings


def main() -> int:
    findings: list[tuple[str, Path, int, str]] = []
    for path in tracked_files():
        for name, lineno, line in scan_file(path):
            findings.append((name, path.relative_to(ROOT), lineno, line))

    if not findings:
        print("No tracked-secret patterns found.")
        return 0

    print("Potential tracked secrets found:")
    for name, rel, lineno, line in findings:
        print(f"- {rel}:{lineno} [{name}] {line[:200]}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
