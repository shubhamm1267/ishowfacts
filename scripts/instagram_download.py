"""Bounded public Instagram video download. No login/cookies/proxies/browser."""
import argparse
import json
import os
import subprocess
from pathlib import Path
from urllib.parse import urlparse
import re

if os.name == 'nt':
    class HiddenPopen(subprocess.Popen):
        def __init__(self, *args, **kwargs):
            kwargs['creationflags'] = kwargs.get('creationflags', 0) | subprocess.CREATE_NO_WINDOW
            super().__init__(*args, **kwargs)
    subprocess.Popen = HiddenPopen

import yt_dlp

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--metadata', required=True)
args = parser.parse_args()
url = urlparse(args.url)
match = re.fullmatch(r'/reel/([A-Za-z0-9_-]{5,40})/', url.path)
if url.scheme != 'https' or url.netloc != 'www.instagram.com' or not match or url.query or url.fragment:
    raise ValueError('Canonical public Instagram video URL required')
output = Path(args.output).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
limit = 80 * 1024 * 1024

def progress(data):
    if data.get('downloaded_bytes', 0) > limit:
        raise RuntimeError('Instagram source exceeds 80 MB limit')

options = {'quiet': True, 'no_warnings': True, 'noplaylist': True, 'cachedir': False,
           'continuedl': False, 'overwrites': True,
           'socket_timeout': 6, 'retries': 0, 'extractor_retries': 0, 'fragment_retries': 0,
           'format': 'best[height<=1080][ext=mp4]/best[height<=1080]/best',
           'max_filesize': limit, 'progress_hooks': [progress], 'outtmpl': str(output)}
with yt_dlp.YoutubeDL(options) as downloader:
    info = downloader.extract_info(args.url, download=True)
    if info.get('_type') in ('playlist', 'multi_video') or not output.is_file():
        raise ValueError('Single downloadable video required')
    if str(info.get('id')) != match[1] or output.stat().st_size > limit:
        raise ValueError('Invalid source identity or size')
    Path(args.metadata).write_text(json.dumps({'source': args.url, 'id': match[1],
        'title': info.get('title'), 'author': info.get('uploader')}, ensure_ascii=False), encoding='utf-8')
