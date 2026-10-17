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
        if not rid or rid in identities or not isinstance(room.get('days'),dict):
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
        forest=json.loads(forest_path.read_text(encoding='utf-8-sig'))
        payload['items']=[x for x in payload['items'] if x.get('service')!='forest']+forest.get('items',[])
        payload['sources']['forest']=forest.get('source',{'state':'unavailable'})
    payload['job']=dict(job)
    with forest_lock:
        payload['forest_job']=copy.deepcopy(forest_job)
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
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
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
            return self.respond(200,{'version':'1.0.0','job':dict(job)})
        if path=='/api/bridge/setup':
            if self.headers.get('Sec-Fetch-Site') not in {None,'same-origin','none'}:
                return self.respond(403,{'error':'Same-origin access required'})
            return self.respond(200,{'connect_url':'https://www.foresttrip.go.kr/rep/or/sssn/monthRsrvtStatus.do?hmpgId=FRIP&menuId=001004#forest-seat-connect='+bridge_token})
        if path=='/api/bridge/job':
            if not self.valid_bridge():
                return self.respond(403,{'error':'Invalid pairing'})
            global forest_connected_at
            forest_connected_at=datetime.now(timezone.utc)
            return self.respond(200,{'job':forest_job})
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
                        forest_job.update(done=min(int(data.get('done',forest_job['done'])),len(forest_job['facilities'])),
                                          success=max(0,int(data.get('success',0))),failed=max(0,int(data.get('failed',0))))
                        if data.get('complete'):
                            forest_job['state']='complete'
                        return self.respond(200,{'ok':True})
                    facility=next((x for x in forest_job['facilities'] if x['id']==data.get('facility_id')),None)
                    if not facility:
                        raise ValueError('Facility not in job')
                    if 'item' not in data:
                        forest_job.setdefault('errors',[]).append({'id':facility['id'],'message':str(data.get('error',''))[:150]})
                        return self.respond(200,{'ok':True})
                    item=validate_forest_item(data['item'],facility)
                    file=ROOT/'.runtime'/'forest-status.json'
                    previous=json.loads(file.read_text(encoding='utf-8-sig')) if file.exists() else {'items':[]}
                    previous['items']=[x for x in previous['items'] if x['id']!=item['id']]+[item]
                    previous['source']={'state':'partial','checked_at':item['checked_at'],
                                        'message':'로그인된 공식 월별 현황의 표시값입니다. 미조회 시설·날짜는 미확인으로 표시합니다.'}
                    atomic_json(file,previous)
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
                if 'ids' in data:
                    if not isinstance(data['ids'],list) or not data['ids'] or any(not isinstance(x,str) for x in data['ids']):
                        raise ValueError()
                    facilities=[x for x in facilities if x['id'] in data['ids']]
                if not facilities:
                    raise ValueError()
                with forest_lock:
                    if forest_job and forest_job['state']=='pending':
                        return self.respond(409,{'error':'A search is already running','job':forest_job})
                    forest_job={'id':secrets.token_urlsafe(12),'state':'pending','date':day,'facilities':facilities,'done':0,'success':0,'failed':0}
                return self.respond(202,{'job':forest_job})
            except (ValueError,KeyError,TypeError):
                return self.respond(400,{'error':'Invalid search conditions'})
        if self.path=='/api/forest/cancel':
            with forest_lock:
                if forest_job:
                    forest_job['state']='cancelled'
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
