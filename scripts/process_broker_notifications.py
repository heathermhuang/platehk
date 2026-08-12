#!/usr/bin/env python3
"""Deliver PII-minimized buyer-inquiry alerts to PlateHK operations."""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from typing import Any, Callable

from notify_telegram import send_message


Opener = Callable[..., Any]
DELIVERY_BATCH_SIZE = 10


def request_json(
    endpoint: str,
    token: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    opener: Opener = urllib.request.urlopen,
) -> dict[str, Any]:
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "PlateHKBrokerNotifier/1.0",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(endpoint, data=body, headers=headers, method=method)
    with opener(request, timeout=20) as response:
        decoded = json.loads(response.read().decode("utf-8"))
    if not isinstance(decoded, dict):
        raise RuntimeError("Broker notification endpoint returned an invalid response")
    return decoded


def validated_notifications(payload: dict[str, Any]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for item in payload.get("notifications") or []:
        if not isinstance(item, dict):
            continue
        notification_key = str(item.get("notification_key") or "")
        inquiry_id = str(item.get("inquiry_id") or "")
        plate = "".join(character for character in str(item.get("plate") or "").upper() if character.isalnum())
        budget_hkd = item.get("budget_hkd")
        contact_method = str(item.get("contact_method") or "").lower()
        created_at = str(item.get("created_at") or "")
        if not notification_key.startswith("broker-notification:"):
            continue
        if len(inquiry_id) != 36 or not plate or not isinstance(budget_hkd, int):
            continue
        if contact_method not in {"email", "phone", "whatsapp"} or not created_at:
            continue
        output.append(
            {
                "notification_key": notification_key,
                "inquiry_id": inquiry_id,
                "plate": plate,
                "budget_hkd": budget_hkd,
                "contact_method": contact_method,
                "created_at": created_at,
            }
        )
    return output


def build_message(notifications: list[dict[str, Any]]) -> str:
    lines = [f"PlateHK confidential buyer inquiries: {len(notifications)} new"]
    for item in notifications:
        lines.extend(
            [
                "",
                f"Plate: {item['plate']}",
                f"Budget: HK${item['budget_hkd']:,}",
                f"Contact method: {item['contact_method']}",
                f"Inquiry: {item['inquiry_id']}",
                f"Received: {item['created_at']}",
            ]
        )
    lines.extend(["", "Buyer contact details remain in the private Cloudflare KV namespace."])
    return "\n".join(lines)


def process(
    *,
    endpoint: str,
    broker_token: str,
    telegram_token: str,
    telegram_chat_id: str,
    telegram_thread_id: str = "",
    opener: Opener = urllib.request.urlopen,
    sender: Callable[..., Any] = send_message,
) -> int:
    payload = request_json(endpoint, broker_token, opener=opener)
    notifications = validated_notifications(payload)
    if not notifications:
        print("No pending broker inquiry notifications.")
        return 0
    delivered = 0
    for offset in range(0, len(notifications), DELIVERY_BATCH_SIZE):
        batch = notifications[offset : offset + DELIVERY_BATCH_SIZE]
        sender(
            token=telegram_token,
            chat_id=telegram_chat_id,
            text=build_message(batch),
            message_thread_id=telegram_thread_id,
        )
        keys = [item["notification_key"] for item in batch]
        result = request_json(
            endpoint,
            broker_token,
            method="POST",
            payload={"notification_keys": keys},
            opener=opener,
        )
        if result.get("acknowledged") != len(keys):
            raise RuntimeError("Broker notification acknowledgement count did not match")
        delivered += len(keys)
    print(f"Delivered and acknowledged {delivered} broker inquiry notification(s).")
    return delivered


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    required = {
        "BROKER_NOTIFY_TOKEN": os.environ.get("BROKER_NOTIFY_TOKEN", "").strip(),
        "TELEGRAM_BOT_TOKEN": os.environ.get("TELEGRAM_BOT_TOKEN", "").strip(),
        "TELEGRAM_CHAT_ID": os.environ.get("TELEGRAM_CHAT_ID", "").strip(),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        print("Missing required notification configuration: " + ", ".join(missing))
        return 2
    try:
        process(
            endpoint=args.endpoint,
            broker_token=required["BROKER_NOTIFY_TOKEN"],
            telegram_token=required["TELEGRAM_BOT_TOKEN"],
            telegram_chat_id=required["TELEGRAM_CHAT_ID"],
            telegram_thread_id=os.environ.get("TELEGRAM_MESSAGE_THREAD_ID", "").strip(),
        )
    except (OSError, ValueError, RuntimeError, urllib.error.URLError) as exc:
        print(f"Broker notification delivery failed: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
