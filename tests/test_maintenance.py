import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import refresh_catalog
import launcher


class DirectoryTests(unittest.TestCase):
    def test_failed_region_keeps_the_old_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'catalog.json';file.write_bytes(b'original')
            with patch.object(refresh_catalog,'read_public',side_effect=[[{'detailCode':'1','codeNm':'수도권'}],TimeoutError()]):
                with self.assertRaises(TimeoutError):refresh_catalog.refresh(file)
            self.assertEqual(file.read_bytes(),b'original')
    def test_public_directory_maps_actual_codes_without_availability_claims(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'catalog.json'
            with patch.object(refresh_catalog,'read_public',side_effect=[[{'detailCode':'1','codeNm':' 수도권 '}],{'insttList':[{'insttId':'0101','insttNm':'유명산','insttTpCd':'01'}]}]):
                result=refresh_catalog.refresh(file)
            row=result['forests'][0];self.assertEqual(row['operator'],'국립');self.assertEqual(row['region'],'수도권');self.assertNotIn('rooms',row)
            self.assertEqual(json.loads(file.read_text(encoding='utf-8'))['forests'][0]['id'],'0101')


class LauncherTests(unittest.TestCase):
    def test_existing_own_server_is_reused_without_spawning_or_opening_browser(self):
        with patch.object(launcher,'health',return_value={'application':'forest-seat'}),patch.object(launcher.subprocess,'Popen') as spawn:
            self.assertEqual(launcher.start(open_browser=False),'http://127.0.0.1:8765');spawn.assert_not_called()
    def test_a_foreign_port_owner_is_never_stopped_or_replaced(self):
        with patch.object(launcher,'health',return_value=None),patch.object(launcher.socket,'socket') as socket,patch.object(launcher.subprocess,'Popen') as spawn:
            socket.return_value.__enter__.return_value.connect_ex.return_value=0
            with self.assertRaisesRegex(RuntimeError,'another program'):launcher.start(open_browser=False)
            spawn.assert_not_called()
