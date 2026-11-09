"""Source-text acceptance must behave the same with or without local Tesseract."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import cv2
import numpy as np
from local_media_check import analyze


class SourceTextPolicyTests(unittest.TestCase):
    def test_allowed_text_skips_ocr_without_skipping_technical_checks(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'frame.png'
            y, x = np.indices((240, 180))
            gray = np.where((x//12+y//12) % 2, 180, 50).astype('uint8')
            cv2.imwrite(str(path), np.repeat(gray[:, :, None], 3, axis=2))
            result = SimpleNamespace(returncode=0, stdout=b'text\tconf\nSloth\t95\n')
            with patch('local_media_check.shutil.which', return_value='tesseract'), \
                 patch('local_media_check.ocr_language', return_value='eng'), \
                 patch('local_media_check.subprocess.run', return_value=result) as ocr:
                strict = analyze({'paths': [str(path)]})
                self.assertFalse(strict['frames'][0]['approved'])
                self.assertIn('Readable source text detected', strict['frames'][0]['issues'])
                ocr.reset_mock()
                allowed = analyze({'paths': [str(path)], 'allowSourceText': True})
                self.assertTrue(allowed['frames'][0]['approved'])
                self.assertEqual(allowed['frames'][0]['ocr'], 'allowed-by-policy')
                ocr.assert_not_called()
                cv2.imwrite(str(path), np.zeros((240, 180, 3), dtype='uint8'))
                blank = analyze({'paths': [str(path)], 'allowSourceText': True})
                self.assertFalse(blank['frames'][0]['approved'])


if __name__ == '__main__':
    unittest.main()
