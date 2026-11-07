"""Decode uploaded raster logos; bound dimensions and preserve transparency."""
import sys
import warnings
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = 4_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
with Image.open(sys.argv[1]) as source:
    if source.format not in ('PNG', 'JPEG', 'WEBP'):
        raise ValueError('Logo must be a PNG, JPEG or WebP image')
    if source.width < 8 or source.height < 8 or source.width * source.height > 4_000_000:
        raise ValueError('Logo dimensions must be at least 8 pixels and at most 4 megapixels')
    image = ImageOps.exif_transpose(source).convert('RGBA')
    image.thumbnail((106, 108), Image.Resampling.LANCZOS)
    output = Image.new('RGBA', (106, 108))
    output.alpha_composite(image, ((106-image.width)//2, (108-image.height)//2))
    output.save(sys.argv[2], 'PNG')
