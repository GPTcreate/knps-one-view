import hashlib
from pathlib import Path
import tempfile
import unittest
import zipfile
from verify_release import verify_archive


class ReleaseSafetyTests(unittest.TestCase):
    def archive(self,root,files):
        output=root/'package.zip'
        with zipfile.ZipFile(output,'w') as bundle:
            for name,data in files.items():bundle.writestr(name,data)
        for name in files:
            if chr(92) in name:output.write_bytes(output.read_bytes().replace(name.replace(chr(92),'/').encode(),name.encode()))
        output.with_suffix('.zip.sha256').write_text(hashlib.sha256(output.read_bytes()).hexdigest()+'  package.zip\n')
        return output
    def test_distribution_rejects_runtime_files_and_parent_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name in ('.runtime/operator.key','../outside','C:/outside','folder\\outside'):
                with self.subTest(name=name),self.assertRaisesRegex(ValueError,'path'):
                    verify_archive(self.archive(root,{name:b'value'}),root)
    def test_distribution_rejects_an_actual_local_credential_before_inspecting_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'.runtime').mkdir();(root/'.runtime/operator.key').write_text('private-operator-value')
            with self.assertRaisesRegex(ValueError,'credential'):verify_archive(self.archive(root,{'public.txt':b'private-operator-value'}),root)
    def test_changed_archive_cannot_keep_a_stale_checksum(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);output=self.archive(root,{'file':b'value'});output.write_bytes(output.read_bytes()+b'changed')
            with self.assertRaisesRegex(ValueError,'checksum'):verify_archive(output,root)


if __name__=='__main__':unittest.main()
