from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.configure_github_ops_secrets import (
    ConfigurationError,
    load_env_file,
    upload_secrets,
    validate_values,
)


class ConfigureGitHubOpsSecretsTests(unittest.TestCase):
    def write_env(self, content: str, *, mode: int = 0o600) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "platehk-ops.env"
        path.write_text(content, encoding="utf-8")
        os.chmod(path, mode)
        return path

    def test_loads_only_known_values_from_private_file(self) -> None:
        path = self.write_env(
            "# private\n"
            "OPENAI_API_KEY=custom-key\n"
            "OPENAI_RESPONSES_API_ENDPOINT=https://llm.example/v1/responses\n"
            "TELEGRAM_CHAT_ID=-100123\n"
        )

        values = validate_values(load_env_file(path))

        self.assertEqual(values["OPENAI_API_KEY"], "custom-key")
        self.assertEqual(values["TELEGRAM_CHAT_ID"], "-100123")

    def test_rejects_chat_completions_url_and_open_permissions(self) -> None:
        insecure = self.write_env("TELEGRAM_CHAT_ID=123\n", mode=0o644)
        with self.assertRaisesRegex(ConfigurationError, "chmod 600"):
            load_env_file(insecure)

        with self.assertRaisesRegex(ConfigurationError, "ending in /responses"):
            validate_values(
                {
                    "OPENAI_API_KEY": "custom-key",
                    "OPENAI_RESPONSES_API_ENDPOINT": "https://llm.example/v1/chat/completions",
                }
            )

    def test_upload_uses_stdin_and_never_places_secrets_in_arguments(self) -> None:
        calls: list[tuple[list[str], str | None]] = []

        def fake_runner(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
            calls.append((command, kwargs.get("input") if isinstance(kwargs.get("input"), str) else None))
            return subprocess.CompletedProcess(command, 0)

        secret = "sensitive-custom-key"
        uploaded = upload_secrets(
            {"OPENAI_API_KEY": secret},
            repository="owner/repo",
            runner=fake_runner,
        )

        self.assertEqual(uploaded, ["OPENAI_API_KEY"])
        self.assertEqual(calls[1][1], secret)
        self.assertNotIn(secret, " ".join(calls[1][0]))
        self.assertNotIn("--body", calls[1][0])


if __name__ == "__main__":
    unittest.main()
