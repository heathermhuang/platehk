from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _load_module():
    scripts_dir = str(ROOT / "scripts")
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    spec = importlib.util.spec_from_file_location(
        "process_broker_notifications",
        ROOT / "scripts" / "process_broker_notifications.py",
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class BrokerNotificationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = _load_module()

    def test_message_excludes_buyer_contact_value(self):
        message = self.module.build_message(
            [
                {
                    "notification_key": "broker-notification:2026-08-12T00:00:00Z:11111111-1111-1111-1111-111111111111",
                    "inquiry_id": "11111111-1111-1111-1111-111111111111",
                    "plate": "HK88",
                    "budget_hkd": 880000,
                    "contact_method": "email",
                    "created_at": "2026-08-12T00:00:00Z",
                }
            ]
        )

        self.assertIn("HK88", message)
        self.assertIn("HK$880,000", message)
        self.assertNotIn("buyer@example", message)
        self.assertIn("private Cloudflare KV", message)

    def test_process_sends_then_acknowledges(self):
        notification = {
            "notification_key": "broker-notification:2026-08-12T00:00:00Z:11111111-1111-1111-1111-111111111111",
            "inquiry_id": "11111111-1111-1111-1111-111111111111",
            "plate": "HK88",
            "budget_hkd": 880000,
            "contact_method": "whatsapp",
            "created_at": "2026-08-12T00:00:00Z",
        }
        requests = []
        sent = []
        events = []

        def opener(request, timeout):
            requests.append(request)
            if request.method == "GET":
                events.append("get")
                return _Response({"notifications": [notification], "truncated": False})
            events.append("ack")
            payload = json.loads(request.data.decode("utf-8"))
            self.assertEqual(payload["notification_keys"], [notification["notification_key"]])
            return _Response({"acknowledged": 1})

        def sender(**kwargs):
            events.append("send")
            sent.append(kwargs)
            return {"ok": True}

        count = self.module.process(
            endpoint="https://plate.hk/api/internal/broker_notifications",
            broker_token="broker-token",
            telegram_token="telegram-token",
            telegram_chat_id="1234",
            opener=opener,
            sender=sender,
        )

        self.assertEqual(count, 1)
        self.assertEqual(len(sent), 1)
        self.assertEqual(len(requests), 2)
        self.assertTrue(requests[0].get_header("Authorization").startswith("Bearer "))
        self.assertEqual(requests[1].method, "POST")
        self.assertEqual(events, ["get", "send", "ack"])

    def test_sender_failure_leaves_notification_unacknowledged(self):
        notification = {
            "notification_key": "broker-notification:2026-08-12T00:00:00Z:11111111-1111-1111-1111-111111111111",
            "inquiry_id": "11111111-1111-1111-1111-111111111111",
            "plate": "HK88",
            "budget_hkd": 880000,
            "contact_method": "email",
            "created_at": "2026-08-12T00:00:00Z",
        }
        methods = []

        def opener(request, timeout):
            methods.append(request.method)
            return _Response({"notifications": [notification], "truncated": False})

        def sender(**kwargs):
            raise RuntimeError("Telegram unavailable")

        with self.assertRaisesRegex(RuntimeError, "Telegram unavailable"):
            self.module.process(
                endpoint="https://plate.hk/api/internal/broker_notifications",
                broker_token="broker-token",
                telegram_token="telegram-token",
                telegram_chat_id="1234",
                opener=opener,
                sender=sender,
            )
        self.assertEqual(methods, ["GET"])

    def test_process_does_not_send_when_queue_is_empty(self):
        def opener(request, timeout):
            return _Response({"notifications": [], "truncated": False})

        def sender(**kwargs):
            self.fail("sender should not be called")

        count = self.module.process(
            endpoint="https://plate.hk/api/internal/broker_notifications",
            broker_token="broker-token",
            telegram_token="telegram-token",
            telegram_chat_id="1234",
            opener=opener,
            sender=sender,
        )

        self.assertEqual(count, 0)

    def test_process_batches_before_telegram_message_limit(self):
        notifications = []
        for index in range(11):
            inquiry_id = f"{index:08d}-1111-1111-1111-111111111111"
            notifications.append(
                {
                    "notification_key": f"broker-notification:2026-08-12T00:00:{index:02d}Z:{inquiry_id}",
                    "inquiry_id": inquiry_id,
                    "plate": f"HK{index}",
                    "budget_hkd": 100000 + index,
                    "contact_method": "email",
                    "created_at": f"2026-08-12T00:00:{index:02d}Z",
                }
            )
        sent = []
        acknowledgements = []

        def opener(request, timeout):
            if request.method == "GET":
                return _Response({"notifications": notifications, "truncated": False})
            keys = json.loads(request.data.decode("utf-8"))["notification_keys"]
            acknowledgements.append(keys)
            return _Response({"acknowledged": len(keys)})

        count = self.module.process(
            endpoint="https://plate.hk/api/internal/broker_notifications",
            broker_token="broker-token",
            telegram_token="telegram-token",
            telegram_chat_id="1234",
            opener=opener,
            sender=lambda **kwargs: sent.append(kwargs),
        )

        self.assertEqual(count, 11)
        self.assertEqual([len(batch) for batch in acknowledgements], [10, 1])
        self.assertEqual(len(sent), 2)


if __name__ == "__main__":
    unittest.main()
