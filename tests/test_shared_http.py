from datetime import datetime,timedelta,timezone
from http.server import ThreadingHTTPServer
import json
import sqlite3
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch
import server
from operator_auth import load_key,server_origin
from operator_setup import prepare


class SharedHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler);cls.base=f'http://127.0.0.1:{cls.http.server_port}'
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):cls.http.shutdown();cls.http.server_close();cls.thread.join()
    def setUp(self):
        server.request_times.clear()
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.patch=patch.object(server,'ROOT',self.root);self.patch.start();self.addCleanup(self.patch.stop)
        self.auth=patch.object(server,'load_key',return_value='fixture-operator-private-key-1234567890');self.auth.start();self.addCleanup(self.auth.stop)
        self.facilities=[{'id':'F1','service':'forest','name':'첫 숲','region':'제주','region_id':'9','operator':'공립'},{'id':'F2','service':'forest','name':'둘 숲','region':'제주','region_id':'9','operator':'공립'}]
        (self.root/'catalog.json').write_text(json.dumps({'forests':self.facilities}),encoding='utf-8')
        (self.root/'availability.json').write_text(json.dumps({'schema_version':1,'items':[],'sources':{}}),encoding='utf-8')
        self.day=(datetime.now(timezone.utc)+timedelta(days=1)).strftime('%Y-%m-%d')
        self.headers={'Authorization':'Bearer fixture-operator-private-key-1234567890','X-Collector-ID':'collector_fixture'}
    def request(self,path,data=None,headers=None):
        options={'headers':headers or {}}
        if data is not None:options['data']=json.dumps(data).encode();options['headers']={**options['headers'],'Content-Type':'application/json'}
        with urllib.request.urlopen(urllib.request.Request(self.base+path,**options),timeout=5) as response:return json.load(response)
    def enqueue(self):return self.request('/api/forest/search',{'date':self.day,'region':'제주'}, {'Origin':self.base})
    def test_two_web_requests_share_queue_operator_result_is_visible_without_extension_or_secret(self):
        self.assertEqual(self.enqueue()['refresh']['pending'],2);self.assertEqual(self.enqueue()['refresh']['pending'],2)
        job=self.request('/api/operator/job',headers=self.headers)['job']
        item={'id':job['facilities'][0]['id'],'checked_at':datetime.now(timezone.utc).isoformat(),'cookies':'never public','rooms':[{'id':'r1','name':'실제 모양 객실','account':'never public','days':{self.day:{'state':'waitlist','next_rank':2}}}]}
        self.request('/api/operator/result',{'job_id':job['id'],'facility_id':item['id'],'item':item},self.headers)
        public=self.request('/api/status?service=forest&date='+self.day)
        self.assertEqual(public['refresh']['fresh'],1);self.assertEqual(public['items'][0]['rooms'][0]['days'][self.day]['next_rank'],2)
        text=json.dumps(public);self.assertNotIn('never public',text);self.assertNotIn(job['id'],text);self.assertNotIn(self.headers['Authorization'],text)
        self.assertNotIn('forest_connected',public);self.assertNotIn('forest_job',public)
    def test_operator_routes_require_key_and_identity(self):
        for headers in ({},{'Authorization':'Bearer bad'}, {'Authorization':self.headers['Authorization']}):
            with self.subTest(headers=list(headers)),self.assertRaises(urllib.error.HTTPError) as caught:self.request('/api/operator/job',headers=headers)
            self.assertIn(caught.exception.code,(400,403))
    def test_search_requires_same_origin_and_valid_nonempty_scope(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:self.request('/api/forest/search',{'date':self.day})
        self.assertEqual(caught.exception.code,403)
        for body in ({'date':'2026-02-30'},{'date':self.day,'ids':[]},{'date':self.day,'region':'없음'},{'date':'2099-01-01'}):
            with self.subTest(body=body),self.assertRaises(urllib.error.HTTPError) as caught:self.request('/api/forest/search',body,{'Origin':self.base})
            self.assertEqual(caught.exception.code,400)
        self.assertEqual(server.shared().summary(['F1','F2'],self.day[:7])['pending'],0)
    def test_late_result_after_pause_and_unknown_facility_are_rejected(self):
        self.enqueue();job=self.request('/api/operator/job',headers=self.headers)['job']
        self.request('/api/operator/pause',{},self.headers)
        body={'job_id':job['id'],'facility_id':job['facilities'][0]['id']}
        with self.assertRaises(urllib.error.HTTPError) as caught:self.request('/api/operator/result',body,self.headers)
        self.assertEqual(caught.exception.code,409)
        body['facility_id']='not-in-directory'
        with self.assertRaises(urllib.error.HTTPError) as caught:self.request('/api/operator/result',body,self.headers)
        self.assertEqual(caught.exception.code,400)
    def test_private_database_and_connection_file_are_not_static_assets(self):
        for path in ('/.runtime/shared.sqlite3','/.runtime/operator.key','/.runtime/operator-connection.json','/operator_auth.py'):
            with self.subTest(path=path),self.assertRaises(urllib.error.HTTPError) as caught:self.request(path)
            self.assertEqual(caught.exception.code,404)
    def test_local_key_survives_restarts_and_connection_setup_does_not_change_it(self):
        first=load_key(self.root);self.assertEqual(first,load_key(self.root))
        file=prepare(self.root,self.base);settings=json.loads(file.read_text())
        self.assertEqual(settings['token'],first);self.assertEqual(settings['server_url'],self.base)
    def test_remote_http_and_embedded_credentials_are_not_operator_destinations(self):
        for value in ('http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com/?token=value'):
            with self.subTest(value=value),self.assertRaises(ValueError):server_origin(value)
        self.assertEqual(server_origin('https://example.com/'),'https://example.com')
    def test_storage_failure_does_not_hide_knps_and_search_reports_unavailable(self):
        (self.root/'availability.json').write_text(json.dumps({'schema_version':1,'sources':{},'items':[{'id':'camp','service':'knps'}]}),encoding='utf-8')
        with patch.object(server,'shared',side_effect=sqlite3.DatabaseError('private database details')):
            payload=self.request('/api/status?service=knps')
            self.assertEqual(payload['items'][0]['id'],'camp')
            self.assertEqual(payload['sources']['forest']['state'],'unavailable')
            self.assertNotIn('private database details',json.dumps(payload))
            with self.assertRaises(urllib.error.HTTPError) as caught:self.enqueue()
            self.assertEqual(caught.exception.code,503)
    def test_invalid_get_filters_report_bad_request_without_enqueuing(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:self.request('/api/status?service=forest&date=2099-01-01')
        self.assertEqual(caught.exception.code,400)
    def test_request_limit_rejects_excess_without_growing_duplicate_work(self):
        for _ in range(60):self.enqueue()
        with self.assertRaises(urllib.error.HTTPError) as caught:self.enqueue()
        self.assertEqual(caught.exception.code,429)
        self.assertEqual(server.shared().summary(['F1','F2'],self.day[:7])['pending'],2)
    def test_completion_during_snapshot_never_reports_fresh_before_its_items(self):
        self.enqueue();queue=server.shared();job=queue.claim('collector_fixture',self.facilities)
        original=queue.summary
        def complete_then_summarize(*args):
            item={**job['facilities'][0],'checked_at':datetime.now(timezone.utc).isoformat(),'rooms':[{'id':'r','name':'객실','days':{self.day:{'state':'available'}}}]}
            queue.submit('collector_fixture',job['id'],item['id'],item,server.merge_forest_item)
            return original(*args)
        with patch.object(queue,'summary',side_effect=complete_then_summarize):
            payload=self.request('/api/status?service=forest&date='+self.day)
        self.assertEqual(payload['refresh']['fresh'],1)
        self.assertEqual(payload['items'][0]['rooms'][0]['days'][self.day]['state'],'available')


if __name__=='__main__':unittest.main()
