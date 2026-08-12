from __future__ import annotations

import importlib.util
import json
import sys
import unittest
import urllib.error
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_module():
    spec = importlib.util.spec_from_file_location(
        "check_market_production",
        ROOT / "scripts" / "check_market_production.py",
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class Response:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class MarketProductionCheckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_module()

    def test_verify_matches_exact_api_and_requires_hidden_shard(self):
        source_url = "https://m.28car.com/num_dsp.php?h_vid=12"
        snapshot = {"signals": {"JZ": [{"source_url": source_url}]}}
        requested = []

        def opener(request, timeout):
            requested.append(request.full_url)
            if "/api/market_signal" in request.full_url:
                return Response({
                    "plate": "JZ",
                    "availability_detected": True,
                    "source": "28car",
                    "source_url": source_url,
                })
            raise urllib.error.HTTPError(request.full_url, 404, "Not found", {}, None)

        self.assertEqual(self.module.verify(snapshot, "https://plate.hk", opener=opener), "JZ")
        self.assertEqual(len(requested), 3)
        self.assertTrue(any("%5fmarket%2F" in url for url in requested))

    def test_verify_rejects_missing_exact_signal(self):
        snapshot = {"signals": {"JZ": [{"source_url": "https://m.28car.com/num_dsp.php?h_vid=12"}]}}

        def opener(request, timeout):
            return Response({"plate": "JZ", "availability_detected": False})

        with self.assertRaisesRegex(RuntimeError, "did not expose"):
            self.module.verify(snapshot, "https://plate.hk", opener=opener)
