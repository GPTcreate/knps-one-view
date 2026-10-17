import json
from datetime import datetime,timezone
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import server


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.port=cls.http.server_port
        cls.base=f'http://127.0.0.1:{cls.port}'
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.thread.join()
    def request(self,path,**kwargs):
        return urllib.request.urlopen(urllib.request.Request(self.base+path,**kwargs),timeout=3)
    def test_health_and_explicit_public_artifacts(self):
        with self.request('/api/health') as r:self.assertEqual(json.load(r)['version'],'1.0.0')
        with self.request('/core.js') as r:
            self.assertEqual(r.headers['X-Content-Type-Options'],'nosniff')
            self.assertIn("frame-ancestors 'none'",r.headers['Content-Security-Policy'])
            self.assertIn(b'FRESH_MS',r.read())
    def test_repository_and_runtime_files_cannot_be_downloaded(self):
        for path in ['/.git/config','/.runtime/forest-status.json','/server.py','/../README.md','/%2e%2e/README.md']:
            with self.subTest(path=path),self.assertRaises(urllib.error.HTTPError) as caught:self.request(path)
            self.assertEqual(caught.exception.code,404)
    def test_invalid_host_blocked(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:self.request('/api/status',headers={'Host':'attacker.example'})
        self.assertEqual(caught.exception.code,403)
    def test_cross_site_mutation_blocked(self):
        for origin in [None,'https://attacker.example','null']:
            headers={} if origin is None else {'Origin':origin}
            with self.subTest(origin=origin),self.assertRaises(urllib.error.HTTPError) as caught:self.request('/api/refresh',data=b'',headers=headers)
            self.assertEqual(caught.exception.code,403)
    def test_authorized_refresh_and_health_state(self):
        with patch.object(server,'run_scraper') as collect:
            with self.request('/api/refresh',data=b'',headers={'Origin':self.base}) as response:self.assertEqual(response.status,202)
            for _ in range(100):
                if not server.job_lock.locked():break
                threading.Event().wait(.01)
            self.assertEqual(collect.call_count,1)
            self.assertEqual(server.job['state'],'complete')
    def test_empty_saved_selection_cannot_enqueue_every_facility(self):
        facility={'id':'0101','name':'유명산','service':'forest','region':'경기','region_id':'1'}
        with tempfile.TemporaryDirectory() as directory,patch.object(server,'ROOT',Path(directory)):
            (Path(directory)/'catalog.json').write_text(json.dumps({'forests':[facility]}))
            server.forest_job=None
            def post(path,data,paired=False):
                headers={'Content-Type':'application/json','Origin':self.base}
                if paired:headers['Authorization']='Bearer '+server.bridge_token
                return self.request(path,data=json.dumps(data).encode(),headers=headers)
            with self.assertRaises(urllib.error.HTTPError) as caught:
                post('/api/forest/refresh',{'date':'2026-10-24','region':'경기','ids':[]})
            self.assertEqual(caught.exception.code,400)
    def test_forest_import_requires_pairing_and_retains_only_booking_data(self):
        facility={'id':'0101','name':'유명산','service':'forest','region':'경기','region_id':'1'}
        with tempfile.TemporaryDirectory() as directory,patch.object(server,'ROOT',Path(directory)):
            (Path(directory)/'catalog.json').write_text(json.dumps({'forests':[facility]}))
            server.forest_job=None
            headers={'Content-Type':'application/json','Origin':self.base}
            with self.request('/api/forest/refresh',data=b'{"date":"2026-10-24"}',headers=headers) as r:
                task=json.load(r)['job']
            item={'id':'0101','checked_at':datetime.now(timezone.utc).isoformat(),'cookies':'not retained','rooms':[{'id':'r','name':'고라니','days':{'2026-10-24':{'state':'waitlist','next_rank':1}}}]}
            body=json.dumps({'job_id':task['id'],'facility_id':'0101','item':item}).encode()
            with self.assertRaises(urllib.error.HTTPError) as caught:self.request('/api/bridge/result',data=body,headers=headers)
            self.assertEqual(caught.exception.code,403)
            paired={**headers,'Authorization':'Bearer '+server.bridge_token}
            with self.request('/api/bridge/result',data=body,headers=paired) as r:self.assertEqual(r.status,200)
            with self.request('/api/status?service=forest') as r:
                payload=json.load(r)
            self.assertEqual(payload['items'][0]['rooms'][0]['days']['2026-10-24']['next_rank'],1)
            self.assertNotIn('cookies',payload['items'][0])
            with self.request('/api/forest/cancel',data=b'',headers=headers) as r:self.assertEqual(r.status,200)
            with self.assertRaises(urllib.error.HTTPError) as caught:self.request('/api/bridge/result',data=body,headers=paired)
            self.assertEqual(caught.exception.code,409)


if __name__=='__main__':unittest.main()
