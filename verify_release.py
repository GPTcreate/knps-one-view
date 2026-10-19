"""Verify the actual distribution ZIPs, not only their source builders."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path,PurePosixPath
import shutil
import struct
import subprocess
import tempfile
import zipfile
import build_release
import build_extension

ROOT=Path(__file__).resolve().parent


def verify_archive(archive,root=ROOT,syntax=False):
    archive=Path(archive)
    expected=archive.with_suffix('.zip.sha256').read_text(encoding='utf-8').split()[0]
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:raise ValueError('Archive checksum mismatch')
    private=[]
    key=root/'.runtime/operator.key'
    if key.is_file():private.append(key.read_bytes().strip())
    settings=root/'.runtime/operator-connection.json'
    if settings.is_file():private.append(json.loads(settings.read_text(encoding='utf-8'))['token'].encode())
    with zipfile.ZipFile(archive) as bundle:
        names=bundle.namelist()
        if any(chr(92) in info.orig_filename for info in bundle.infolist()):raise ValueError('Unsafe ZIP path')
        if len(names)!=len(set(names)) or bundle.testzip() is not None:raise ValueError('Duplicate or corrupt ZIP entry')
        for name in names:
            path=PurePosixPath(name)
            if path.is_absolute() or '..' in path.parts or chr(92) in name or ':' in name:raise ValueError('Unsafe ZIP path')
            if any(part in {'.runtime','.git','node_modules','.env'} for part in path.parts):raise ValueError('Private path in distribution')
            if any(value and value in bundle.read(name) for value in private):raise ValueError('Private operator credential in distribution')
        if archive.name=='forest-seat-web-preview.zip':
            expected_names={'forest-seat/'+name for name in build_release.FILES}|{'forest-seat/release-manifest.json'}
            if set(names)!=expected_names:raise ValueError('Unexpected web release files')
            manifest=json.loads(bundle.read('forest-seat/release-manifest.json'))
            if set(manifest['sha256'])!=set(build_release.FILES):raise ValueError('Incomplete release manifest')
            for name,digest in manifest['sha256'].items():
                data=bundle.read('forest-seat/'+name)
                if hashlib.sha256(data).hexdigest()!=digest or data!=(root/name).read_bytes():raise ValueError('Web ZIP differs from current source')
        else:
            manifest=json.loads(bundle.read('manifest.json'))
            if manifest['manifest_version']!=3 or manifest['permissions']!=['storage']:raise ValueError('Unexpected extension permissions')
            operator=archive.name.startswith('forest-seat-operator-')
            expected_names=({'index.html','background.js','ui.js','styles.css','observation.js','extractor.js','content.js','operator-config.js','manifest.json',*(f'icons/icon{size}.png' for size in (16,32,48,128))} if operator else set(build_extension.SHARED)|set(build_extension.OWN)|{'extractor.js','camps_meta.json'})
            if set(names)!=expected_names:raise ValueError('Unexpected extension release files')
            hosts=manifest['host_permissions']
            if not hosts or hosts[0]!='https://www.foresttrip.go.kr/*' or len(hosts)!=(2 if operator else 1):raise ValueError('Unexpected extension hosts')
            if operator:
                from operator_auth import server_origin
                origin=server_origin(hosts[1][:-2])
                if bundle.read('operator-config.js').decode()!='const FOREST_OPERATOR_ORIGIN = '+json.dumps(origin)+';\n':raise ValueError('Collector destination mismatch')
                if b'forest-operator' not in bundle.read('content.js'):raise ValueError('Collector uses wrong transport')
            else:
                for name in ('background.js','transport.js'):
                    if b'/api/operator/' in bundle.read(name) or b'127.0.0.1' in bundle.read(name):raise ValueError('Personal extension contains operator transport')
            references=[manifest['background']['service_worker'],*manifest['icons'].values()]
            for script in manifest['content_scripts']:references.extend(script['js'])
            for name in references:
                if name not in names:raise ValueError('Missing extension asset')
            for size in (16,32,48,128):
                data=bundle.read(f'icons/icon{size}.png')
                if data[:8]!=b'\x89PNG\r\n\x1a\n' or struct.unpack('>II',data[16:24])!=(size,size):raise ValueError('Invalid icon dimensions')
        if syntax:
            node=shutil.which('node')
            if not node:raise ValueError('Node is required for --syntax validation')
            with tempfile.TemporaryDirectory(prefix='forest-release-check-') as directory:
                bundle.extractall(directory)
                for name in names:
                    if name.endswith('.js'):subprocess.run([node,'--check',str(Path(directory)/name)],check=True,capture_output=True)
    return {'archive':archive.name,'files':len(names),'checksum':'ok','private_data':'excluded','syntax':'ok' if syntax else 'not_requested'}


def verify(root=ROOT,syntax=False):
    return [verify_archive(root/'artifacts'/name,root,syntax) for name in ('forest-seat-extension-1.0.0.zip','forest-seat-operator-1.0.0.zip','forest-seat-web-preview.zip')]


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--syntax',action='store_true');args=parser.parse_args()
    try:print(json.dumps(verify(syntax=args.syntax),ensure_ascii=False,indent=2))
    except (OSError,ValueError,KeyError,zipfile.BadZipFile,subprocess.CalledProcessError) as error:parser.exit(1,'Release verification failed: '+type(error).__name__+'\n')
