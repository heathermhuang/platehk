from __future__ import annotations

import datetime as dt
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "scrape_28car_market.py"


def load_module():
    spec = importlib.util.spec_from_file_location("scrape_28car_market", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load scrape_28car_market.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


market = load_module()


def load_page_builder():
    script = ROOT / "scripts" / "build_popular_plate_pages.py"
    spec = importlib.util.spec_from_file_location("build_popular_plate_pages_market_test", script)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load build_popular_plate_pages.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MarketSignalTests(unittest.TestCase):
    def test_parser_extracts_only_allowlisted_market_signals(self) -> None:
        source = (ROOT / "tests" / "fixtures" / "28car_listing_page.html").read_text(encoding="utf-8")
        total_pages, signals = market.parse_page(source)

        self.assertEqual(total_pages, 3)
        self.assertEqual(len(signals), 2)
        self.assertEqual(signals[0].plate_norm, "ZZ123")
        self.assertEqual(signals[0].asking_price_hkd, 88000)
        self.assertEqual(signals[0].price_type, "fixed")
        self.assertEqual(signals[1].plate_norm, "AB8")
        self.assertIsNone(signals[1].asking_price_hkd)
        self.assertEqual(signals[1].price_type, "contact")

        serialized = json.dumps([signal.__dict__ for signal in signals])
        self.assertNotIn("Example seller", serialized)
        self.assertNotIn("00000000", serialized)
        self.assertNotIn("description", serialized)

    def test_partial_refresh_retains_only_recent_previous_signals(self) -> None:
        now = dt.datetime(2026, 8, 11, 12, 0, tzinfo=dt.timezone.utc)
        existing = {
            "signals": {
                "ZZ1": [{
                    "listing_id": "n10",
                    "source_url": market.DETAIL_URL.format(vid="10"),
                    "price_type": "fixed",
                    "asking_price_hkd": 10000,
                    "first_seen_at": "2026-08-10T12:00:00Z",
                    "last_seen_at": "2026-08-11T11:00:00Z",
                }],
                "YY1": [{
                    "listing_id": "n11",
                    "source_url": market.DETAIL_URL.format(vid="11"),
                    "price_type": "contact",
                    "asking_price_hkd": None,
                    "first_seen_at": "2026-08-01T12:00:00Z",
                    "last_seen_at": "2026-08-01T12:00:00Z",
                }],
            }
        }
        fresh = market.ListingSignal("NEW8", "n12", market.DETAIL_URL.format(vid="12"), "fixed", 80000)

        payload = market.build_payload(
            [fresh],
            existing,
            scraped_at=now,
            requested_pages=[1],
            successful_pages=[1],
            failed_pages=[],
            total_pages=3,
            stale_hours=72,
        )

        self.assertFalse(payload["coverage"]["complete"])
        self.assertIn("ZZ1", payload["signals"])
        self.assertIn("NEW8", payload["signals"])
        self.assertNotIn("YY1", payload["signals"])
        market.validate_payload(payload)

    def test_complete_refresh_drops_unseen_previous_signals(self) -> None:
        now = dt.datetime(2026, 8, 11, 12, 0, tzinfo=dt.timezone.utc)
        existing = {
            "signals": {
                "ZZ1": [{
                    "listing_id": "n10",
                    "source_url": market.DETAIL_URL.format(vid="10"),
                    "price_type": "fixed",
                    "asking_price_hkd": 10000,
                    "first_seen_at": "2026-08-10T12:00:00Z",
                    "last_seen_at": "2026-08-11T11:00:00Z",
                }],
            }
        }
        fresh = market.ListingSignal("NEW8", "n12", market.DETAIL_URL.format(vid="12"), "contact", None)

        payload = market.build_payload(
            [fresh],
            existing,
            scraped_at=now,
            requested_pages=[1, 2],
            successful_pages=[1, 2],
            failed_pages=[],
            total_pages=2,
            stale_hours=72,
        )

        self.assertTrue(payload["coverage"]["complete"])
        self.assertEqual(set(payload["signals"]), {"NEW8"})

    def test_full_or_required_refresh_rejects_any_failed_page(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "2 page\\(s\\) failed"):
            market.assert_refresh_publishable(max_pages=0, require_complete=False, failed_pages=[7, 9])
        with self.assertRaisesRegex(RuntimeError, "1 page\\(s\\) failed"):
            market.assert_refresh_publishable(max_pages=25, require_complete=True, failed_pages=[7])
        market.assert_refresh_publishable(max_pages=25, require_complete=False, failed_pages=[7])

    def test_generated_plate_card_requires_a_fresh_allowlisted_source(self) -> None:
        builder = load_page_builder()
        now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
        valid_offer = {
            "listing_id": "n12",
            "source_url": market.DETAIL_URL.format(vid="12"),
            "price_type": "fixed",
            "asking_price_hkd": 80000,
            "first_seen_at": market.isoformat(now),
            "last_seen_at": market.isoformat(now),
        }
        with tempfile.TemporaryDirectory() as tmp:
            signal_path = Path(tmp) / "signals.json"
            payload = {
                "schema_version": 1,
                "source": "28car",
                "fresh_for_hours": 72,
                "signals": {"NEW8": [valid_offer]},
            }
            signal_path.write_text(json.dumps(payload), encoding="utf-8")
            builder.MARKET_SIGNALS_PATH = signal_path
            builder._MARKET_SIGNALS = None
            html = builder.market_signal_html("NEW8")
            self.assertIn('data-market-card data-plate="NEW8"', html)
            self.assertIn("hidden", html)
            self.assertNotIn("HK$80,000", html)
            self.assertNotIn("m.28car.com", html)

            payload["signals"]["NEW8"][0]["last_seen_at"] = market.isoformat(now - dt.timedelta(hours=73))
            signal_path.write_text(json.dumps(payload), encoding="utf-8")
            builder._MARKET_SIGNALS = None
            self.assertEqual(builder.market_signal_html("NEW8"), "")

            payload["signals"]["NEW8"][0]["last_seen_at"] = market.isoformat(now)
            payload["signals"]["NEW8"][0]["source_url"] = "https://example.test/listing"
            signal_path.write_text(json.dumps(payload), encoding="utf-8")
            builder._MARKET_SIGNALS = None
            self.assertEqual(builder.market_signal_html("NEW8"), "")


if __name__ == "__main__":
    unittest.main()
