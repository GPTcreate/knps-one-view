"""Prepare the private collector without installing it or exposing keys."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import urllib.error
import urllib.request
import webbrowser
import launcher
import operator_setup
import build_operator

ROOT=Path(__file__).resolve().parent


def prepare(port=8765,open_browser=True):
    origin=launcher.start(port,open_browser=False)
    settings=operator_setup.prepare(ROOT,origin)
    token=json.loads(settings.read_text(encoding='utf-8'))['token']
    request=urllib.request.Request(origin+'/api/operator/health',headers={'Authorization':'Bearer '+token,'X-Collector-ID':'setup_probe'})
    try:
        with urllib.request.urlopen(request,timeout=5) as response:
            health=json.load(response)
            if health.get('ok') is not True or health.get('storage')!='ok':raise ValueError('Operator server needs update')
    except (OSError,ValueError,urllib.error.URLError) as error:
        raise RuntimeError('The running server does not match this folder or is outdated. Close that server and start this folder again; no process was changed.') from error
    archive=build_operator.build(origin)
    if open_browser:webbrowser.open(origin)
    return {'web':origin,'extension_folder':str(archive.parent/'operator-extension'),'connection_file':str(settings),'guide':str(ROOT/'docs'/'operator-guide.md')}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765);parser.add_argument('--no-browser',action='store_true');args=parser.parse_args()
    try:
        result=prepare(args.port,not args.no_browser)
        print('Operator preparation complete. Chrome installation and official login remain manual.')
        for name,value in result.items():print(f'{name}: {value}')
    except (RuntimeError,OSError,ValueError) as error:parser.exit(1,str(error)+'\n')
