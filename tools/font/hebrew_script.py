"""Build "Miriam Magic": an original Hebrew display font in a playful fairy-tale
brush style, made to sit next to the Waltograph Latin lettering.

Each letter is drawn as one or more brush strokes along a smooth centre line.
The brush is a flat nib held at an angle (thick downstrokes, thin
horizontals), with a round blob where the stroke starts and an optional curl
where it ends. The outlines are written as a TrueType font with fontTools.

    python tools/font/hebrew_script.py src/assets/fonts/miriam-magic.woff2
"""
from __future__ import annotations

import math
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPM = 1000
TOP = 560          # letter height
SCALE = 1.12       # drawn at 560, set a little larger
NIB = math.radians(-38)   # angle of the flat nib
W = 120            # broadest stroke width
THIN = 0.46        # thinnest part, as a share of W


def catmull(pts: list[tuple[float, float]], steps: int = 14) -> list[tuple[float, float]]:
    """Smooth curve through the given points."""
    if len(pts) < 3:
        (x0, y0), (x1, y1) = pts
        return [(x0 + (x1 - x0) * t / steps, y0 + (y1 - y0) * t / steps) for t in range(steps + 1)]
    p = [pts[0]] + pts + [pts[-1]]
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                                   + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in (0, 1)))
    out.append(pts[-1])
    return out


def curl(end: tuple[float, float], prev: tuple[float, float], turn: float, size: float) -> list[tuple[float, float]]:
    """A little spiral that continues the stroke's direction and rolls inward."""
    ang = math.atan2(end[1] - prev[1], end[0] - prev[0])
    pts, x, y, r = [], end[0], end[1], size
    for i in range(1, 16):
        ang += turn * 0.42
        r *= 0.9
        x += math.cos(ang) * r * 0.42
        y += math.sin(ang) * r * 0.42
        pts.append((x, y))
    return pts


def stroke(spec: dict) -> list[list[tuple[float, float]]]:
    """Outline polygons for one brush stroke."""
    pts = catmull(spec["p"])
    if spec.get("curl"):
        turn, size = spec["curl"]
        pts = pts + curl(pts[-1], pts[-2], turn, size)
    if spec.get("curl0"):
        turn, size = spec["curl0"]
        head = curl(pts[0], pts[1], turn, size)
        pts = list(reversed(head)) + pts
    n = len(pts)
    wmul = spec.get("w", 1.0)
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        # flat nib: width depends on how the stroke crosses the nib angle
        cross = abs(math.sin(math.atan2(dy, dx) - NIB))
        t = i / (n - 1)
        taper = min(1.0, 0.45 + t * 4) * min(1.0, 0.25 + (1 - t) * 3.2)
        if spec.get("curl"):
            taper *= 1.0 if t < 0.75 else max(0.35, 1 - (t - 0.75) * 2.4)
        width = W * wmul * (THIN + (1 - THIN) * cross) * taper / 2
        left.append((x + nx * width, y + ny * width))
        right.append((x - nx * width, y - ny * width))
    polys = [left + list(reversed(right))]
    # a round drop of ink where the brush first touches the paper
    if not spec.get("nodot"):
        x, y = pts[0] if not spec.get("curl0") else pts[len(pts) // 6]
        r = W * wmul * spec.get("dot", 0.6)
        polys.append([(x + math.cos(k / 18 * 2 * math.pi) * r, y + math.sin(k / 18 * 2 * math.pi) * r) for k in range(18)])
    return polys


def area(poly):
    return sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly))) / 2


