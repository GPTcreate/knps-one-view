"""Start the local review app without changing browser or service settings."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parent


def health(port):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health',timeout=1) as response:
            result=json.load(response)
            return result if result.get('application')=='forest-seat' else None
    except (OSError,ValueError,urllib.error.URLError):
        return None


def start(port=8765,open_browser=True):
    if sys.version_info<(3,10):
        raise RuntimeError('Python 3.10 or later is required.')
    address=f'http://127.0.0.1:{port}'
    if not health(port):
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1',port))==0:
                raise RuntimeError(f'Port {port} is used by another program. No process was changed.')
        runtime=ROOT/'.runtime';runtime.mkdir(exist_ok=True)
        with (runtime/'server.log').open('ab') as log:
            process=subprocess.Popen([sys.executable,str(ROOT/'server.py'),'--port',str(port)],cwd=ROOT,stdin=subprocess.DEVNULL,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0,start_new_session=os.name!='nt')
        for _ in range(80):
            if health(port):break
            if process.poll() is not None:raise RuntimeError('Server failed to start. See .runtime/server.log.')
            time.sleep(.1)
        else:
            process.terminate()
            raise RuntimeError('Server startup timed out. See .runtime/server.log.')
    if open_browser:
        import webbrowser
        webbrowser.open(address)
    return address


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    try:print(start(args.port,not args.no_browser))
    except RuntimeError as error:print(str(error),file=sys.stderr);sys.exit(1)
