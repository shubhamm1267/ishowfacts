"""Bounded CPU checks; this is not semantic subject/action recognition."""
import argparse
import csv
import io
import json
import os
import shutil
import subprocess
import sys
from functools import lru_cache

import cv2
import numpy as np

cv2.setNumThreads(1)


@lru_cache(maxsize=1)
def ocr_language(binary):
    result = subprocess.run([binary, '--list-langs'], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=3, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    available = result.stdout.decode('utf8', errors='replace').splitlines()
    return '+'.join(lang for lang in ('eng', 'hin') if lang in available) or 'eng'


def frame_metrics(path, source=True, fit='cover', allow_source_text=False):
    image = cv2.imread(path, cv2.IMREAD_COLOR)
    if image is None:
        return {'approved': False, 'issues': ['Frame cannot be decoded']}
    height, width = image.shape[:2]
    scale = min(1, 640 / max(height, width))
    small = cv2.resize(image, (max(1, round(width * scale)), max(1, round(height * scale))))
    # Export contains our intended headline/logo. OCR must only inspect sources.
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    black = float(np.mean(gray < 9))
    white = float(np.mean(gray > 248))
    contrast = float(gray.std())
    issues = []
    if min(width, height) < 80:
        issues.append('Frame dimensions are too small')
    if black > .985 or white > .995 or contrast < 2:
        issues.append('Blank or near-uniform frame')
    if source and sharpness < 4 and contrast > 2:
        issues.append('Severely blurred source frame')
    if source and fit == 'cover':
        # Same centre cover geometry as the reference template, checked cheaply.
        h, w = gray.shape
        ratio = 1080 / 1378
        cw, ch = (max(1, round(h * ratio)), h) if w / h > ratio else (w, max(1, round(w / ratio)))
        crop = gray[(h-ch)//2:(h-ch)//2+ch, (w-cw)//2:(w-cw)//2+cw]
        if crop.std() < 2 or np.mean(crop < 9) > .985:
            issues.append('Centre portrait crop is blank; use entire-image framing')
    # Detect a large, uniform, rectangular chroma insert, not textured grass/sky.
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array([35, 110, 65]), np.array([140, 255, 255]))
    for contour in cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0]:
        x, y, w, h = cv2.boundingRect(contour)
        if w * h < small.shape[0] * small.shape[1] * .12:
            continue
        area = cv2.contourArea(contour) / max(1, w * h)
        patch = small[y:y+h, x:x+w]
        channel_std = float(np.mean(np.std(patch, axis=(0, 1))))
        if area > .92 and channel_std < 13:
            issues.append('Large uniform green/blue placeholder-like rectangle')
            break
    mini = cv2.resize(gray, (9, 8), interpolation=cv2.INTER_AREA)
    bits = (mini[:, 1:] > mini[:, :-1]).reshape(-1)
    dhash = format(sum(int(bit) << i for i, bit in enumerate(bits)), '016x')
    text = []
    ocr = shutil.which('tesseract') if source and not allow_source_text else None
    ocr_status = 'not-run-on-export' if not source else ('allowed-by-policy' if allow_source_text else 'unavailable')
    if ocr:
        # No shell, temporary files, network or model downloads.
        encoded = cv2.imencode('.png', small)[1].tobytes()
        try:
            result = subprocess.run([ocr, 'stdin', 'stdout', '-l', ocr_language(ocr), '--psm', '11', 'tsv'], input=encoded,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=6,
                                    env={**os.environ, 'OMP_THREAD_LIMIT': '1'},
                                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if result.returncode:
                ocr_status = 'failed'
            else:
                ocr_status = 'checked'
                for row in csv.DictReader(io.StringIO(result.stdout.decode('utf8', errors='replace')), delimiter='\t'):
                    word = row.get('text', '').strip()
                    if float(row.get('conf', -1)) >= 70 and sum(c.isalnum() for c in word) >= 3:
                        text.append(word)
        except (subprocess.TimeoutExpired, ValueError):
            ocr_status = 'failed'
    if text:
        issues.append('Readable source text detected')
    return {'approved': not issues, 'issues': issues, 'width': width, 'height': height,
            'sharpness': round(sharpness, 2), 'blackRatio': round(black, 4), 'hash': dhash,
            'hashUseful': bool(contrast > 12 and 8 < sum(bits) < 56),
            'ocr': ocr_status, 'detectedWords': text[:20]}


def analyze(request):
    paths = request.get('paths', [])
    if not paths or len(paths) > 96:
        raise ValueError('Expected 1-96 sampled frames')
    frames = [frame_metrics(path, request.get('source', True), request.get('fit', 'cover'), request.get('allowSourceText', False)) for path in paths]
    warnings = []
    if any(f.get('ocr') in ('unavailable', 'failed') for f in frames):
        warnings.append('Local OCR unavailable or failed; embedded text was not fully checked. Install Tesseract for text checks.')
    return {'frames': frames, 'warnings': warnings, 'semanticIdentityChecked': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--request', required=True)
    args = parser.parse_args()
    json.dump(analyze(json.loads(args.request)), sys.stdout)
