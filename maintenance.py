"""Private diagnostics and consistent SQLite backups; never prints credentials."""
from __future__ import annotations
import argparse
from datetime import datetime,timezone
import json
import os
import sqlite3
from pathlib import Path
import urllib.error
import urllib.request
from operator_auth import load_key
from shared_queue import SharedQueue

ROOT=Path(__file__).resolve().parent


def diagnose(root=ROOT,port=8765):
    result={'python_files':all((root/name).is_file() for name in ('server.py','shared_queue.py','catalog.json')),'server':'offline','operator_settings':(root/'.runtime/operator-connection.json').is_file(),'extension_built':(root/'artifacts/operator-extension/manifest.json').is_file()}
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health',timeout=3) as response:health=json.load(response)
        if health.get('application')!='forest-seat':result['server']='different_application';return result
        result['server']='online'
        if not (root/'.runtime/operator.key').exists() and not os.environ.get('FOREST_OPERATOR_KEY'):result['operator_auth']='not_prepared';return result
        request=urllib.request.Request(f'http://127.0.0.1:{port}/api/operator/health',headers={'Authorization':'Bearer '+load_key(root),'X-Collector-ID':'diagnostic_probe'})
        with urllib.request.urlopen(request,timeout=3) as response:operator=json.load(response)
        result.update(operator_auth='ok',collection={key:operator.get(key) for key in ('storage','collector_online','observed_facilities','work')})
    except urllib.error.HTTPError as error:result['operator_auth']='rejected' if error.code==403 else 'unavailable'
    except (OSError,ValueError):
        if result['server']=='online':result['operator_auth']='unavailable'
    return result


def backup(root=ROOT):
    source=root/'.runtime/shared.sqlite3'
    if not source.is_file():raise ValueError('No shared database exists yet')
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    return SharedQueue(source).backup(root/'.runtime/backups'/f'shared-{stamp}.sqlite3')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=('doctor','backup'));parser.add_argument('--port',type=int,default=8765);args=parser.parse_args()
    try:print(json.dumps(diagnose(port=args.port),ensure_ascii=False,indent=2) if args.action=='doctor' else 'Private database backup: '+str(backup()))
    except (OSError,ValueError,sqlite3.Error) as error:parser.exit(1,'Maintenance failed: '+type(error).__name__+'\n')
