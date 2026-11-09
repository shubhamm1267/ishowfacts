"""Native FFmpeg composition for ordinary reference footage; complex art stays in Pillow."""
import math
import os
import tempfile
import subprocess
from pathlib import Path

from PIL import Image


def render_reference(reel, width, height, fps, silent, run, popen=None):
    if not reel.scenes or reel.scenes[0]['start'] != 0:
        return False
    fade = reel.meta.get('end_fade', .27)
    if int(reel.dur * fps) < 1 or (fade and reel.scenes[-1]['start'] > reel.dur - fade):
        return False
    def supported(scene):
        media = scene.get('reference_media')
        return not (not media or media.get('pointer') or media.get('subject_focus') or media.get('attribution')
                or (scene.get('beat_text_hi') and not scene.get('beat_text_image'))
                or (reel.meta.get('headline_hi') and reel.headline_image is None)
                or media.get('camera', 'push') not in ('static', 'push', 'pull', 'pan-left', 'pan-right')
                or (media.get('fit', reel.meta.get('media_fit', 'cover')) == 'contain'
                    and media.get('camera', 'push') != 'static')
                or (media.get('media_type') == 'video' and media.get('video_fps') != fps))
    eligible = [supported(scene) for scene in reel.scenes]
    if not any(eligible) or (not all(eligible) and popen is None):
        return False
    ow, oh = map(int, reel.meta.get('output_size', [width, height]))
    if ow < width or oh < height or ow % 2 or oh % 2:
        raise ValueError('Output canvas must contain the full composition and have even dimensions')
    total = int(reel.dur * fps)
    top = reel.meta.get('headline_height', 164) if reel.meta.get('headline_hi') else 0
    vh = height - top
    threads = os.getenv('PAPERDOC_THREADS', '2')
    with tempfile.TemporaryDirectory(prefix='native-render-', dir=reel.out.parent) as work:
        work = Path(work)
        parts = []
        for index, scene in enumerate(reel.scenes):
            start = scene['start']
            end = reel.scenes[index + 1]['start'] if index + 1 < len(reel.scenes) else reel.dur
            first = math.ceil(start * fps)
            last = min(total, math.ceil(end * fps))
            count = last - first
            if count <= 0:
                continue
            part = work / f'part-{index}.mp4'
            if not eligible[index]:
                # A diagram/pointer keeps its original drawing code, without
                # forcing the other ordinary footage scenes through Pillow.
                enc = popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                             '-s', f'{width}x{height}', '-r', str(fps), '-i', '-',
                             '-vf', f'pad={ow}:{oh}:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
                             '-c:v', 'libx264', '-preset', os.getenv('PAPERDOC_PRESET', 'veryfast'),
                             '-crf', os.getenv('PAPERDOC_CRF', '17'), '-threads', threads,
                             '-pix_fmt', 'yuv420p', '-color_range', 'tv', str(part)], stdin=subprocess.PIPE)
                try:
                    for n in range(first, last):
                        enc.stdin.write(reel.render_frame(n/fps).tobytes())
                    enc.stdin.close()
                    if enc.wait() != 0:
                        raise RuntimeError('Original scene encoder failed')
                finally:
                    if enc.poll() is None:
                        enc.kill()
                        enc.wait()
                parts.append(part)
                print(f'  {100 * last // total}% ({last}/{total} frames) [original animation]', flush=True)
                continue
            media = scene['reference_media']
            video = media['media_type'] == 'video'
            source = reel.resolve(media['frames']) / '000000.jpg' if video else reel.resolve(media['image'])
            with Image.open(source) as image:
                sw, sh = image.size
            overlay = Image.new('RGBA', (width, height))
            if reel.headline_image is not None:
                overlay.alpha_composite(reel.headline_image, (0, 0))
            if scene.get('beat_text_image'):
                with Image.open(reel.resolve(scene['beat_text_image'])) as label:
                    overlay.alpha_composite(label.convert('RGBA'), ((width - label.width) // 2, height - 190))
            if reel.logo_image is not None:
                overlay.alpha_composite(reel.logo_image, (22, top + 24))
            overlay_path = work / f'overlay-{index}.png'
            overlay.save(overlay_path)
            overlay.close()
            # Preserve the existing per-shot camera easing and full portrait canvas.
            p = f'min(1,max(0,(n/{fps}+{first / fps - start})/{max(.1, end-start)}))'
            ease = f'if(lt({p},0.5),4*pow({p},3),1-pow(-2*{p}+2,3)/2)'
            camera = media.get('camera', 'push')
            zoom = '1' if camera == 'static' else f'1+0.045*({ease})'
            if camera == 'pull':
                zoom = f'1.045-0.045*({ease})'
            fit = media.get('fit') or reel.meta.get('media_fit', 'cover')
            k = max(width/sw, vh/sh) if fit == 'cover' else min(width/sw, vh/sh)
            if fit == 'cover':
                # Fixed-size crops keep FFmpeg buffers stable. Zoompan scales only
                # the visible viewport, rather than enlarging a wide source first.
                cw, ch = min(sw, int(width / k)), min(sh, int(vh / k))
                x = '(iw-ow)/2'
                if camera in ('pan-left', 'pan-right'):
                    direction = 1 if camera == 'pan-left' else -1
                    x = f'(iw-ow)/2-{direction}*({p}-0.5)*(iw-ow)'
                zoom = zoom.replace('n/', 'on/')
                viewport = (f"crop={cw}:{ch}:x='{x}':y='(ih-oh)/2':exact=1,"
                            f"zoompan=z='{zoom}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':"
                            f'd=1:s={width}x{vh}:fps={fps}')
            else:
                dw, dh = max(1, int(sw*k)), max(1, int(sh*k))
                viewport = f'scale={dw}:{dh}:flags=bicubic,pad={width}:{vh}:(ow-iw)/2:(oh-ih)/2:black'
            still_loop = '' if video else f'loop=loop=-1:size=1:start=0,setpts=N/{fps}/TB,'
            graph = (f'[0:v]{still_loop}scale=in_range=auto:out_range=tv,format=yuv420p,{viewport},setsar=1,'
                     f'pad={width}:{height}:0:{top}:black[media];'
                     '[media][1:v]overlay=0:0:format=yuv420:eof_action=repeat:repeatlast=1[composed]')
            tail = []
            fade = reel.meta.get('end_fade', .27)
            if fade and end > reel.dur - fade:
                tail.append(f'fade=t=out:st={reel.dur-fade-first/fps}:d={fade}')
            tail.extend([f'pad={ow}:{oh}:(ow-iw)/2:(oh-ih)/2:black',
                         'scale=in_range=auto:out_range=tv', 'format=yuv420p', 'setparams=range=limited'])
            graph += ';[composed]' + ','.join(tail) + '[out]'
            inputs = ['-framerate', str(fps), '-start_number', '0', '-i', str(reel.resolve(media['frames']) / '%06d.jpg')] if video else ['-framerate', str(fps), '-i', str(source)]
            run(['ffmpeg', '-v', 'error', '-y', *inputs,
                 '-i', str(overlay_path),
                 '-filter_complex', graph, '-map', '[out]', '-an', '-frames:v', str(count),
                 '-c:v', 'libx264', '-preset', os.getenv('PAPERDOC_PRESET', 'veryfast'),
                 '-crf', os.getenv('PAPERDOC_CRF', '17'), '-threads', threads,
                 '-pix_fmt', 'yuv420p', '-color_range', 'tv', str(part)], check=True)
            parts.append(part)
            print(f'  {100 * last // total}% ({last}/{total} frames) [native FFmpeg]', flush=True)
        listing = work / 'parts.txt'
        listing.write_text('\n'.join(f"file '{p.name}'" for p in parts), encoding='utf8')
        run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', str(listing),
             '-map', '0:v:0', '-c:v', 'copy', str(silent)], check=True)
    return True
