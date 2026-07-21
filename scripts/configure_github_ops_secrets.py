#!/usr/bin/env python3
"""Upload local PlateHK operations credentials to GitHub Actions Secrets safely."""

from __future__ import annotations

import argparse
import re
import shutil
import stat
import subprocess
import sys
from pathlib import Path
from typing import Callable
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_FILE = ROOT / ".private" / "platehk-ops.env"
DEFAULT_REPOSITORY = "heathermhuang/platehk"
SECRET_NAMES = (
    "OPENAI_API_KEY",
    "OPENAI_RESPONSES_API_ENDPOINT",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "TELEGRAM_MESSAGE_THREAD_ID",
)
TELEGRAM_TOKEN_RE = re.compile(r"^[0-9]{6,15}:[A-Za-z0-9_-]{30,}$")
INTEGER_RE = re.compile(r"^-?[0-9]+$")
POSITIVE_INTEGER_RE = re.compile(r"^[0-9]+$")


class ConfigurationError(ValueError):
    pass


def require_private_permissions(path: Path) -> None:
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077:
        raise ConfigurationError(
            f"{path} is readable by other users (mode {mode:03o}); run: chmod 600 {path}"
        )


def load_env_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise ConfigurationError(f"Credential file not found: {path}")
    require_private_permissions(path)

    values: dict[str, str] = {}
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        key = key.strip()
        if not separator:
            raise ConfigurationError(f"Line {line_number} must use NAME=value syntax.")
        if key not in SECRET_NAMES:
            raise ConfigurationError(f"Line {line_number} contains unsupported key {key!r}.")
        if key in values:
            raise ConfigurationError(f"Line {line_number} duplicates {key}.")
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        if "\x00" in value or "\n" in value or "\r" in value:
            raise ConfigurationError(f"{key} must be a single-line value.")
        values[key] = value
    return values


def validate_values(values: dict[str, str]) -> dict[str, str]:
    populated = {name: values.get(name, "") for name in SECRET_NAMES if values.get(name, "")}
    if not populated:
        raise ConfigurationError("No credential values are populated yet.")

    key = populated.get("OPENAI_API_KEY", "")
    endpoint = populated.get("OPENAI_RESPONSES_API_ENDPOINT", "")
    if bool(key) != bool(endpoint):
        raise ConfigurationError(
            "OPENAI_API_KEY and OPENAI_RESPONSES_API_ENDPOINT must be configured together."
        )
    if key and (len(key) < 8 or any(character.isspace() for character in key)):
        raise ConfigurationError("OPENAI_API_KEY does not look like a valid single-line API key.")
    if endpoint:
        parsed = urlsplit(endpoint)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or not parsed.path.rstrip("/").endswith("/responses")
        ):
            raise ConfigurationError(
                "OPENAI_RESPONSES_API_ENDPOINT must be a complete HTTPS URL ending in /responses."
            )

    token = populated.get("TELEGRAM_BOT_TOKEN", "")
    if token and not TELEGRAM_TOKEN_RE.fullmatch(token):
        raise ConfigurationError("TELEGRAM_BOT_TOKEN does not match the BotFather token format.")
    chat_id = populated.get("TELEGRAM_CHAT_ID", "")
    if chat_id and not INTEGER_RE.fullmatch(chat_id):
        raise ConfigurationError("TELEGRAM_CHAT_ID must be an integer, optionally beginning with '-'.")
    thread_id = populated.get("TELEGRAM_MESSAGE_THREAD_ID", "")
    if thread_id and not POSITIVE_INTEGER_RE.fullmatch(thread_id):
        raise ConfigurationError("TELEGRAM_MESSAGE_THREAD_ID must be a positive integer.")
    return populated


def upload_secrets(
    values: dict[str, str],
    *,
    repository: str,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> list[str]:
    runner(
        ["gh", "auth", "status", "--hostname", "github.com"],
        check=True,
        text=True,
        stdout=subprocess.DEVNULL,
    )
    uploaded: list[str] = []
    for name in SECRET_NAMES:
        value = values.get(name, "")
        if not value:
            continue
        runner(
            ["gh", "secret", "set", name, "--repo", repository],
            input=value,
            check=True,
            text=True,
        )
        uploaded.append(name)
    return uploaded


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate a private local env file and upload populated values to GitHub Actions Secrets."
    )
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--repo", default=DEFAULT_REPOSITORY)
    parser.add_argument("--check", action="store_true", help="Validate only; do not change GitHub secrets.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        values = validate_values(load_env_file(args.env_file.resolve()))
        if args.check:
            print("Credential file is valid. Populated fields: " + ", ".join(values))
            return 0
        if shutil.which("gh") is None:
            raise ConfigurationError("GitHub CLI (gh) is not installed or is not on PATH.")
        uploaded = upload_secrets(values, repository=args.repo)
    except ConfigurationError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2
    except subprocess.CalledProcessError:
        print("GitHub secret upload failed. Check `gh auth status` and repository access.", file=sys.stderr)
        return 1

    print("Uploaded GitHub Actions Secrets: " + ", ".join(uploaded))
    print("No secret values were printed or passed as command-line arguments.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
