from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from configure_ci_apt import configure_apt


class CiAptTests(unittest.TestCase):
    def test_runner_mirror_indirection_uses_https_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sources = root / 'sources.list.d'
            sources.mkdir()
            indirect = sources / 'ubuntu.sources'
            indirect.write_text('Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-security\n')
            mirrors = root / 'apt-mirrors.txt'
            mirrors.write_text('http://azure.archive.ubuntu.com/ubuntu/ priority:1\nhttps://archive.ubuntu.com/ubuntu/ priority:2\n')
            self.assertEqual(configure_apt(root), 1)
            self.assertIn('mirror+file:/etc/apt/apt-mirrors.txt', indirect.read_text())
            self.assertNotIn('azure.archive', mirrors.read_text())
            self.assertIn('https://archive.ubuntu.com/ubuntu/ priority:1', mirrors.read_text())
            self.assertIn('Acquire::https::Timeout "30";', (root / 'apt.conf.d/80ci-network-timeouts').read_text())

    def test_direct_sources_and_security_mirrors_preserve_unrelated_repositories(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'sources.list.d').mkdir()
            direct = root / 'sources.list'
            direct.write_text('deb https://azure.archive.ubuntu.com/ubuntu noble main\n')
            microsoft = root / 'sources.list.d/microsoft.list'
            original = 'deb https://packages.microsoft.com/ubuntu/24.04/prod noble main\n'
            microsoft.write_text(original)
            security = root / 'security-mirrors.txt'
            security.write_text('http://azure.archive.ubuntu.com/ubuntu\n')
            self.assertEqual(configure_apt(root), 2)
            self.assertEqual(direct.read_text(), 'deb https://archive.ubuntu.com/ubuntu noble main\n')
            self.assertEqual(security.read_text(), 'https://archive.ubuntu.com/ubuntu\n')
            self.assertEqual(microsoft.read_text(), original)
            self.assertEqual(configure_apt(root), 0)

    def test_ci_calls_the_mirror_setup_before_installing_browsers(self):
        workflow = (Path(__file__).resolve().parents[1] / '.github/workflows/security.yml').read_text()
        self.assertLess(workflow.index('sudo python3 scripts/configure_ci_apt.py'), workflow.index('run: npx playwright install --with-deps'))
        self.assertIn('timeout-minutes: 10', workflow)
