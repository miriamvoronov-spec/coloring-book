"""Make a playful fairy-tale Hebrew display font from an open-licence (OFL)
rounded Hebrew font: every letter gets its own little tilt and hop, like
hand-lettered storybook titles, and a few letters get a tiny star.

    python tools/font/disneyfy.py <source.woff2> <out.woff2> "<family name>"

The source font's OFL licence allows changes when the result has a new name.
"""
from __future__ import annotations

import math
import sys

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

HEB = "אבגדהוזחטיכךלמםנןסעפףצץקרשת"
# tilt (degrees, + leans left) and hop (share of the em) per letter, chosen by hand for a lively rhythm
TILT = [4, -5, 3, -3, 5, -4, 2, -6, 4, -2, 5, -3, 3, -5, 4, -2, 6, -4, 3, -5, 2, -3, 5, -4, 3, -6, 4]
HOP = [0.03, -0.02, 0.04, 0.0, -0.03, 0.03, -0.01, 0.02, -0.03, 0.04, 0.0, -0.02, 0.03, -0.01, 0.02, -0.03, 0.04, 0.0, -0.02, 0.03, -0.01, 0.02, -0.03, 0.04, 0.01, -0.02, 0.03]
STAR_ON = {"ל": "top", "י": "right"}


def star(pen, cx, cy, r):
    pts = []
    for k in range(8):
        rr = r if k % 2 == 0 else r * 0.38
        a = math.pi / 2 + k * math.pi / 4
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    pts.reverse()  # clockwise, like TrueType outer contours
    pen.moveTo(tuple(round(v) for v in pts[0]))
    for p in pts[1:]:
        pen.lineTo(tuple(round(v) for v in p))
    pen.closePath()


def main(src: str, out: str, family: str) -> None:
    f = TTFont(src)
    upm = f["head"].unitsPerEm
    cmap = f.getBestCmap()
    gs = f.getGlyphSet()
    glyf = f["glyf"] if "glyf" in f else None
    if glyf is None:
        raise SystemExit("needs a TrueType-outline source")
    hmtx = f["hmtx"]
    for i, ch in enumerate(HEB):
        name = cmap.get(ord(ch))
        if not name:
            continue
        g = glyf[name]
        xmin, ymin, xmax, ymax = (g.xMin, g.yMin, g.xMax, g.yMax) if g.numberOfContours else (0, 0, 0, 0)
        cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
        a = math.radians(TILT[i])
        hop = HOP[i] * upm
        c, s = math.cos(a), math.sin(a)
        # rotate about the letter's centre, then hop up or down
        t = (c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy + hop)
        rec = DecomposingRecordingPen(gs)
        gs[name].draw(rec)
        pen = TTGlyphPen(gs)
        rec.replay(TransformPen(pen, t))
        where = STAR_ON.get(ch)
        if where:
            r = upm * 0.075
            sx, sy = (xmax + r * 0.4, ymax + r * 0.2) if where == "right" else (xmin + r * 0.6, ymax + r * 1.1)
            star(pen, sx, sy + hop, r)
        glyf[name] = pen.glyph()
        glyf[name].recalcBounds(glyf)
        adv, lsb = hmtx[name]
        hmtx[name] = (adv, glyf[name].xMin)
    # a new name, as the OFL asks for a changed font
    for rec in f["name"].names:
        if rec.nameID in (1, 4, 16):
            rec.string = family
        elif rec.nameID == 6:
            rec.string = family.replace(" ", "")
        elif rec.nameID == 3:
            rec.string = family + " 1.0"
    f.flavor = "woff2"
    f.save(out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
