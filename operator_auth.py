"""Persistent local operator credentials; never exposed by the public web API."""
from __future__ import annotations
import os
from pathlib import Path
import secrets
import re
import threading
import urllib.parse


_key_lock=threading.Lock()


def load_key(root: Path):
    with _key_lock:return _load_key(root)


def _load_key(root: Path):
    configured=os.environ.get('FOREST_OPERATOR_KEY')
    if configured:
        if not re.fullmatch(r'[a-zA-Z0-9_-]{32,200}',configured):raise ValueError('Invalid operator key configuration')
        return configured
    path=Path(root)/'.runtime'/'operator.key'
    path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists():
        try:
            with path.open('x',encoding='utf-8') as file:file.write(secrets.token_urlsafe(36))
            if os.name!='nt':path.chmod(0o600)
        except FileExistsError:pass
    key=path.read_text(encoding='utf-8').strip()
    if not re.fullmatch(r'[a-zA-Z0-9_-]{32,200}',key):raise ValueError('Invalid saved operator key')
    return key


def server_origin(value):
    url=urllib.parse.urlsplit(value)
    if url.username or url.password or url.query or url.fragment or url.path not in ('','/') or not url.hostname:
        raise ValueError('Use only a server origin, without credentials or a path')
    if url.scheme!='https' and not (url.scheme=='http' and url.hostname in ('127.0.0.1','localhost')):
        raise ValueError('HTTPS is required except on loopback')
    if url.port is not None and not 1<=url.port<=65535:raise ValueError('Invalid server port')
    if not re.fullmatch(r'[a-zA-Z0-9.-]+',url.hostname):raise ValueError('Invalid server hostname')
    return urllib.parse.urlunsplit((url.scheme,url.netloc,'','',''))
