"""Official public KNPS snapshot collector. Failed samples never become zero slots."""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
CAMP_URL = 'https://reservation.knps.or.kr/reservation/campsiteList.do'
BOOKING_URL = 'https://reservation.knps.or.kr/reservation/searchSimpleCampReservation.do'
REGIONS = {'설악산':'강원','오대산':'강원','치악산':'강원','태백산':'강원','북한산':'서울/인천/경기','월악산':'충북','소백산':'충북','계룡산':'대전/충남','태안해안':'대전/충남','가야산':'대구/경북','주왕산':'대구/경북','팔공산':'대구/경북','한려해상':'부산/경남'}


def atomic_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False, suffix='.tmp') as f:
        temporary = Path(f.name)
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
        f.flush()
        os.fsync(f.fileno())
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


class IconParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.attrs = None
    def handle_starttag(self, tag, attrs):
        if tag == 'i':
            self.attrs = dict(attrs)


def parse_campsite(html: str) -> list[dict]:
    rooms = {}
    # Limit parsing to availability icons; full pages contain tens of MB of tables.
    for match in re.finditer(r'<i\b[^>]*\btitle\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27)[^>]*>', html, re.I):
        parser = IconParser()
        parser.feed(match.group())
        attrs = parser.attrs or {}
        title = re.fullmatch(r'(.+?)\s*:\s*(\d{4}-\d{2}-\d{2})\s*', attrs.get('title', ''))
        if not title:
            continue
        name, day = title.groups()
        try:
            datetime.strptime(day, '%Y-%m-%d')
        except ValueError:
            continue
        name = unescape(name).strip()
        classes = set(attrs.get('class', '').split())
        tokens = {'icon-reservation':'available','icon-none-reservation':'full','icon-waiting':'waitlist','icon-end':'closed'}
        states = {tokens[c] for c in classes if c in tokens}
        status = {'state': next(iter(states)) if len(states) == 1 else 'unknown'}
        rid = hashlib.sha256(name.encode()).hexdigest()[:16]
        room_type = '카라반' if '카라반' in name else '산막·하우스' if any(x in name for x in ('산막','하우스','카바나')) else '데크' if '데크' in name else '야영 영지'
        room = rooms.setdefault(rid, {'id':rid,'name':name,'type':room_type,'capacity':None,'days':{}})
        existing = room['days'].get(day)
        room['days'][day] = {'state':'unknown'} if existing and existing != status else status
    return list(rooms.values())


def collect_one(meta: dict) -> dict:
    data = urllib.parse.urlencode({'dept_id':meta['dept_id'],'dept_name':meta['camp_name'],'parent_dept_name':meta['park_name'],'prd_ctg_id':meta.get('prd_id',''),'isGreenpoint':'N'}).encode()
    request = urllib.request.Request(CAMP_URL, data=data, headers={'User-Agent':'Mozilla/5.0','Referer':BOOKING_URL,'X-Requested-With':'XMLHttpRequest'})
    with urllib.request.urlopen(request, timeout=25) as response:
        raw = response.read(40 * 1024 * 1024 + 1)
        if len(raw) > 40 * 1024 * 1024:
            raise ValueError('response too large')
        html = raw.decode(response.headers.get_content_charset() or 'utf-8', errors='strict')
    rooms = parse_campsite(html)
    if not rooms:
        raise ValueError('no validated room/date statuses')
    return {'id':meta['dept_id'],'service':'knps','name':meta['camp_name']+' 야영장','park':meta['park_name'],'region':REGIONS.get(meta['park_name'],'전라'),'operator':'국립공원','url':BOOKING_URL,'checked_at':datetime.now(timezone.utc).isoformat(),'rooms':rooms}


def run_scraper(limit: int | None = None, output: Path | None = None, progress=None) -> dict:
    output = output or ROOT / 'availability.json'
    meta = json.loads((ROOT/'camps_meta.json').read_text(encoding='utf-8-sig'))
    if limit:
        meta = meta[:limit]
    previous = json.loads(output.read_text(encoding='utf-8-sig')) if output.exists() else {'items':[],'sources':{}}
    existing = {x['id']:x for x in previous.get('items',[]) if x.get('service')=='knps'}
    failures = []
    success = 0
    started = time.monotonic()
    def throttled(item):
        time.sleep(.4)
        return collect_one(item)
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {executor.submit(throttled,item):item for item in meta}
        for future in as_completed(futures):
            item = futures[future]
            try:
                existing[item['dept_id']] = future.result()
                success += 1
                print('OK',item['dept_id'],flush=True)
            except Exception as error:
                failures.append({'id':item['dept_id'],'reason':type(error).__name__})
                print('FAILED',item['dept_id'],type(error).__name__,flush=True)
            if progress:
                progress(success+len(failures),len(meta))
    if not success:
        raise RuntimeError('All upstream requests failed; previous snapshot was preserved')
    sources = dict(previous.get('sources',{}))
    sources.setdefault('forest',{'state':'login_required','message':'숲나들e 로그인 연결 후 실제 현황을 확인할 수 있습니다.'})
    sources['knps'] = {'state':'partial' if failures else 'ready','checked_at':datetime.now(timezone.utc).isoformat(),'success':success,'requested':len(meta),'failures':failures,'message':f'{success}/{len(meta)}곳 수집. 실패한 시설은 이전 확인 시각을 유지합니다.'}
    result = {'schema_version':1,'items':[x for x in previous.get('items',[]) if x.get('service')!='knps']+list(existing.values()),'sources':sources}
    atomic_json(output,result)
    print(f'Saved {success}/{len(meta)} camps in {time.monotonic()-started:.1f}s',flush=True)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('limit',nargs='?',type=int)
    args=parser.parse_args()
    run_scraper(args.limit)
