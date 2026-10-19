import concurrent.futures
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch,MagicMock
import maintenance
import operator_auth
import prepare_operator
from shared_queue import SharedQueue


class OperationsTests(unittest.TestCase):
    def test_parallel_first_key_creation_has_one_complete_persistent_value(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:keys=list(pool.map(lambda _:operator_auth.load_key(root),range(24)))
            self.assertEqual(len(set(keys)),1);self.assertGreaterEqual(len(keys[0]),32)
    def test_consistent_backup_preserves_pending_and_observations_without_authentication_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);queue=SharedQueue(root/'.runtime/shared.sqlite3')
            queue.enqueue([{'id':'F1'}],'2026-10-24')
            output=maintenance.backup(root);restored=SharedQueue(output)
            self.assertEqual(restored.diagnostics()['work'],{'queued':1})
            self.assertFalse((output.parent/'operator.key').exists())
            with self.assertRaises(ValueError):queue.backup(output)
            with self.assertRaises(ValueError):queue.backup(queue.path)
    def test_doctor_offline_does_not_create_credentials_or_database(self):
        with tempfile.TemporaryDirectory() as directory,patch('maintenance.urllib.request.urlopen',side_effect=OSError()):
            root=Path(directory);result=maintenance.diagnose(root)
            self.assertEqual(result['server'],'offline');self.assertFalse((root/'.runtime').exists())
    def test_prepare_reuses_known_server_and_returns_paths_without_key(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);settings=root/'connection.json';settings.write_text(json.dumps({'token':'private_test_key_12345678901234567890'}))
            response=MagicMock();response.__enter__.return_value.read.return_value=b'{"ok":true,"storage":"ok"}'
            with patch.object(prepare_operator,'ROOT',root),patch('prepare_operator.launcher.start',return_value='http://127.0.0.1:8765') as start,patch('prepare_operator.operator_setup.prepare',return_value=settings),patch('prepare_operator.urllib.request.urlopen',return_value=response),patch('prepare_operator.build_operator.build',return_value=root/'artifacts/operator.zip'),patch('prepare_operator.webbrowser.open') as browser:
                result=prepare_operator.prepare(open_browser=False)
                start.assert_called_once_with(8765,open_browser=False);browser.assert_not_called()
                self.assertNotIn('private_test_key',json.dumps(result));self.assertEqual(result['connection_file'],str(settings))
    def test_prepare_refuses_a_different_folder_server_without_overwriting_its_extension(self):
        with tempfile.TemporaryDirectory() as directory:
            settings=Path(directory)/'connection.json';settings.write_text('{"token":"private_test_key"}')
            with patch('prepare_operator.launcher.start',return_value='http://127.0.0.1:8765'),patch('prepare_operator.operator_setup.prepare',return_value=settings),patch('prepare_operator.urllib.request.urlopen',side_effect=urllib.error.HTTPError('url',403,'denied',{},None)),patch('prepare_operator.build_operator.build') as build:
                with self.assertRaisesRegex(RuntimeError,'does not match'):prepare_operator.prepare(open_browser=False)
                build.assert_not_called()
    def test_operator_origin_rejects_wildcards_and_invalid_ports(self):
        for origin in ('https://*.example.com','https://example.com:0','https://example.com:70000','https://example.com:notaport'):
            with self.subTest(origin=origin),self.assertRaises(ValueError):operator_auth.server_origin(origin)


if __name__=='__main__':unittest.main()
