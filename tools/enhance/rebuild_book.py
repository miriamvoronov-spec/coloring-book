"""Rebuild a processed book (made by enhance.py) so every page keeps its colour squares at the bottom,
and attach each page's solution from the back of the book.

    python tools/enhance/rebuild_book.py "<book.pdf>" output/<book> <out-folder> [page,page,...]

Used for "LES GRANDS CLASSIQUES TOME 7". The result folder holds manifest.json and the page files;
zip it with manifest.json renamed to book.json to get a .colorbook for the app.
"""
import json, os, sys
import numpy as np, cv2, pymupdf
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from enhance import legend as G

PDF = sys.argv[1]
SRC = sys.argv[2]
OUT = sys.argv[3]
only = [int(x) for x in sys.argv[4].split(',')] if len(sys.argv) > 4 else None
os.makedirs(OUT, exist_ok=True)
doc = pymupdf.open(PDF)
man = json.load(open(os.path.join(SRC, 'manifest.json')))

def scan(num):
    page = doc[num - 1]
    imgs = page.get_images(full=True)
    if imgs:
        best = max(imgs, key=lambda i: i[2] * i[3])
        pix = pymupdf.Pixmap(doc, best[0])
    else:
        pix = page.get_pixmap(dpi=600)
    if pix.n - pix.alpha != 3: pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    a = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3]
    return cv2.cvtColor(a, cv2.COLOR_RGB2BGR)

def with_legend(num, entry):
    bgr = scan(num)
    sw = G.find_swatches(bgr)
    lines = Image.open(os.path.join(SRC, entry['lines'])).convert('RGB')
    if not sw:
        return lines, 0
    top = min(s.box[1] for s in sw) - 25
    bot = min(bgr.shape[0], max(s.box[1] + s.box[3] for s in sw) + 25)
    strip = bgr[max(0, top):bot].copy()
    # whiten the paper so only the squares and their labels remain
    white = strip.min(axis=2) > 200
    strip[white] = 255
    strip[:, :max(1, strip.shape[1] // 120)] = 255
    s = lines.height / bgr.shape[0]
    strip_rgb = Image.fromarray(cv2.cvtColor(strip, cv2.COLOR_BGR2RGB)).resize((max(1, round(strip.shape[1] * s)), max(1, round(strip.shape[0] * s))), Image.LANCZOS)
    lines.paste(strip_rgb, (0, round(max(0, top) * s)))
    return lines, len(sw)

def solutions():
    """Solution k sits on page 106 + (k-1)//4, in a 2x2 grid read left to right."""
    out = {}
    for pnum in range(106, 131):
        bgr = scan(pnum)
        h, w = bgr.shape[:2]
        ink = (bgr.min(axis=2) < 225).astype(np.uint8)
        ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats(ink, 8)
        boxes = [st[i] for i in range(1, n) if st[i, 4] > 0.04 * h * w and st[i, 2] > 0.25 * w and st[i, 3] > 0.25 * h]
        boxes = sorted(boxes, key=lambda b: (round((b[1] + b[3] / 2) / (h / 2)), b[0]))
        for i, b in enumerate(boxes[:4]):
            k = (pnum - 106) * 4 + i + 1
            x, y, bw, bh = b[:4]
            crop = cv2.cvtColor(bgr[y:y + bh, x:x + bw], cv2.COLOR_BGR2RGB)
            im = Image.fromarray(crop); im.thumbnail((1300, 1300), Image.LANCZOS)
            out[k] = im
        if len(boxes) != 4: print('page', pnum, 'found', len(boxes), 'pictures')
    return out

sols = solutions()
pages = []
for p in man['pages']:
    p = dict(p)
    if p.get('lines'):
        num = int(p['lines'][1:4])
        if only and num not in only: pages.append(p); continue
        im, nsw = with_legend(num, p)
        im = im.quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        im.save(os.path.join(OUT, p['lines']), optimize=True)
        k = num - 3
        if k in sols:
            name = f's{num:03d}.jpg'
            sols[k].save(os.path.join(OUT, name), quality=80, optimize=True, progressive=True)
            p['solution'] = name
        if nsw == 0: print('no squares on', num)
    else:
        if not only:
            Image.open(os.path.join(SRC, p['image'])).save(os.path.join(OUT, p['image']), quality=88)
    pages.append(p)
man['pages'] = pages
json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w'), ensure_ascii=False)
print('pages', len(pages), 'solutions', len(sols), 'MB', sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) // 1e6)
