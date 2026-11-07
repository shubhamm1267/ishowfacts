"""Functional crop regression tests; no network, speech, or story fixtures."""
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops
from media_framing import crop_media
from paper_doc import Reel


class MediaFramingTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.source = Image.new('RGB', (800, 300), 'blue')
        ImageDraw.Draw(self.source).rectangle((600, 50, 700, 250), fill='red')
        self.source.save(self.root / 'source.png')

    def render(self, media):
        plan = {'meta': {'size': [80, 120], 'fps': 1, 'duration': 2,
                         'out': 'out.mp4', 'media_fit': 'cover', 'end_fade': 0},
                'scenes': [{'start': 0, 'reference_media': media}]}
        path = self.root / 'plan.json'
        path.write_text(json.dumps(plan), encoding='utf-8')
        reel = Reel(path)
        return reel.render_reference_media(plan['scenes'][0], .5, 2, 0, .5)

    def test_off_center_subject_is_recovered_without_a_pointer(self):
        media = {'image': 'source.png', 'media_type': 'photo', 'camera': 'static',
                 'subject_focus': [{'at': .5, 'point': [.8125, .5]}]}
        image = self.render(media)
        self.assertEqual(image.getpixel((40, 60)), (255, 0, 0))
        expected = crop_media(self.source, (80, 120), focus=[.8125, .5])
        self.assertIsNone(ImageChops.difference(image, expected).getbbox())

    def test_per_shot_contain_keeps_both_sides_without_blurred_fill(self):
        media = {'image': 'source.png', 'media_type': 'photo', 'camera': 'static', 'fit': 'contain'}
        image = self.render(media)
        expected = crop_media(self.source, (80, 120), fit='contain')
        self.assertIsNone(ImageChops.difference(image, expected).getbbox())
        self.assertEqual(image.getpixel((40, 0)), (0, 0, 0))

    def test_pointer_target_cannot_override_independent_subject_framing(self):
        media = {'image': 'source.png', 'media_type': 'photo', 'camera': 'static',
                 'subject_focus': [{'at': .5, 'point': [.8125, .5]}],
                 'pointer': {'tracks': [{'at': 0, 'point': [.1, .1]}], 'at': .9}}
        self.assertEqual(self.render(media).getpixel((40, 60)), (255, 0, 0))

    def test_uploaded_logo_matches_reference_position_and_translucency_on_every_frame(self):
        Image.new('RGB', (1080, 1378), (40, 80, 120)).save(self.root / 'media.png')
        Image.new('RGBA', (1080, 62), (0, 0, 0, 255)).save(self.root / 'header.png')
        logo = Image.new('RGBA', (106, 108), (240, 20, 180, 64))
        ImageDraw.Draw(logo).rectangle((0, 0, 105, 53), fill=(240, 20, 180, 255))
        logo.putpixel((0, 0), (240, 20, 180, 0))
        logo.save(self.root / 'logo.png')
        scene = {'start': 0, 'reference_media': {'image': 'media.png', 'media_type': 'photo', 'camera': 'static'}}
        plan = {'meta': {'size': [1080, 1440], 'duration': 2, 'out': 'out.mp4', 'end_fade': 0,
                         'headline_hi': 'test', 'headline_height': 62, 'headline_image': 'header.png',
                         'logo_image': 'logo.png', 'logo_opacity': .5}, 'scenes': [scene]}
        path = self.root / 'logo-plan.json'
        path.write_text(json.dumps(plan), encoding='utf-8')
        reel = Reel(path)
        first = reel.render_reference_media(scene, .5, 2, 0, .5)
        later = reel.render_reference_media(scene, 1.5, 2, 0, 1.5)
        self.assertEqual(first.getpixel((32, 96)), (140, 50, 150))
        self.assertEqual(first.getpixel((32, 160)), (65, 72, 128))
        for point in [(22, 86), (21, 96), (128, 96), (32, 194)]:
            self.assertEqual(first.getpixel(point), (40, 80, 120))
        self.assertIsNone(ImageChops.difference(first, later).getbbox())

    def test_export_canvas_preserves_entire_frame_without_side_crop(self):
        import shutil, subprocess, io
        plan = {'meta': {'size': [80, 120], 'output_size': [80, 160], 'fps': 2,
                        'duration': 1, 'out': 'out.mp4'}, 'scenes': [{'start': 0}]}
        path = self.root / 'canvas-plan.json'
        path.write_text(json.dumps(plan), encoding='utf-8')
        reel = Reel(path)
        frame = Image.new('RGB', (80, 120), 'white')
        ImageDraw.Draw(frame).rectangle((0, 0, 9, 119), fill='red')
        ImageDraw.Draw(frame).rectangle((70, 0, 79, 119), fill='blue')
        reel.render_frame = lambda t: frame
        reel.mux = lambda silent: shutil.copyfile(silent, reel.out)
        reel.render()
        data = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(reel.out), '-frames:v', '1',
                               '-f', 'image2pipe', '-vcodec', 'png', '-'], check=True, capture_output=True).stdout
        exported = Image.open(io.BytesIO(data)).convert('RGB')
        self.assertEqual(exported.size, (80, 160))
        self.assertLess(max(exported.getpixel((40, 5))), 12)
        self.assertGreater(exported.getpixel((3, 80))[0], 220)
        self.assertGreater(exported.getpixel((76, 80))[2], 220)
        self.assertGreater(min(exported.getpixel((40, 25))), 220)


if __name__ == '__main__':
    unittest.main()
