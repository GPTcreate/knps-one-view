import copy
from datetime import datetime,timezone
import unittest
import server


class ForestBridgeValidationTests(unittest.TestCase):
    def setUp(self):
        self.facility={'id':'0101','name':'유명산','service':'forest','calendar_url':'https://www.foresttrip.go.kr/rep/or/sssn/monthRsrvtStatus.do?insttId=0101'}
        self.raw={'id':'0101','checked_at':datetime.now(timezone.utc).isoformat(),'rooms':[{'id':'r1','name':'고라니','type':'숲속의집','base_capacity':5,'days':{'2026-10-24':{'state':'waitlist','next_rank':1}}}]}
    def test_only_booking_fields_survive_normalization(self):
        self.raw['cookies']='must not persist';self.raw['account']='must not persist';self.raw['rooms'][0]['private']='must not persist'
        result=server.validate_forest_item(self.raw,self.facility)
        self.assertNotIn('cookies',result);self.assertNotIn('account',result);self.assertNotIn('private',result['rooms'][0])
        self.assertEqual(result['rooms'][0]['days']['2026-10-24']['next_rank'],1)
        self.assertIsNone(result['rooms'][0]['capacity'])
    def test_invalid_shape_and_unrequested_facility_rejected(self):
        for value in [None,'bad',[],{},dict(self.raw,id='not-requested')]:
            with self.subTest(value=type(value)),self.assertRaises(ValueError):server.validate_forest_item(value,self.facility)
    def test_invalid_time_dates_states_and_ranks_rejected(self):
        for key,value in [('time','2025-01-01T00:00:00Z'),('day','2026-02-30'),('state','invented'),('rank',0),('rank','1'),('rank',True)]:
            raw=copy.deepcopy(self.raw)
            if key=='time':raw['checked_at']=value
            elif key=='day':raw['rooms'][0]['days']={value:{'state':'available'}}
            elif key=='state':raw['rooms'][0]['days']['2026-10-24']['state']=value
            else:raw['rooms'][0]['days']['2026-10-24']['next_rank']=value
            with self.subTest(key=key,value=value),self.assertRaises(ValueError):server.validate_forest_item(raw,self.facility)
    def test_duplicate_room_ids_rejected(self):
        self.raw['rooms']*=2
        with self.assertRaises(ValueError):server.validate_forest_item(self.raw,self.facility)


if __name__=='__main__':unittest.main()

class ObservationHistoryTests(unittest.TestCase):
    def test_a_new_month_cannot_refresh_old_dates(self):
        old={'checked_at':'2026-10-17T00:00:00+00:00','rooms':[{'id':'r','days':{'2026-10-24':{'state':'available'}}}]}
        new={'id':'0101','checked_at':'2026-10-17T01:00:00+00:00','rooms':[{'id':'r','days':{'2026-11-01':{'state':'waitlist','next_rank':2}}}]}
        item=server.merge_forest_item(old,new)
        self.assertEqual(item['rooms'][0]['days']['2026-10-24']['checked_at'],old['checked_at'])
        self.assertEqual(item['rooms'][0]['days']['2026-11-01']['checked_at'],new['checked_at'])
    def test_disconnected_job_pauses_and_preserves_its_progress(self):
        from datetime import timedelta
        from unittest.mock import patch
        now=datetime.now(timezone.utc)
        task={'id':'a','state':'pending','created_at':(now-timedelta(minutes=3)).isoformat(),'done':1,'results':{'0101':'success'}}
        with patch.object(server,'forest_job',task),patch.object(server,'forest_connected_at',None):
            public=server.job_public()
        self.assertEqual(public['state'],'paused');self.assertEqual(public['done'],1);self.assertNotIn('results',public)
    def test_old_connection_does_not_expire_a_just_created_job(self):
        from datetime import timedelta
        from unittest.mock import patch
        now=datetime.now(timezone.utc)
        task={'id':'a','state':'pending','created_at':now.isoformat(),'results':{}}
        with patch.object(server,'forest_job',task),patch.object(server,'forest_connected_at',now-timedelta(hours=1)):
            self.assertEqual(server.job_public()['state'],'pending')
