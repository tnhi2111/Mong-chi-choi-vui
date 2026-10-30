"""K: the paper's four corners in two screenshots (the page / the 3D sheet), compared.

    python scripts/handoff-corners.py page.png sheet.png '[[x,y],...]'   (the sheet's quad, px)
Prints the corners and the largest distance between matching corners.
"""
import json, sys
import numpy as np
from PIL import Image

def corners(path, quad):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.int32)
    h, w, _ = im.shape
    q = np.array(quad, dtype=float)
    x0, y0 = np.clip(q.min(0) - 24, 0, [w - 1, h - 1]).astype(int)
    x1, y1 = np.clip(q.max(0) + 24, 0, [w - 1, h - 1]).astype(int)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    # paper: light, warm, low saturation (the page's #f6ede3, lit 0.8–1.0 on the 3D side)
    m = (r > 165) & (g > 150) & (b > 140) & (r - b < 45) & (r - b > 2)
    sub = np.zeros_like(m)
    sub[y0:y1 + 1, x0:x1 + 1] = m[y0:y1 + 1, x0:x1 + 1]
    ys, xs = np.nonzero(sub)
    if len(xs) < 50:
        raise SystemExit(f'no paper found in {path}')
    s, d = xs + ys, xs - ys
    pick = lambda i: (float(xs[i]), float(ys[i]))
    return [pick(np.argmin(s)), pick(np.argmax(d)), pick(np.argmax(s)), pick(np.argmin(d))]

a, b, quad = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
ca, cb = corners(a, quad), corners(b, quad)
errs = [float(np.hypot(p[0] - q[0], p[1] - q[1])) for p, q in zip(ca, cb)]
print('page', [tuple(round(v) for v in c) for c in ca], 'sheet', [tuple(round(v) for v in c) for c in cb],
      'corners', [round(e, 1) for e in errs], f'max {max(errs):.1f} px')
