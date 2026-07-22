#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable


MAX_MESSAGE_LENGTH = 3800


def normalize_text(value: str, *, limit: int = MAX_MESSAGE_LENGTH) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "…"


def normalize_message_text(value: str, *, limit: int = MAX_MESSAGE_LENGTH) -> str:
    lines = [" ".join(line.split()) for line in str(value or "").splitlines()]
    normalized_lines: list[str] = []
    for line in lines:
        if not line and (not normalized_lines or not normalized_lines[-1]):
            continue
        normalized_lines.append(line)
    text = "\n".join(normalized_lines).strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "…"


def resolve_send_text(
    *,
    text: str = "",
    text_env: str = "",
    text_file: str = "",
    env: dict[str, str] | None = None,
) -> str:
    values = env or os.environ
    if text_file:
        return Path(text_file).read_text(encoding="utf-8")
    if text_env:
        return values.get(text_env, "")
    return text


def build_issue_event_message(env: dict[str, str] | None = None) -> tuple[str, str]:
    values = env or os.environ
    event_name = values.get("GITHUB_EVENT_NAME", "issue")
    action = values.get("ISSUE_ACTION", "updated")
    number = values.get("ISSUE_NUMBER", "?")
    title = normalize_text(values.get("ISSUE_TITLE", "PlateHK auto-heal issue"), limit=500)
    actor = normalize_text(values.get("ISSUE_ACTOR", "unknown"), limit=100)
    url = values.get("ISSUE_URL", "").strip()
    comment = normalize_text(values.get("ISSUE_COMMENT", ""), limit=900)

    lines = [
        f"PlateHK auto-heal issue #{number} {action}",
        title,
        f"By: {actor}",
    ]
    if event_name == "issue_comment" and comment:
        lines.append(f"Comment: {comment}")
    return "\n".join(lines), url


