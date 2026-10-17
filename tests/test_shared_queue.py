import concurrent.futures
from datetime import datetime,timedelta,timezone
import tempfile
from pathlib import Path
import time
import unittest
from unittest.mock import patch
from shared_queue import SharedQueue,Conflict,QueueFull
from server import merge_forest_item


class SharedQueueTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.now=[float(int(time.time()))];self.path=Path(self.temp.name)/'shared.sqlite3'
        self.queue=SharedQueue(self.path,clock=lambda:self.now[0])
        self.day=(datetime.now(timezone.utc)+timedelta(days=1)).strftime('%Y-%m-%d')
        self.facilities=[{'id':'F1','service':'forest','name':'첫 숲','region':'제주','region_id':'9'},{'id':'F2','service':'forest','name':'둘 숲','region':'제주','region_id':'9'}]
    def item(self,identity='F1',day=None,rooms=None):
        return {**next(f for f in self.facilities if f['id']==identity),'checked_at':datetime.fromtimestamp(self.now[0],timezone.utc).isoformat(),'rooms':rooms or [{'id':'room1','name':'객실','days':{day or self.day:{'state':'waitlist','next_rank':1}}}]}
    def submit(self,job,item=None,identity=None,collector='collector_A'):
        return self.queue.submit(collector,job['id'],identity or job['facilities'][0]['id'],item,merge_forest_item)
    def test_same_month_requests_are_deduplicated_and_different_collectors_do_not_claim_same_work(self):
        self.queue.enqueue(self.facilities,self.day);self.queue.enqueue(self.facilities,self.day)
        a=self.queue.claim('collector_A',self.facilities);b=self.queue.claim('collector_B',self.facilities)
        self.assertNotEqual(a['facilities'][0]['id'],b['facilities'][0]['id'])
        self.assertIsNone(self.queue.claim('collector_C',self.facilities))
        self.assertEqual(self.queue.claim('collector_A',self.facilities,a['id'])['id'],a['id'])
    def test_fresh_cache_prevents_work_and_persists_across_server_recreation(self):
        self.queue.enqueue(self.facilities[:1],self.day);job=self.queue.claim('collector_A',self.facilities)
        self.submit(job,self.item());self.assertTrue(self.submit(job,self.item())['duplicate'])
        restored=SharedQueue(self.path,clock=lambda:self.now[0])
        result=restored.enqueue(self.facilities[:1],self.day)
        self.assertEqual(result['fresh'],1);self.assertEqual(result['pending'],0)
        self.assertEqual(len(restored.items()),1)
    def test_expired_lease_is_retried_and_late_collector_cannot_overwrite(self):
        self.queue.enqueue(self.facilities[:1],self.day);old=self.queue.claim('collector_A',self.facilities)
        self.now[0]+=121;self.queue.summary(['F1'],self.day[:7]);self.now[0]+=16
        new=self.queue.claim('collector_B',self.facilities)
        self.assertNotEqual(old['id'],new['id'])
        with self.assertRaises(Conflict):self.submit(old,self.item())
        self.assertEqual(self.queue.items(),[])
        self.submit(new,self.item(),collector='collector_B')
    def test_failed_retries_preserve_observations_and_stop_after_three_attempts(self):
        self.queue.enqueue(self.facilities[:1],self.day);job=self.queue.claim('collector_A',self.facilities);self.submit(job,self.item())
        original=self.queue.items()[0]['checked_at'];self.now[0]+=301;self.queue.enqueue(self.facilities[:1],self.day)
        for delay in (16,31,1):
            job=self.queue.claim('collector_A',self.facilities);self.assertIsNotNone(job)
            self.submit(job);self.now[0]+=delay
        summary=self.queue.enqueue(self.facilities[:1],self.day)
        self.assertEqual(summary['failed'],1);self.assertEqual(summary['pending'],0)
        self.assertEqual(self.queue.items()[0]['checked_at'],original)
    def test_pausing_operator_releases_work_but_keeps_previous_data(self):
        self.queue.enqueue(self.facilities[:1],self.day);job=self.queue.claim('collector_A',self.facilities)
        self.queue.pause('collector_A')
        with self.assertRaises(Conflict):self.submit(job,self.item())
        self.assertTrue(self.queue.summary(['F1'],self.day[:7])['offline'])
        self.now[0]+=16;self.assertIsNotNone(self.queue.claim('collector_B',self.facilities))
    def test_month_replacement_removes_omitted_cells_and_preserves_other_month_times(self):
        self.queue.enqueue(self.facilities[:1],self.day);first=self.queue.claim('collector_A',self.facilities);self.submit(first,self.item())
        old_time=self.queue.items()[0]['checked_at']
        later=(datetime.strptime(self.day,'%Y-%m-%d')+timedelta(days=32)).strftime('%Y-%m-%d')
        self.queue.enqueue(self.facilities[:1],later);second=self.queue.claim('collector_A',self.facilities);self.submit(second,self.item(day=later))
        self.assertEqual(self.queue.items()[0]['rooms'][0]['days'][self.day]['checked_at'],old_time)
        self.now[0]+=301;self.queue.enqueue(self.facilities[:1],self.day);third=self.queue.claim('collector_A',self.facilities)
        new=self.item(rooms=[{'id':'different','name':'새 객실','days':{self.day:{'state':'full'}}}]);self.submit(third,new)
        rooms=self.queue.items()[0]['rooms'];original=next(room for room in rooms if room['id']=='room1')
        self.assertNotIn(self.day,original['days']);self.assertIn(later,original['days'])
    def test_wrong_month_or_stale_observation_is_rejected_without_changing_cache(self):
        self.queue.enqueue(self.facilities[:1],self.day);job=self.queue.claim('collector_A',self.facilities)
        wrong=self.item(day='2035-01-01')
        with self.assertRaises(ValueError):self.submit(job,wrong)
        wrong=self.item();wrong['checked_at']='2020-01-01T00:00:00+00:00'
        with self.assertRaises(ValueError):self.submit(job,wrong)
        self.assertEqual(self.queue.items(),[])
    def test_queue_limit_rolls_back_entire_request_instead_of_leaving_partial_work(self):
        with patch('shared_queue.MAX_PENDING',1),self.assertRaises(QueueFull):self.queue.enqueue(self.facilities,self.day)
        self.assertEqual(self.queue.summary(['F1','F2'],self.day[:7])['pending'],0)
    def test_parallel_identical_requests_remain_one_work_item(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda _:self.queue.enqueue(self.facilities[:1],self.day),range(16)))
        self.assertIsNotNone(self.queue.claim('collector_A',self.facilities));self.assertIsNone(self.queue.claim('collector_B',self.facilities))
    def test_public_summary_never_contains_operator_identity_or_lease(self):
        self.queue.enqueue(self.facilities[:1],self.day);job=self.queue.claim('collector_A',self.facilities)
        summary=str(self.queue.summary(['F1'],self.day[:7]))
        self.assertNotIn(job['id'],summary);self.assertNotIn('collector_A',summary)
    def test_no_early_completion_or_unbounded_heartbeat_run(self):
        self.queue.enqueue(self.facilities[:1],self.day);job=self.queue.claim('collector_A',self.facilities)
        with self.assertRaises(Conflict):self.queue.acknowledge('collector_A',job['id'])
        for _ in range(3):self.now[0]+=90;self.queue.claim('collector_A',self.facilities,job['id'])
        self.now[0]+=31
        with self.assertRaises(Conflict):self.submit(job,self.item())


if __name__=='__main__':unittest.main()
