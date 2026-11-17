"""Generate app icons (needs Pillow: pip install pillow). Run: python tools/make_icons.py"""
from PIL import Image, ImageDraw, ImageFont
import os
out = os.path.join(os.path.dirname(__file__), "..", "icons")
RED, WHITE = (200, 16, 46), (255, 255, 255)

def font(size):
    for f in ("arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf", "/System/Library/Fonts/Helvetica.ttc"):
        try: return ImageFont.truetype(f, size)
        except OSError: pass
    return ImageFont.load_default()

def icon(size):
    s = size * 4                                   # draw large, downsample for smooth edges
    img = Image.new("RGB", (s, s), RED)            # full-bleed: iOS rounds the corners itself
    d = ImageDraw.Draw(img)
    # white Nordic-cross stripes, offset to the left like the Dannebrog
    x, w = int(s * .34), int(s * .09)
    d.rectangle([x, 0, x + w, s], fill=WHITE)
    d.rectangle([0, int(s * .46), s, int(s * .46) + w], fill=WHITE)
    f = font(int(s * .2)); t = "at"
    bb = d.textbbox((0, 0), t, font=f)
    d.text(((s - (bb[2] - bb[0])) / 2 - bb[0] + s * .17, s * .8 - bb[3]), t, font=f, fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)

for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
    icon(size).save(os.path.join(out, name)); print("wrote", name)
