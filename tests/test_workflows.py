from __future__ import annotations

import random
import subprocess
import time
import unittest
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class WorkflowTests(unittest.TestCase):
    def test_run_local_serves_root_without_db_health_dependency(self) -> None:
        port = random.randint(18080, 18999)
        try:
            proc = subprocess.run(
                ["bash", "scripts/run_local.sh", str(port)],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
                timeout=20,
            )
            self.assertIn(f"http://127.0.0.1:{port}", proc.stdout)
            time.sleep(1)
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=10) as resp:
                body = resp.read(256).decode("utf-8", errors="replace")
            self.assertEqual(resp.status, 200)
            self.assertIn("<!doctype html>", body.lower())
        finally:
            subprocess.run(["bash", "scripts/stop_local.sh", str(port)], cwd=ROOT, check=False, capture_output=True, text=True)

    def test_package_release_contains_core_outputs(self) -> None:
        out = ROOT / ".tmp" / "releases" / "test-release.tar.gz"
        if out.exists():
            out.unlink()
        proc = subprocess.run(
            ["bash", "scripts/package_release.sh", "--smoke", str(out)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=20,
        )
        self.assertTrue(out.exists(), proc.stdout + proc.stderr)
        listing = subprocess.run(
            ["tar", "-tzf", str(out)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=20,
        ).stdout
        self.assertIn("index.html", listing)
        self.assertIn("api/v1/index.json", listing)
        self.assertIn("data/all.search.meta.json", listing)
        self.assertIn("data/all.prefix1.top200.json", listing)
        self.assertIn("data/all.tvrm_legacy_overlap.json", listing)

    def test_release_ready_script_runs(self) -> None:
        proc = subprocess.run(
            ["bash", "scripts/release_ready.sh", "--fast"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        self.assertIn("Release checklist", proc.stdout)
        self.assertIn("Smoke package:", proc.stdout)


if __name__ == "__main__":
    unittest.main()
