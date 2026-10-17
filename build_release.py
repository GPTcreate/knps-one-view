"""Package only explicitly allowed project files; never include local sessions."""
from __future__ import annotations
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent
FILES = (
    'index.html', 'styles.css', 'app.js', 'core.js', 'transport.js', 'catalog.json',
    'camps_meta.json', 'availability.json', 'server.py', 'scraper_real.py',
    'launcher.py', 'start.cmd', 'refresh_catalog.py', 'build_release.py',
    'README.md', 'package.json', 'package-lock.json', '.gitignore',
    'docs/1.0-review.md', 'docs/1.0-validation.md',
    'browser-bridge/README.md', 'browser-bridge/manifest.json',
    'browser-bridge/background.js', 'browser-bridge/content.js',
    'browser-bridge/extractor.js',
    'tests/app.test.js', 'tests/bridge-flow.test.js', 'tests/core.test.js',
    'tests/extractor.test.js', 'tests/grid.test.js', 'tests/extension.test.js',
    'tests/test_bridge.py', 'tests/test_collector.py',
    'tests/test_maintenance.py', 'tests/test_server.py',
    '.github/workflows/check.yml', '.github/workflows/scrape.yml',
    'build_extension.py', 'extension/manifest.json', 'extension/background.js',
    'extension/content.js', 'extension/observation.js', 'extension/transport.js',
    'extension/privacy.html', 'extension/icons/icon16.png', 'extension/icons/icon32.png',
    'extension/icons/icon48.png', 'extension/icons/icon128.png',
    'docs/two-tracks.md', 'docs/api/findings.md', 'docs/api/inquiry.txt', 'docs/api/usage-plan.txt',
    'docs/api/official-forms/디지털서비스수요기관신청서.hwp',
    'docs/api/official-forms/개인정보수집이용동의서.hwp',
    'docs/api/official-forms/디지털서비스이용계획서.hwp',
    'docs/chrome-store/listing.txt', 'docs/chrome-store/review-notes.txt', 'docs/chrome-store/release.md',
)


def build():
    contents = {}
    for name in FILES:
        file = ROOT / name
        if file.is_symlink() or not file.is_file():
            raise ValueError(f'Missing or unsafe release input: {name}')
        contents[name] = file.read_bytes()
    manifest = {
        'version': '1.0.0-web-preview',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'release_status': 'Official web API approval and standalone extension installation/store review are pending',
        'sha256': {name: hashlib.sha256(data).hexdigest() for name, data in contents.items()},
    }
    output = ROOT / 'artifacts'
    output.mkdir(exist_ok=True)
    archive = output / 'forest-seat-web-preview.zip'
    temporary = archive.with_suffix('.zip.tmp')
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
            for name, data in contents.items():
                bundle.writestr('forest-seat/' + name, data)
            bundle.writestr('forest-seat/release-manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
        with zipfile.ZipFile(temporary) as bundle:
            if bundle.testzip() is not None:
                raise ValueError('Archive integrity check failed')
        temporary.replace(archive)
    finally:
        temporary.unlink(missing_ok=True)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n', encoding='utf-8')
    return archive, len(contents)


if __name__ == '__main__':
    archive, count = build()
    print(f'Created {archive} ({count} project files + manifest)')
