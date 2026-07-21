from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
import urllib.parse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "notify_telegram",
        ROOT / "scripts" / "notify_telegram.py",
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _load_secret_scanner():
    spec = importlib.util.spec_from_file_location(
        "scan_repo_secrets_for_telegram_test",
        ROOT / "scripts" / "scan_repo_secrets.py",
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class _Response:
    def __init__(self, payload=None):
        self.payload = payload or {"ok": True, "result": {"message_id": 1}}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class TelegramNotifyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = _load_module()
        cls.secret_scanner = _load_secret_scanner()

    def test_issue_event_message_keeps_action_and_comment_bounded(self) -> None:
        text, link = self.module.build_issue_event_message(
            {
                "GITHUB_EVENT_NAME": "issue_comment",
                "ISSUE_ACTION": "created",
                "ISSUE_NUMBER": "42",
                "ISSUE_TITLE": "  Parser   repair  ",
                "ISSUE_ACTOR": "maintainer",
                "ISSUE_URL": "https://github.com/example/repo/issues/42",
                "ISSUE_COMMENT": "x" * 2000,
            }
        )

        self.assertIn("issue #42 created", text)
        self.assertIn("Parser repair", text)
        self.assertIn("Comment:", text)
        self.assertLess(len(text), 1100)
        self.assertEqual(link, "https://github.com/example/repo/issues/42")

    def test_send_message_posts_plain_text_and_github_button(self) -> None:
        captured = {}

        def opener(request, timeout):
            captured["url"] = request.full_url
            captured["timeout"] = timeout
            captured["payload"] = urllib.parse.parse_qs(request.data.decode("utf-8"))
            return _Response()

        result = self.module.send_message(
            token="test-token",
            chat_id="1234",
            text="Repair needs review",
            message_thread_id="99",
            link="https://github.com/example/repo/issues/42",
            link_label="Open issue",
            opener=opener,
        )

        self.assertTrue(result["ok"])
        self.assertTrue(captured["url"].endswith("/bottest-token/sendMessage"))
        self.assertEqual(captured["payload"]["chat_id"], ["1234"])
        self.assertEqual(captured["payload"]["message_thread_id"], ["99"])
        keyboard = json.loads(captured["payload"]["reply_markup"][0])
        self.assertEqual(keyboard["inline_keyboard"][0][0]["text"], "Open issue")

    def test_normalize_text_truncates_long_messages(self) -> None:
        text = self.module.normalize_text("x" * 5000)
        self.assertLessEqual(len(text), self.module.MAX_MESSAGE_LENGTH)
        self.assertTrue(text.endswith("…"))

    def test_get_updates_discovers_unique_private_and_group_chat_ids(self) -> None:
        updates = [
            {
                "update_id": 1,
                "message": {
                    "chat": {"id": 1234, "type": "private", "first_name": "Heather"},
                    "text": "/start",
                },
            },
            {
                "update_id": 2,
                "message": {
                    "chat": {"id": -100999, "type": "supergroup", "title": "PlateHK Ops"},
                    "text": "status",
                },
            },
        ]

        def opener(request, timeout):
            self.assertTrue(request.full_url.endswith("/bottest-token/getUpdates"))
            return _Response({"ok": True, "result": updates})

        payload = self.module.get_updates(token="test-token", opener=opener)
        candidates = self.module.discover_chat_candidates(payload)
        summary = self.module.format_chat_candidates(candidates)

        self.assertEqual([item["chat_id"] for item in candidates], ["1234", "-100999"])
        self.assertIn("Heather", summary)
        self.assertIn("PlateHK Ops", summary)
        self.assertIn("TELEGRAM_CHAT_ID", summary)

    def test_repo_secret_scanner_detects_telegram_bot_token_shape(self) -> None:
        token = "1234567890:" + ("A" * 35)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.txt"
            path.write_text(token + "\n", encoding="utf-8")
            findings = self.secret_scanner.scan_file(path)

        self.assertIn("telegram_bot_token", {name for name, _line, _text in findings})


if __name__ == "__main__":
    unittest.main()
