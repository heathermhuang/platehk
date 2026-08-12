from __future__ import annotations

import json
import os
import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "check_cloudflare_worker_secrets.mjs"


def json_loads(output: str) -> dict[str, object]:
    return json.loads(output)


class CloudflareSecretCheckTests(unittest.TestCase):
    def inspect_secret_output(self, stdout: str) -> dict[str, object]:
        env = {
            **os.environ,
            "SECRET_CHECK_OUTPUT": stdout,
        }
        result = subprocess.run(
            [
                "node",
                "--input-type=module",
                "--eval",
                (
                    "import { missingRequiredSecrets, parseSecretNames } "
                    "from './scripts/check_cloudflare_worker_secrets.mjs';"
                    "const output = process.env.SECRET_CHECK_OUTPUT || '';"
                    "console.log(JSON.stringify({"
                    "names: [...parseSecretNames(output)].sort(),"
                    "missing: missingRequiredSecrets(output)"
                    "}));"
                ),
            ],
            cwd=ROOT,
            env=env,
            check=False,
            encoding="utf-8",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json_loads(result.stdout)

    @unittest.skipUnless(shutil.which("node"), "node is not available")
    def test_accepts_clean_json_secret_list(self) -> None:
        result = self.inspect_secret_output(
            '[{"name":"OPENAI_API_KEY","type":"secret_text"}]'
        )

        self.assertIn("OPENAI_API_KEY", result["names"])
        self.assertEqual(result["missing"], [])

    @unittest.skipUnless(shutil.which("node"), "node is not available")
    def test_accepts_noisy_wrangler_json_output(self) -> None:
        result = self.inspect_secret_output(
            """
            wrangler 4.x
            Listing secrets for platehk-cloudflare-worker
            [{"name":"OPENAI_API_KEY","type":"secret_text"}]
            """
        )

        self.assertIn("OPENAI_API_KEY", result["names"])
        self.assertEqual(result["missing"], [])

    @unittest.skipUnless(shutil.which("node"), "node is not available")
    def test_accepts_table_output_when_secret_name_is_visible(self) -> None:
        result = self.inspect_secret_output(
            """
            Name
            OPENAI_API_KEY
            """
        )

        self.assertIn("OPENAI_API_KEY", result["names"])
        self.assertEqual(result["missing"], [])

    @unittest.skipUnless(shutil.which("node"), "node is not available")
    def test_fails_when_required_secret_is_missing(self) -> None:
        result = self.inspect_secret_output('[{"name":"OTHER_SECRET","type":"secret_text"}]')

        self.assertNotIn("OPENAI_API_KEY", result["names"])
        self.assertEqual(result["missing"], ["OPENAI_API_KEY"])


if __name__ == "__main__":
    unittest.main()
