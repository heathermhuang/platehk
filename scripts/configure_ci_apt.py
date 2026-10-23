"""Use the Ubuntu HTTPS archive for direct sources and runner mirror lists."""
from __future__ import annotations

from pathlib import Path

ARCHIVE = 'https://archive.ubuntu.com/ubuntu'
AZURE_MIRRORS = ('http://azure.archive.ubuntu.com/ubuntu', 'https://azure.archive.ubuntu.com/ubuntu')


def configure_apt(root: Path = Path('/etc/apt')) -> int:
    if not root.is_dir():
        raise FileNotFoundError('APT configuration directory is missing')
    sources = [root / 'sources.list', *(root / 'sources.list.d').glob('*'), *root.glob('*mirrors*.txt')]
    changed = 0
    for path in sources:
        if not path.is_file() or path.suffix not in ('.list', '.sources', '.txt'):
            continue
        original = text = path.read_text()
        for mirror in AZURE_MIRRORS:
            text = text.replace(mirror, ARCHIVE)
        if text != original:
            path.write_text(text)
            changed += 1
    configuration = root / 'apt.conf.d'
    configuration.mkdir(exist_ok=True)
    (configuration / '80ci-network-timeouts').write_text(
        'Acquire::http::Timeout "30";\nAcquire::https::Timeout "30";\nAcquire::Retries "2";\n')
    return changed


if __name__ == '__main__':
    print(f'Configured bounded apt downloads; updated {configure_apt()} source or mirror-list files.')
