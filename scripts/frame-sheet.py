"""A contact sheet of timestamped frames, each kept at its own aspect, with brightness stats.

    python scripts/frame-sheet.py 'dir/f-*.png' out.jpg [cell=320] [cols=6]
Each label: file name, mean luminance, % near-black (<12), % near-white (>245).
"""
import glob, os, sys
import numpy as np
from PIL import Image, ImageDraw

pat, out = sys.argv[1], sys.argv[2]
cell = int(sys.argv[3]) if len(sys.argv) > 3 else 320
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 6
files = sorted(glob.glob(pat))
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cell, rows * (cell + 18)), (18, 18, 22))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB')
    a = np.asarray(im.convert('L'))
    lab = f"{os.path.basename(f)[:26]} L{a.mean():.0f} k{(a < 12).mean() * 100:.0f} w{(a > 245).mean() * 100:.1f}"
    im.thumbnail((cell, cell))
    x, y = (i % cols) * cell, (i // cols) * (cell + 18)
    sheet.paste(im, (x + (cell - im.width) // 2, y + 18 + (cell - im.height) // 2))
    d.text((x + 3, y + 3), lab, fill=(255, 220, 120))
sheet.save(out, quality=86)
print(out, sheet.size, len(files))
