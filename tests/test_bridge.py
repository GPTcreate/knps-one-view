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
