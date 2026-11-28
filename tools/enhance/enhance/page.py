"""Process one colouring page: clean lines, labels, legend, regions, QA flags."""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from . import labels as L
from . import legend as G
from . import lines as LN


@dataclass
class PageResult:
    lines: np.ndarray                 # bool, clean uniform line art (no labels)
    labels: list[L.Label]
    swatches: list[G.Swatch]
    regions: np.ndarray               # int32 region id per pixel (0 = line)
    draw_box: tuple[int, int, int, int]  # x0, y0, x1, y1 of the drawing area
    flags: list[dict] = field(default_factory=list)
    bridges: int = 0
    ocr_fixed: int = 0
    touching: int = 0
    label_px: float = 34.0            # typical original label height


def process(bgr: np.ndarray, line_width: int | None = None, bank: L.TemplateBank | None = None) -> PageResult:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    sw = G.find_swatches(bgr)
    top = G.legend_top(sw) or h
    ink = LN.ink_mask(gray)
    ink[max(0, top - 20):] = False

    templates = L.build_templates(sw)
    dark = cv2.GaussianBlur(LN.darkness(gray), (0, 0), 1.0)
    dark[max(0, top - 20):] = 0
    allowed = "".join(templates)
    synth = L.synthetic_templates(allowed)
    first = {k: (synth.get(k) if synth.get(k) is not None else templates[k]) for k in templates}
    labs, ids = L.cluster_labels(ink, dark, first) if templates else ([], [])
    ocr_fixed = 0

    # lines = ink minus recognised label glyphs
    n, lab = cv2.connectedComponents(ink.astype(np.uint8), connectivity=8)
    drop = np.zeros(n, bool)
    drop[ids] = True
    line_ink = ink & ~drop[lab]
    touching, erase = L.find_touching(dark, line_ink, labs)
    line_ink &= ~erase
    labs = labs + touching
    line_ink = LN.close_gaps(line_ink, 2)
    lw = line_width or max(5, round(w / 700))
    clean, bridges = LN.uniform_lines(line_ink, lw)
    clean = LN.keep_inside_frame(clean)
    # small free-floating marks are unread labels or specks, never real lines
    label_px = float(np.median([l.h for l in labs])) if labs else 34.0
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(clean.astype(np.uint8), connectivity=8)
    small = (st2[:, cv2.CC_STAT_WIDTH] < label_px * 1.6) & (st2[:, cv2.CC_STAT_HEIGHT] < label_px * 1.6)
    small[0] = False
    stray = [(float(st2[i, 0] + st2[i, 2] / 2), float(st2[i, 1] + st2[i, 3] / 2))
             for i in np.nonzero(small)[0] if st2[i, cv2.CC_STAT_HEIGHT] > label_px * 0.5]
    clean = clean & ~small[lab2]

    ys, xs = np.nonzero(clean)
    box = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())) if len(xs) else (0, 0, w, h)

    nreg, regions = cv2.connectedComponents((~clean).astype(np.uint8), connectivity=4)
    res = PageResult(clean, labs, sw, regions, box, bridges=bridges, ocr_fixed=ocr_fixed, touching=len(touching),
                     label_px=float(np.median([l.h for l in labs])) if labs else 34.0)
    res.flags = qa_flags(res) + [{"type": "unread_mark", "x": x, "y": y} for x, y in stray]
    return res


def qa_flags(r: PageResult) -> list[dict]:
    flags = []
    by_region: dict[int, set[str]] = {}
    for lb in r.labels:
        if lb.uncertain:
            flags.append({"type": "uncertain_label", "x": lb.x, "y": lb.y,
                          "value": lb.value, "confidence": round(lb.confidence, 3)})
        rid = int(r.regions[int(lb.y), int(lb.x)])
        by_region.setdefault(rid, set()).add(lb.value)
    # a region holding two different labels means its outline is not closed
    for rid, vals in by_region.items():
        if rid and len(vals) > 1:
            ys, xs = np.nonzero(r.regions == rid)
            flags.append({"type": "open_region", "x": float(xs.mean()), "y": float(ys.mean()),
                          "values": sorted(vals)})
    return flags
