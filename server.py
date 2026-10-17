"""Loopback-only application server. Only explicit public artifacts are served."""
from __future__ import annotations
from datetime import datetime, timezone
import copy
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import json
from pathlib import Path
import secrets
import threading
import urllib.parse
from scraper_real import atomic_json, run_scraper

ROOT = Path(__file__).resolve().parent
STATIC = {'/':('index.html','text/html'),'/index.html':('index.html','text/html'),'/app.js':('app.js','text/javascript'),'/core.js':('core.js','text/javascript'),'/styles.css':('styles.css','text/css'),'/catalog.json':('catalog.json','application/json'),'/camps_meta.json':('camps_meta.json','application/json'),'/availability.json':('availability.json','application/json')}
job_lock=threading.Lock()
job={'state':'idle','done':0,'total':0}
bridge_token=secrets.token_urlsafe(32)
forest_lock=threading.Lock()
forest_job=None
forest_connected_at=None


def utcnow():
    return datetime.now(timezone.utc)


def job_public():
    """Called with forest_lock held. Results stay server-side and are idempotent."""
    if not forest_job:
        return None
    pending=forest_job['state']=='pending'
    created=forest_job.get('created_at')
    if pending and created:
        last=max(datetime.fromisoformat(created),forest_connected_at or datetime.fromisoformat(created))
        if (utcnow()-last).total_seconds()>120:
            forest_job.update(state='paused',message='공식 현황 연결이 끊겼습니다. 다시 연결한 뒤 새로 조회해 주세요.')
    return {k:copy.deepcopy(v) for k,v in forest_job.items() if k!='results'}


def update_job_counts():
    results=forest_job.get('results',{})
    forest_job.update(done=len(results),success=sum(v=='success' for v in results.values()),failed=sum(v=='failed' for v in results.values()))


def merge_forest_item(previous, current):
    """Keep older months with their own observation times, never refresh them by accident."""
    rooms={}
    for room in (previous or {}).get('rooms',[]):
        rooms[room['id']]={**room,'days':{day:{**status,'checked_at':status.get('checked_at') or previous['checked_at']} for day,status in room['days'].items()}}
    for room in current['rooms']:
        old=rooms.get(room['id'],{})
        days={**old.get('days',{}),**{day:{**status,'checked_at':current['checked_at']} for day,status in room['days'].items()}}
        rooms[room['id']]={**room,'days':days}
    return {**current,'rooms':list(rooms.values())}


def validate_forest_item(raw, facility):
    if not isinstance(raw,dict) or raw.get('id') != facility['id'] or not isinstance(raw.get('rooms'),list) or not 0 < len(raw['rooms']) <= 2000:
        raise ValueError('Invalid facility or rooms')
    checked=datetime.fromisoformat(str(raw.get('checked_at','')).replace('Z','+00:00'))
    if checked.tzinfo is None or abs((datetime.now(timezone.utc)-checked).total_seconds())>300:
        raise ValueError('Invalid observation time')
    rooms=[]
    identities=set()
    for room in raw['rooms']:
        if not isinstance(room,dict):
            raise ValueError('Invalid room')
        rid=str(room.get('id',''))[:180]
        if not rid or rid in identities or not isinstance(room.get('days'),dict) or len(room['days'])>370:
            raise ValueError('Invalid or duplicate room')
        identities.add(rid)
        days={}
        for day,status in room['days'].items():
            if not isinstance(day,str) or len(day)!=10 or datetime.strptime(day,'%Y-%m-%d').strftime('%Y-%m-%d')!=day:
                raise ValueError('Invalid date')
            if not isinstance(status,dict) or status.get('state') not in {'available','waitlist','full','closed','priority','lottery','unknown'}:
                raise ValueError('Invalid status')
            value={'state':status['state']}
            rank=status.get('next_rank')
            if rank is not None:
                if value['state']!='waitlist' or type(rank) is not int or not 1<=rank<=100:
                    raise ValueError('Invalid rank')
                value['next_rank']=rank
            days[day]=value
        def capacity(key):
            value=room.get(key)
            return value if type(value) is int and 0<value<=1000 else None
        rooms.append({'id':rid,'name':str(room.get('name',''))[:200],'type':str(room.get('type','숙소'))[:80],
                      'capacity':capacity('capacity'),'base_capacity':capacity('base_capacity'),'area':str(room.get('area',''))[:50],'days':days})
    return {**facility,'checked_at':checked.isoformat(),'rooms':rooms}


