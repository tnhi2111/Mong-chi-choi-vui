"""Brightness of every filmed transition frame, and contact strips to look at.

    python scripts/frame-stats.py qa-output/tm-1280x800 [--strips]

For each scenario prints, per frame: mean luminance (0-255) and the share of near-black
(< 14) and near-white (> 240) pixels. A cover shows up as a frame whose dark or white share
jumps far above its neighbours. Flags a frame that is > 60 % near-black or > 35 % near-white,
or whose brightness drops below 60 % of the darker of the two ends (before / last frame).
With --strips, writes <scenario>-strip.jpg (every other frame, 5 per row) next to them.
Needs Pillow + numpy.
"""
import sys
import glob
import os
import re
import numpy as np
from PIL import Image

folder = sys.argv[1]
strips = '--strips' in sys.argv
groups = {}
for f in sorted(glob.glob(os.path.join(folder, '*.png'))):
    m = re.match(r'([a-z]+)-(before|\d+)\.png$', os.path.basename(f))
    if m:
        groups.setdefault(m.group(1), []).append(f)

bad = 0
for name, files in sorted(groups.items()):
    files.sort(key=lambda f: -1 if f.endswith('before.png') else int(re.findall(r'(\d+)\.png$', f)[0]))
    rows = []
    ends = [np.asarray(Image.open(f).convert('L'), dtype=np.float32).mean() for f in (files[0], files[-1])]
    floor = min(ends) * 0.6
    for f in files:
        a = np.asarray(Image.open(f).convert('L'), dtype=np.float32)
        lum, dark, white = a.mean(), (a < 14).mean() * 100, (a > 240).mean() * 100
        flag = ' <-- cover?' if dark > 60 or white > 35 or lum < floor else ''
        bad += 1 if flag else 0
        rows.append(f"{os.path.basename(f):>14}  lum {lum:6.1f}  dark {dark:5.1f}%  white {white:5.1f}%{flag}")
    print(f"== {name}")
    print('\n'.join(rows))
    if strips:
        pick = files[::2]
        thumbs = [Image.open(f).convert('RGB') for f in pick]
        tw = 320
        th = int(thumbs[0].height * tw / thumbs[0].width)
        cols = 5
        rws = (len(thumbs) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * tw, rws * th), (0, 0, 0))
        for i, t in enumerate(thumbs):
            sheet.paste(t.resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
        sheet.save(os.path.join(folder, f'{name}-strip.jpg'), quality=82)

print(f"\n{bad} frame(s) flagged")
