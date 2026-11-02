"""Offline sample art only: never used in production jobs."""
import math
import random
import sys
from PIL import Image, ImageDraw, ImageFilter

random.seed(8)
W = H = 900
im = Image.new('RGB', (W, H), (32, 72, 91))
d = ImageDraw.Draw(im)
for y in range(H):
    v = y / H
    d.line((0, y, W, y), fill=(int(34 - v * 18), int(105 - v * 48), int(128 - v * 50)))
for i in range(90):
    x = random.randrange(W)
    y = random.randrange(H)
    r = random.randrange(1, 4)
    d.ellipse((x - r, y - r, x + r, y + r), fill=(116, 164, 168))
for i in range(8):
    a = i * math.pi / 4
    pts = []
    for j in range(20):
        t = j / 19
        bend = math.sin(t * math.pi * 2 + i) * 70 * t
        pts.append((450 + math.cos(a) * (70 + 290 * t) + bend,
                    440 + math.sin(a) * (80 + 240 * t) + math.sin(j * .5 + i) * 15 * t))
    d.line(pts, fill=(245, 142, 99), width=46, joint='curve')
    d.line(pts, fill=(255, 185, 130), width=18, joint='curve')
    for j in range(5, 19, 2):
        x, y = pts[j]
        d.ellipse((x - 7, y - 7, x + 7, y + 7), fill=(250, 212, 161))
d.ellipse((275, 215, 625, 600), fill=(248, 151, 102), outline=(255, 205, 143), width=12)
d.ellipse((345, 370, 398, 433), fill=(255, 252, 216))
d.ellipse((502, 370, 555, 433), fill=(255, 252, 216))
d.ellipse((367, 391, 389, 423), fill=(30, 43, 52))
d.ellipse((524, 391, 546, 423), fill=(30, 43, 52))
d.arc((404, 420, 491, 500), 10, 165, fill=(139, 67, 63), width=8)
im.save(sys.argv[1], quality=91)
