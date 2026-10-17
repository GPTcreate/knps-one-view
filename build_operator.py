"""Build a separate private collector, with one fixed upload destination and no key."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile
from operator_auth import server_origin

ROOT=Path(__file__).resolve().parent


def build(origin='http://127.0.0.1:8765'):
    origin=server_origin(origin)
    files={name:(ROOT/'operator'/name).read_bytes() for name in ('index.html','background.js','ui.js')}
    files['styles.css']=(ROOT/'styles.css').read_bytes()
    files['observation.js']=(ROOT/'extension'/'observation.js').read_bytes()
    files['extractor.js']=(ROOT/'browser-bridge'/'extractor.js').read_bytes()
    content=(ROOT/'extension'/'content.js').read_text(encoding='utf-8').replace('forest-extension','forest-operator').replace('forest-seat-extension-panel','forest-seat-operator-panel').replace('숲자리 확장 조회','숲자리 운영자 수집')
    files['content.js']=content.encode('utf-8')
    files['operator-config.js']=('const FOREST_OPERATOR_ORIGIN = '+json.dumps(origin)+';\n').encode('utf-8')
    manifest=json.loads((ROOT/'extension'/'manifest.json').read_text(encoding='utf-8'))
    manifest.update(name='숲자리 운영자 수집기',description='웹 갱신 요청을 공식 월별 화면에서 확인해 지정된 공유 서버에 전달하는 운영자 전용 도구입니다.')
    manifest['host_permissions']=['https://www.foresttrip.go.kr/*',origin+'/*']
    manifest['action']['default_title']='숲자리 운영자 수집기'
    files['manifest.json']=json.dumps(manifest,ensure_ascii=False,indent=2).encode('utf-8')
    for size in (16,32,48,128):files[f'icons/icon{size}.png']=(ROOT/'extension'/f'icons/icon{size}.png').read_bytes()
    folder=ROOT/'artifacts'/'operator-extension';folder.mkdir(parents=True,exist_ok=True)
    for existing in folder.rglob('*'):
        if existing.is_file() and existing.relative_to(folder).as_posix() not in files:
            raise ValueError('Unexpected file in private operator folder: '+str(existing))
    for name,data in files.items():
        path=folder/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    archive=folder.parent/'forest-seat-operator-1.0.0.zip'
    temporary=archive.with_suffix('.zip.tmp')
    try:
        with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED) as bundle:
            for name,data in sorted(files.items()):bundle.writestr(name,data)
        with zipfile.ZipFile(temporary) as bundle:assert bundle.testzip() is None
        temporary.replace(archive)
    finally:temporary.unlink(missing_ok=True)
    archive.with_suffix('.zip.sha256').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n',encoding='utf-8')
    return archive


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--server',default='http://127.0.0.1:8765');args=parser.parse_args()
    print('Created '+str(build(args.server)))
