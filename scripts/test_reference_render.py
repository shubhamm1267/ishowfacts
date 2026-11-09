"""Compare native composition against the existing renderer on actual encoded frames."""
import io
import json
import math
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from paper_doc import Reel, run_hidden, popen_hidden
from reference_render import render_reference


class NativeReferenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        # A non-uniform, wide source exposes wrong aspect ratios and camera crops.
        pixels = np.zeros((180, 480, 3), dtype=np.uint8)
        pixels[:, :, 0] = np.arange(480)[None, :] // 2
        pixels[:, :, 1] = np.arange(180)[:, None]
        pixels[30:130, 210:270, 2] = 220
        Image.fromarray(pixels).save(self.root / 'source.png')
        Image.new('RGBA', (160, 18), (230, 200, 20, 255)).save(self.root / 'headline.png')
        Image.new('RGBA', (16, 16), (230, 10, 70, 160)).save(self.root / 'logo.png')

    def plan(self, scenes, duration=2.25):
        path = self.root / 'plan.json'
        data = {'meta': {'size': [160, 240], 'output_size': [160, 288], 'fps': 8,
                         'duration': duration, 'out': 'out.mp4', 'headline_hi': 'test',
                         'headline_height': 18, 'headline_image': 'headline.png',
                         'logo_image': 'logo.png', 'end_fade': .25}, 'scenes': scenes}
        path.write_text(json.dumps(data), encoding='utf8')
        return Reel(path)

    def compare(self, reel):
        target = self.root / 'native.mp4'
        self.assertTrue(render_reference(reel, 160, 240, 8, target, run_hidden, popen_hidden))
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(target), '-f', 'rawvideo',
                              '-pix_fmt', 'rgb24', '-'], check=True, capture_output=True).stdout
        actual = np.frombuffer(raw, dtype=np.uint8).reshape((-1, 288, 160, 3))
        self.assertEqual(len(actual), int(reel.dur * 8))
        for index, frame in enumerate(actual):
            reference = np.asarray(reel.render_frame(index / 8), dtype=np.float32)
            # Compare content, logo opacity, headline, crop, final fade and scene boundaries.
            error = np.mean(np.abs(frame[24:264].astype(np.float32) - reference))
            self.assertLess(error, 7, f'Frame {index}: mean pixel difference {error}')
            self.assertLess(frame[:22].max(), 15)

    def test_camera_cuts_title_logo_and_end_fade_match(self):
        scenes = [{'start': start, 'reference_media': {'image': 'source.png', 'media_type': 'photo',
                   'camera': camera, 'fit': 'cover'}}
                  for start, camera in [(0, 'static'), (.73, 'push'), (1.31, 'pan-left')]]
        self.compare(self.plan(scenes))

    def test_video_frames_and_contained_photo_preserve_timing(self):
        frames = self.root / 'frames'
        frames.mkdir()
        for index in range(12):
            with Image.open(self.root / 'source.png') as image:
                ImageDraw.Draw(image).rectangle((190 + index, 0, 210 + index, 179), fill='white')
                image.save(frames / f'{index:06d}.jpg')
        self.compare(self.plan([
            {'start': 0, 'reference_media': {'media_type': 'video', 'frames': 'frames', 'frame_count': 12,
                                           'video_fps': 8, 'camera': 'pull', 'fit': 'cover'}},
            {'start': 1.1, 'reference_media': {'media_type': 'photo', 'image': 'source.png',
                                            'camera': 'static', 'fit': 'contain'}}]))

    def test_complex_pointer_or_focus_uses_original_renderer(self):
        media = {'media_type': 'photo', 'image': 'source.png', 'camera': 'push', 'pointer': {'at': .5}}
        reel = self.plan([{'start': 0, 'reference_media': media}])
        self.assertFalse(render_reference(reel, 160, 240, 8, self.root / 'no.mp4', run_hidden))
        media.pop('pointer')
        media['subject_focus'] = [{'at': 0, 'point': [.8, .5]}]
        reel = self.plan([{'start': 0, 'reference_media': media}])
        self.assertFalse(render_reference(reel, 160, 240, 8, self.root / 'no.mp4', run_hidden))

    def test_only_complex_scene_uses_pillow_in_a_mixed_video(self):
        from unittest.mock import patch
        scenes = [{'start': start, 'reference_media': {'image': 'source.png', 'media_type': 'photo',
                   'camera': 'static', 'fit': 'cover'}} for start in (0, .73, 1.31)]
        scenes[1]['reference_media']['subject_focus'] = [{'at': 0, 'point': [.5, .5]}]
        reel = self.plan(scenes)
        with patch.object(reel, 'render_frame', wraps=reel.render_frame) as draw:
            self.compare(reel)
            # Five complex frames are composed with Pillow; the comparison itself draws all 18.
            self.assertEqual(draw.call_count, 23)

    def test_render_entry_point_keeps_continuous_audio_across_cuts(self):
        import wave
        reel = self.plan([{'start': start, 'reference_media': {'image': 'source.png',
                         'media_type': 'photo', 'camera': 'static'}} for start in (0, .73, 1.31)])
        rate = 48000
        tone = (.15 * np.sin(2 * np.pi * 440 * np.arange(int(reel.dur * rate)) / rate))
        with wave.open(str(self.root / 'voice.wav'), 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            wav.writeframes((tone * 32767).astype('<i2').tobytes())
        reel.meta.update({'voice': 'voice.wav', 'whoosh_db': None})
        reel.render()
        metrics = json.loads(reel.out.with_suffix('.render-metrics.json').read_text())
        self.assertEqual(metrics['mode'], 'ffmpeg')
        self.assertEqual(metrics['nativeScenes'], 3)
        self.assertEqual(metrics['originalScenes'], 0)
        probe = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                           'stream=codec_type,width,height:format=duration', '-of', 'json', str(reel.out)],
                          check=True, capture_output=True).stdout)
        self.assertEqual({s['codec_type'] for s in probe['streams']}, {'video', 'audio'})
        self.assertAlmostEqual(float(probe['format']['duration']), reel.dur, delta=.06)
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(reel.out), '-vn', '-ac', '1',
                              '-ar', '8000', '-f', 'f32le', '-'], check=True, capture_output=True).stdout
        audio = np.frombuffer(raw, dtype=np.float32)
        for at in (.7, .73, .76, 1.28, 1.31, 1.34):
            window = audio[int(at*8000):int((at+.02)*8000)]
            self.assertGreater(float(np.sqrt(np.mean(window**2))), .01)


if __name__ == '__main__':
    unittest.main()