def snapshot():
    path=ROOT/'availability.json'
    payload=json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else {'schema_version':1,'items':[],'sources':{}}
    payload['sources'].setdefault('forest',{'state':'login_required'})
    payload['sources'].setdefault('knps',{'state':'unavailable'})
    forest_path=ROOT/'.runtime'/'forest-status.json'
    if forest_path.exists():
        try:
            forest=json.loads(forest_path.read_text(encoding='utf-8-sig'))
            if not isinstance(forest,dict) or not isinstance(forest.get('items'),list):
                raise ValueError('Invalid forest snapshot')
            payload['items']=[x for x in payload['items'] if x.get('service')!='forest']+forest['items']
            payload['sources']['forest']=forest.get('source',{'state':'unavailable'})
        except (OSError,ValueError):
            payload['sources']['forest']={'state':'unavailable','message':'휴양림 저장 현황을 읽지 못했습니다. 다시 조회해 주세요.'}
    payload['job']=dict(job)
    with forest_lock:
        payload['forest_job']=job_public()
    payload['forest_connected']=bool(forest_connected_at and (datetime.now(timezone.utc)-forest_connected_at).total_seconds()<20)
    return payload


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass
    def respond(self,status,body,kind='application/json'):
        if isinstance(body,dict):
            body=json.dumps(body,ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type',kind+'; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        self.end_headers()
        self.wfile.write(body)
    def valid_host(self):
        return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
    def valid_bridge(self):
        return secrets.compare_digest(self.headers.get('Authorization','').encode('utf-8'),('Bearer '+bridge_token).encode('utf-8'))
    def do_GET(self):
        if not self.valid_host():
            return self.respond(403,{'error':'Invalid host'})
        path=urllib.parse.urlsplit(self.path).path
        if path=='/api/status':
            try:
                payload=snapshot()
                service=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get('service',[''])[0]
                if service in {'forest','knps'}:
                    payload['items']=[x for x in payload['items'] if x.get('service')==service]
                return self.respond(200,payload)
            except (OSError,ValueError):
                return self.respond(503,{'error':'Snapshot unavailable'})
        if path=='/api/health':
            return self.respond(200,{'application':'forest-seat','version':'1.0.0','release_status':'connection_verification_deferred','job':dict(job)})
        if path=='/api/bridge/setup':
            if self.headers.get('Sec-Fetch-Site') not in {None,'same-origin','none'}:
                return self.respond(403,{'error':'Same-origin access required'})
            return self.respond(200,{'connect_url':'https://www.foresttrip.go.kr/rep/or/sssn/monthRsrvtStatus.do?hmpgId=FRIP&menuId=001004#forest-seat-connect='+bridge_token})
        if path=='/api/bridge/job':
            if not self.valid_bridge():
                return self.respond(403,{'error':'Invalid pairing'})
            global forest_connected_at
            with forest_lock:
                current=job_public()
                forest_connected_at=utcnow()
            return self.respond(200,{'job':current})
        if path not in STATIC:
            return self.respond(404,{'error':'Not found'})
        name,kind=STATIC[path]
        file=ROOT/name
        if not file.is_file():
            return self.respond(404,{'error':'Not found'})
        return self.respond(200,file.read_bytes(),kind)
    def do_POST(self):
        global forest_job
        if not self.valid_host():
            return self.respond(403,{'error':'Invalid host'})
        if self.path in {'/api/bridge/result','/api/bridge/progress'}:
            if not self.valid_bridge():
                return self.respond(403,{'error':'Invalid pairing'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8*1024*1024:
                    raise ValueError('Invalid payload size')
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict):
                    raise ValueError('Invalid payload')
                with forest_lock:
                    if not forest_job or data.get('job_id')!=forest_job['id'] or forest_job['state']!='pending':
                        return self.respond(409,{'error':'Job is no longer active'})
                    if self.path=='/api/bridge/progress':
                        update_job_counts()
                        if data.get('paused'):
                            forest_job.update(state='paused',message='공식 조회가 중단되었습니다. 로그인과 연결 상태를 확인한 뒤 다시 조회해 주세요.')
                        if data.get('complete'):
                            if forest_job['done']!=len(forest_job['facilities']):
                                return self.respond(409,{'error':'Some facilities have not completed'})
                            forest_job['state']='complete'
                            forest_job['message']=f"공식 조회 완료 · 성공 {forest_job['success']}곳, 미확인 {forest_job['failed']}곳"
                        return self.respond(200,{'ok':True})
                    facility=next((x for x in forest_job['facilities'] if x['id']==data.get('facility_id')),None)
                    if not facility:
                        raise ValueError('Facility not in job')
                    results=forest_job.setdefault('results',{})
                    if results.get(facility['id'])=='success':
                        return self.respond(200,{'ok':True,'duplicate':True})
                    if 'item' not in data:
                        results[facility['id']]='failed'
                        update_job_counts()
                        return self.respond(200,{'ok':True})
                    item=validate_forest_item(data['item'],facility)
                    file=ROOT/'.runtime'/'forest-status.json'
                    try:
                        previous=json.loads(file.read_text(encoding='utf-8-sig')) if file.exists() else {'items':[]}
                        if not isinstance(previous,dict) or not isinstance(previous.get('items'),list):
                            raise ValueError('Invalid saved snapshot')
                    except ValueError:
                        previous={'items':[]}
                    old=next((x for x in previous['items'] if x['id']==item['id']),None)
                    item=merge_forest_item(old,item)
                    previous['items']=[x for x in previous['items'] if x['id']!=item['id']]+[item]
                    previous['source']={'state':'partial','checked_at':item['checked_at'],
                                        'message':'로그인된 공식 월별 현황의 표시값입니다. 미조회 시설·날짜는 미확인으로 표시합니다.'}
                    atomic_json(file,previous)
                    results[facility['id']]='success'
                    update_job_counts()
                return self.respond(200,{'ok':True})
            except (ValueError,TypeError,KeyError,OSError):
                return self.respond(400,{'error':'Invalid booking snapshot'})
        # Block cross-site form submissions and requests from unrelated websites.
        origin=self.headers.get('Origin')
        if origin not in {f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'}:
            return self.respond(403,{'error':'Same-origin request required'})
        if self.path=='/api/forest/refresh':
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8192:
                    raise ValueError()
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict):
                    raise ValueError()
                day=datetime.strptime(data['date'],'%Y-%m-%d').strftime('%Y-%m-%d')
                if day!=data['date']:
                    raise ValueError()
                catalog=json.loads((ROOT/'catalog.json').read_text(encoding='utf-8-sig'))
                facilities=[x for x in catalog['forests'] if not data.get('region') or x['region']==data['region']]
                if data.get('operator'):
                    facilities=[x for x in facilities if x.get('operator')==data['operator']]
                if 'ids' in data:
                    if not isinstance(data['ids'],list) or not data['ids'] or any(not isinstance(x,str) for x in data['ids']):
                        raise ValueError()
                    facilities=[x for x in facilities if x['id'] in data['ids']]
                if not facilities:
                    raise ValueError()
                with forest_lock:
                    job_public()
                    if forest_job and forest_job['state']=='pending':
                        return self.respond(409,{'error':'A search is already running','job':job_public()})
                    forest_job={'id':secrets.token_urlsafe(12),'state':'pending','date':day,'facilities':facilities,'done':0,'success':0,'failed':0,'created_at':utcnow().isoformat(),'results':{}}
                    public=job_public()
                return self.respond(202,{'job':public})
            except (ValueError,KeyError,TypeError):
                return self.respond(400,{'error':'Invalid search conditions'})
        if self.path=='/api/forest/cancel':
            with forest_lock:
                if forest_job:
                    forest_job.update(state='cancelled',message='공식 조회를 중단했습니다. 이미 확인한 결과는 보존했습니다.')
            return self.respond(200,{'ok':True})
        if self.path!='/api/refresh':
            return self.respond(404,{'error':'Not found'})
        if not job_lock.acquire(blocking=False):
            return self.respond(202,dict(job))
        def work():
            job.update(state='running',done=0,total=48)
            try:
                run_scraper(progress=lambda done,total:job.update(done=done,total=total))
                job['state']='complete'
            except Exception:
                job['state']='failed'
            finally:
                job_lock.release()
        threading.Thread(target=work,daemon=True).start()
        return self.respond(202,{'state':'running'})


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8765)
    args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Forest Seat: http://127.0.0.1:{args.port}',flush=True)
    server.serve_forever()