def send_message(
    *,
    token: str,
    chat_id: str,
    text: str,
    message_thread_id: str = "",
    link: str = "",
    link_label: str = "Open GitHub",
    opener: Callable[..., Any] = urllib.request.urlopen,
    timeout: int = 15,
) -> dict[str, Any]:
    payload: dict[str, str] = {
        "chat_id": chat_id,
        "text": normalize_message_text(text),
        "disable_web_page_preview": "true",
    }
    if message_thread_id:
        payload["message_thread_id"] = message_thread_id
    if link:
        payload["reply_markup"] = json.dumps(
            {"inline_keyboard": [[{"text": normalize_text(link_label, limit=64), "url": link}]]},
            ensure_ascii=False,
        )

    endpoint = f"https://api.telegram.org/bot{token}/sendMessage"
    request = urllib.request.Request(
        endpoint,
        data=urllib.parse.urlencode(payload).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with opener(request, timeout=timeout) as response:
        result = json.loads(response.read().decode("utf-8"))
    if not result.get("ok"):
        raise RuntimeError(f"Telegram API rejected the message: {result.get('description', 'unknown error')}")
    return result


def get_updates(
    *,
    token: str,
    opener: Callable[..., Any] = urllib.request.urlopen,
    timeout: int = 15,
) -> list[dict[str, Any]]:
    endpoint = f"https://api.telegram.org/bot{token}/getUpdates"
    request = urllib.request.Request(
        endpoint,
        data=urllib.parse.urlencode(
            {
                "timeout": "0",
                "allowed_updates": json.dumps(["message", "channel_post", "my_chat_member"]),
            }
        ).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with opener(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not payload.get("ok"):
        raise RuntimeError(f"Telegram API rejected getUpdates: {payload.get('description', 'unknown error')}")
    updates = payload.get("result") or []
    return [item for item in updates if isinstance(item, dict)]


def discover_chat_candidates(updates: list[dict[str, Any]]) -> list[dict[str, str]]:
    candidates: dict[str, dict[str, str]] = {}
    for update in updates:
        envelope = None
        for key in ("message", "channel_post", "my_chat_member"):
            value = update.get(key)
            if isinstance(value, dict):
                envelope = value
                break
        if not envelope:
            continue
        chat = envelope.get("chat")
        if not isinstance(chat, dict) or chat.get("id") is None:
            continue

        chat_id = str(chat["id"])
        title = chat.get("title") or chat.get("username")
        if not title:
            title = " ".join(str(chat.get(key) or "") for key in ("first_name", "last_name")).strip()
        candidates[chat_id] = {
            "chat_id": chat_id,
            "type": normalize_text(str(chat.get("type") or "unknown"), limit=40),
            "name": normalize_text(str(title or "unnamed"), limit=120),
            "latest_message": normalize_text(str(envelope.get("text") or ""), limit=200),
        }
    return list(candidates.values())


def format_chat_candidates(candidates: list[dict[str, str]]) -> str:
    lines = ["## Telegram chat candidates", ""]
    if not candidates:
        lines.extend(
            [
                "No chats were found. Send `/start` to the bot (or a message in the target group), then rerun discovery.",
                "",
            ]
        )
        return "\n".join(lines)

    lines.extend(["| Chat ID | Type | Name | Latest message |", "|---|---|---|---|"])
    for candidate in candidates:
        cells = [
            f"`{candidate['chat_id']}`",
            candidate["type"],
            candidate["name"],
            candidate["latest_message"] or "-",
        ]
        lines.append("| " + " | ".join(cell.replace("|", "\\|") for cell in cells) + " |")
    lines.append("")
    lines.append("Store the intended ID as the GitHub Actions secret `TELEGRAM_CHAT_ID`.")
    lines.append("")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send optional PlateHK operations notifications to Telegram.")
    parser.add_argument("command", choices=["send", "issue-event", "discover-chat"])
    text_source = parser.add_mutually_exclusive_group()
    text_source.add_argument("--text", default="", help="Message text for the send command.")
    text_source.add_argument("--text-env", help="Read message text from this environment variable.")
    text_source.add_argument("--text-file", help="Read message text from this UTF-8 file.")
    parser.add_argument("--link", default="", help="Optional URL for an inline button.")
    parser.add_argument("--link-env", help="Read the inline-button URL from this environment variable.")
    parser.add_argument("--link-label", default="Open GitHub")
    parser.add_argument("--summary-file", help="Optional Markdown output path for discovered chat IDs.")
    parser.add_argument("--optional", action="store_true", help="Exit successfully when Telegram secrets are absent.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        message = "Telegram operation skipped: TELEGRAM_BOT_TOKEN is not configured."
        print(message)
        return 0 if args.optional else 2

    if args.command == "discover-chat":
        try:
            candidates = discover_chat_candidates(get_updates(token=token))
        except (OSError, ValueError, RuntimeError, urllib.error.URLError) as exc:
            print(f"Telegram chat discovery failed: {exc}", file=sys.stderr)
            return 1
        summary = format_chat_candidates(candidates)
        print(summary)
        if args.summary_file:
            with open(args.summary_file, "a", encoding="utf-8") as fh:
                fh.write(summary)
        return 0 if candidates else 3

    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not chat_id:
        message = "Telegram notification skipped: TELEGRAM_CHAT_ID is not configured."
        print(message)
        return 0 if args.optional else 2

    if args.command == "issue-event":
        text, link = build_issue_event_message()
    else:
        try:
            text = resolve_send_text(
                text=args.text,
                text_env=args.text_env or "",
                text_file=args.text_file or "",
            )
        except OSError as exc:
            print(f"Telegram message file could not be read: {exc}", file=sys.stderr)
            return 1
        link = os.environ.get(args.link_env, "") if args.link_env else args.link

    if not text.strip():
        print("Telegram notification skipped: message text is empty.")
        return 0 if args.optional else 2

    try:
        send_message(
            token=token,
            chat_id=chat_id,
            text=text,
            message_thread_id=os.environ.get("TELEGRAM_MESSAGE_THREAD_ID", "").strip(),
            link=link.strip(),
            link_label=args.link_label,
        )
    except (OSError, ValueError, RuntimeError, urllib.error.URLError) as exc:
        print(f"Telegram notification failed: {exc}", file=sys.stderr)
        return 1

    print("Telegram notification sent.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
