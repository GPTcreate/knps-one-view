import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import scraper_real as scraper


class CollectorTests(unittest.TestCase):
    def test_attribute_order_single_quotes_and_html_entities(self):
        rooms=scraper.parse_campsite("<i class='icon-reservation extra' title='A &amp; B : 2026-10-24'></i>")
        self.assertEqual(rooms[0]['name'],'A & B')
        self.assertEqual(rooms[0]['days']['2026-10-24']['state'],'available')
    def test_waiting_full_closed_unknown_distinct(self):
        for cls,state in [('icon-waiting','waitlist'),('icon-none-reservation','full'),('icon-end','closed'),('new-icon','unknown'),('icon-reservation icon-end','unknown')]:
            with self.subTest(cls=cls):
                rooms=scraper.parse_campsite(f'<i title="A : 2026-10-24" class="{cls}">')
                self.assertEqual(rooms[0]['days']['2026-10-24']['state'],state)
                self.assertNotIn('next_rank',rooms[0]['days']['2026-10-24'])
    def test_invalid_dates_and_legend_icons_ignored(self):
        self.assertEqual(scraper.parse_campsite('<i class="icon-reservation"><i title="A : 2026-02-30" class="icon-reservation">'),[])
    def test_duplicate_cells_do_not_inflate_inventory_and_conflicts_unknown(self):
        rooms=scraper.parse_campsite('<i title="A : 2026-10-24" class="icon-reservation">'*2)
        self.assertEqual(len(rooms),1)
        self.assertEqual(len(rooms[0]['days']),1)
        rooms=scraper.parse_campsite('<i title="A : 2026-10-24" class="icon-reservation"><i title="A : 2026-10-24" class="icon-none-reservation">')
        self.assertEqual(rooms[0]['days']['2026-10-24']['state'],'unknown')
    def test_atomic_write_replaces_valid_json(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'snapshot.json'
            file.write_text('{"old":true}')
            scraper.atomic_json(file,{'value':'숲'})
            self.assertEqual(json.loads(file.read_text(encoding='utf-8')),{'value':'숲'})
            self.assertEqual(len(list(Path(directory).iterdir())),1)
    def test_total_failure_preserves_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'snapshot.json';before=b'{"items":[],"sources":{}}';file.write_bytes(before)
            with patch.object(scraper,'collect_one',side_effect=TimeoutError),patch.object(scraper.time,'sleep'):
                with self.assertRaises(RuntimeError):scraper.run_scraper(1,file)
            self.assertEqual(file.read_bytes(),before)
    def test_partial_failure_retains_original_per_facility_time(self):
        meta=json.loads((scraper.ROOT/'camps_meta.json').read_text(encoding='utf-8'))[:2]
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'snapshot.json';old={'id':meta[1]['dept_id'],'service':'knps','checked_at':'2026-01-01T00:00:00Z'}
            file.write_text(json.dumps({'items':[old],'sources':{}}))
            def collect(item):
                if item['dept_id']==old['id']:raise TimeoutError()
                return {'id':item['dept_id'],'service':'knps','checked_at':'2026-10-17T12:00:00Z'}
            with patch.object(scraper,'collect_one',side_effect=collect),patch.object(scraper.time,'sleep'):
                result=scraper.run_scraper(2,file)
            self.assertIn(old,result['items'])
            self.assertEqual(result['sources']['knps']['state'],'partial')


if __name__=='__main__':unittest.main()