# centre lines of each letter (x to the right, y up, baseline 0, letter height TOP)
S = lambda p, **k: {"p": p, **k}
LETTERS: dict[str, tuple[int, list[dict]]] = {
    "א": (520, [S([(70, 560), (250, 300), (430, 10)], curl0=(1, 33)), S([(440, 560), (400, 400), (310, 330)]), S([(200, 250), (150, 120), (90, 0)], curl=(-1, 40))]),
    "ב": (520, [S([(40, 520), (200, 565), (370, 540), (420, 440), (415, 70)], curl0=(1, 38)), S([(490, 10), (300, -6), (50, 10)], curl=(1, 46))]),
    "ג": (400, [S([(70, 540), (220, 570), (300, 480), (300, 40)], curl0=(1, 33)), S([(300, 200), (200, 80), (80, 0)], curl=(-1, 40))]),
    "ד": (500, [S([(30, 530), (240, 568), (470, 540)], curl0=(1, 33), curl=(1, 40)), S([(390, 560), (395, 300), (385, 0)], nodot=True)]),
    "ה": (500, [S([(30, 540), (240, 568), (440, 540), (440, 400), (430, 0)]), S([(100, 300), (100, 150), (95, 0)])]),
    "ו": (240, [S([(80, 520), (160, 570), (180, 460), (175, 0)], curl0=(1, 30))]),
    "ז": (360, [S([(40, 540), (180, 570), (330, 530)], curl0=(1, 30), curl=(1, 34)), S([(190, 550), (200, 300), (170, 0)], nodot=True)]),
    "ח": (520, [S([(90, 0), (90, 300), (110, 520), (200, 570), (360, 570), (440, 500), (440, 0)], nodot=True)]),
    "ט": (520, [S([(240, 410), (110, 560), (80, 300), (130, 60), (280, -10), (440, 90), (450, 330), (440, 560)], curl=(1, 40))]),
    "י": (230, [S([(50, 520), (140, 570), (170, 460), (110, 300)], curl0=(1, 27))]),
    "כ": (480, [S([(40, 540), (240, 568), (420, 470), (440, 270), (400, 70), (230, -6), (40, 20)], curl0=(1, 33), curl=(1, 40))]),
    "ך": (440, [S([(40, 540), (240, 568), (380, 520), (390, 200), (380, -260)], curl0=(1, 33))]),
    "ל": (470, [S([(80, 860), (90, 700), (110, 580), (300, 560), (420, 470), (360, 250), (230, 20)], curl0=(1, 33), curl=(-1, 36))]),
    "מ": (520, [S([(150, 540), (300, 568), (440, 500), (450, 260), (430, 0), (260, 0)], curl=(1, 40)), S([(60, 560), (190, 320), (100, 0)], curl0=(1, 27))]),
    "ם": (500, [S([(60, 520), (250, 570), (440, 520), (450, 270), (420, 0), (240, -6), (70, 0), (60, 270), (70, 500)], curl0=(1, 33))]),
    "נ": (330, [S([(60, 520), (180, 570), (250, 450), (250, 60), (180, 0), (40, 10)], curl0=(1, 30), curl=(1, 34))]),
    "ן": (260, [S([(60, 520), (160, 570), (190, 450), (180, -260)], curl0=(1, 30), curl=(-1, 34))]),
    "ס": (500, [S([(60, 540), (250, 570), (440, 520), (450, 280), (320, 30), (160, 20), (70, 200), (70, 520)], curl0=(1, 30))]),
    "ע": (500, [S([(450, 560), (400, 300), (260, 60), (50, 0)], curl=(1, 40)), S([(90, 560), (140, 360), (230, 200)], curl0=(1, 27))]),
    "פ": (500, [S([(40, 540), (240, 568), (420, 480), (450, 270), (400, 60), (220, -6), (40, 20)], curl=(1, 40)), S([(70, 560), (100, 380), (220, 340)], curl0=(1, 24), curl=(1, 30))]),
    "ף": (450, [S([(40, 540), (240, 568), (380, 520), (390, 200), (380, -260)]), S([(70, 560), (100, 380), (220, 340)], curl0=(1, 24), curl=(1, 30))]),
    "צ": (480, [S([(70, 560), (200, 300), (330, 80)], curl0=(1, 27)), S([(450, 560), (410, 380), (280, 300)]), S([(460, 10), (260, -6), (50, 10)], curl=(1, 40))]),
    "ץ": (450, [S([(70, 560), (200, 330), (250, 100), (240, -260)], curl0=(1, 27)), S([(420, 560), (390, 400), (250, 320)])]),
    "ק": (500, [S([(40, 540), (240, 568), (420, 500), (440, 300), (420, 0)], curl0=(1, 33)), S([(110, 370), (110, 0), (100, -260)])]),
    "ר": (450, [S([(40, 540), (230, 570), (390, 520), (410, 300), (400, 0)], curl0=(1, 33))]),
    "ש": (560, [S([(60, 560), (60, 200), (160, 10), (380, 0), (480, 160), (490, 560)], curl0=(1, 30)), S([(280, 560), (275, 300), (300, 140)])]),
    "ת": (520, [S([(40, 530), (240, 568), (440, 520), (460, 300), (450, 0)], curl0=(1, 33)), S([(140, 520), (140, 120), (50, 0)], nodot=True, curl=(-1, 34))]),
}
for p in ("־", "׳", "״"):
    pass


def glyph(strokes):
    pen = TTGlyphPen(None)
    for st in strokes:
        for poly in stroke(st):
            if area(poly) < 0:   # TrueType outer contours run clockwise
                pass
            else:
                poly = list(reversed(poly))
            k = SCALE
            pen.moveTo((round(poly[0][0] * k + 20), round(poly[0][1] * k)))
            for p in poly[1:]:
                pen.lineTo((round(p[0] * k + 20), round(p[1] * k)))
            pen.closePath()
    return pen.glyph()


def build(out: str) -> None:
    names = [".notdef", "space"] + [f"uni{ord(c):04X}" for c in LETTERS]
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(names)
    cmap = {32: "space"}
    cmap.update({ord(c): f"uni{ord(c):04X}" for c in LETTERS})
    fb.setupCharacterMap(cmap)
    glyphs = {".notdef": TTGlyphPen(None).glyph(), "space": TTGlyphPen(None).glyph()}
    metrics = {".notdef": (500, 0), "space": (260, 0)}
    for c, (adv, strokes) in LETTERS.items():
        g = f"uni{ord(c):04X}"
        glyphs[g] = glyph(strokes)
        metrics[g] = (round(adv * SCALE) + 60, 0)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({k: (w, l) for k, (w, l) in metrics.items()})
    fb.setupHorizontalHeader(ascent=900, descent=-300)
    fb.setupNameTable({"familyName": "Miriam Magic", "styleName": "Regular", "copyright": "Original lettering for Miriam's Coloring Books"})
    fb.setupOS2(sTypoAscender=900, sTypoDescender=-300, usWinAscent=950, usWinDescent=320)
    fb.setupPost()
    fb.font.flavor = "woff2" if out.endswith(".woff2") else None
    fb.save(out)


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "miriam-magic.woff2")
