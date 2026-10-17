"""Build the standalone MV3 upload ZIP without sessions, localhost, or Python."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parent
SHARED=('index.html','styles.css','app.js','core.js','transport.js','catalog.json')
OWN=('manifest.json','background.js','content.js','observation.js','transport.js','privacy.html','icons/icon16.png','icons/icon32.png','icons/icon48.png','icons/icon128.png')


def build():
    output=ROOT/'artifacts'/'chrome-extension';output.mkdir(parents=True,exist_ok=True)
    files={name:(ROOT/name).read_bytes() for name in SHARED}
    files.update({name:(ROOT/'extension'/name).read_bytes() for name in OWN})
    files['extractor.js']=(ROOT/'browser-bridge'/'extractor.js').read_bytes()
    files['camps_meta.json']=b'[]\n'
    html=files['index.html'].decode('utf-8').replace('숲나들e · 국립공원 공식 현황 기준','숲나들e 공식 화면에서 직접 확인')
    files['index.html']=html.encode('utf-8')
    for existing in output.rglob('*'):
        if existing.is_file() and existing.relative_to(output).as_posix() not in files:
            raise ValueError('Unexpected file in unpacked extension folder: '+str(existing))
    manifest=json.loads(files['manifest.json'])
    assert manifest['permissions']==['storage']
    assert manifest['host_permissions']==['https://www.foresttrip.go.kr/*']
    for name,data in files.items():
        target=output/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    archive=output.parent/f"forest-seat-extension-{manifest['version']}.zip"
    temporary=archive.with_suffix('.zip.tmp')
    try:
        with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED) as bundle:
            for name,data in sorted(files.items()):bundle.writestr(name,data)
        with zipfile.ZipFile(temporary) as bundle:
            assert bundle.testzip() is None
            assert 'manifest.json' in bundle.namelist()
            assert not any('127.0.0.1' in permission or 'localhost' in permission for permission in manifest['host_permissions'])
        temporary.replace(archive)
    finally:temporary.unlink(missing_ok=True)
    archive.with_suffix('.zip.sha256').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n',encoding='utf-8')
    return archive,len(files)


if __name__=='__main__':
    archive,count=build();print(f'Created {archive} ({count} files); unpacked test folder: {archive.parent / "chrome-extension"}')
