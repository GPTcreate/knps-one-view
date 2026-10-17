"""Write a private connection file for the operator extension without printing its key."""
from pathlib import Path
import argparse
import json
import os
from operator_auth import load_key,server_origin
from scraper_real import atomic_json

ROOT=Path(__file__).resolve().parent


def prepare(root=ROOT,origin='http://127.0.0.1:8765'):
    origin=server_origin(origin)
    path=Path(root)/'.runtime'/'operator-connection.json'
    atomic_json(path,{'server_url':origin,'token':load_key(Path(root))})
    if os.name!='nt':path.chmod(0o600)
    return path


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--server',default='http://127.0.0.1:8765');args=parser.parse_args()
    print('Private operator connection file: '+str(prepare(origin=args.server)))
