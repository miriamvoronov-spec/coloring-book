"""Stage 10: read the label→colour legend printed as swatches under each page.

Each swatch is a filled square with its label in white. Labels follow the
book's fixed order (1-9, 0, A, B, ...), so we read colours left to right and
use the white glyph inside each swatch as a template for label recognition.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

LABEL_ORDER = "1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ"


@dataclass
class Swatch:
    label: str
    hex: str
    box: tuple[int, int, int, int]  # x, y, w, h in page pixels
    glyph: np.ndarray = field(repr=False)  # binary glyph crop (True = ink)


def _hex(bgr) -> str:
    b, g, r = (int(round(v)) for v in bgr)
    return f"#{r:02x}{g:02x}{b:02x}"


def _ocr_glyph(glyph: np.ndarray, allowed: str) -> str:
    import shutil
    import subprocess
    import tempfile
    if not shutil.which("tesseract"):
        return ""
    with tempfile.TemporaryDirectory() as td:
        f = f"{td}/g.png"
        img = np.pad(np.where(glyph, 0, 255).astype(np.uint8), 20, constant_values=255)
        cv2.imwrite(f, img)
        out = subprocess.run(["tesseract", f, "-", "--psm", "10", "-c",
                              f"tessedit_char_whitelist={allowed}"], capture_output=True, text=True).stdout
    out = out.strip()
    return out[0] if out else ""


def find_swatches(bgr: np.ndarray, search_from: float = 0.88) -> list[Swatch]:
    h, w = bgr.shape[:2]
    y0 = int(h * search_from)
    sub = bgr[y0:]
    hsv = cv2.cvtColor(sub, cv2.COLOR_BGR2HSV)
    m = ((sub.min(2) < 200) | (hsv[:, :, 1] > 50)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    side = w * 0.035  # ~172px on a 4912px page
    boxes = []
    for i in range(1, n):
        x, y, bw, bh, area = st[i]
        if not (0.6 * side < bw < 1.6 * side and 0.6 * side < bh < 1.6 * side):
            continue
        # fill the white glyph hole before measuring how "solid" the square is
        comp = (lab[y:y + bh, x:x + bw] == i).astype(np.uint8)
        filled = comp.copy()
        cv2.floodFill(filled, np.zeros((bh + 2, bw + 2), np.uint8), (0, 0), 2) if comp[0, 0] == 0 else None
        solid = ((filled != 2).sum()) / (bw * bh)
        if solid > 0.8:
            boxes.append((x, y + y0, bw, bh))
    boxes.sort(key=lambda b: b[0])
    if not boxes:
        return []

    glyphs, colors = [], []
    for (x, y, bw, bh) in boxes:
        pad = max(4, bw // 14)
        box = bgr[y + pad:y + bh - pad, x + pad:x + bw - pad]
        ring = np.concatenate([box[:8].reshape(-1, 3), box[-8:].reshape(-1, 3),
                               box[:, :8].reshape(-1, 3), box[:, -8:].reshape(-1, 3)])
        colors.append(np.median(ring, 0))
        g = cv2.cvtColor(box, cv2.COLOR_BGR2GRAY)
        # glyph is lighter than the swatch; Otsu copes with pale swatches too
        t, _ = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        glyphs.append(g > max(t, np.median(g) + 12))

    # Position in the fixed label order comes from the swatch spacing, so a
    # swatch the detector missed leaves a gap instead of shifting every label.
    xs = np.array([b[0] for b in boxes], float)
    if len(xs) > 1:
        d = np.diff(xs)
        pitch = float(np.median(d[d < np.median(d) * 1.4]))
    else:
        pitch = float(side * 1.4)
    rel = np.round((xs - xs[0]) / pitch).astype(int)
    reads = [_ocr_glyph(g, LABEL_ORDER[:20]) for g in glyphs]
    # choose the offset (how many swatches are missing on the left) that best
    # agrees with what OCR reads in the swatches
    best_off, best_hits = 0, -1
    for off in range(0, 6):
        hits = sum(1 for r, k in zip(reads, rel) if off + k < len(LABEL_ORDER) and r == LABEL_ORDER[off + k])
        if hits > best_hits:
            best_off, best_hits = off, hits
    out = []
    for (x, y, bw, bh), col, g, k in zip(boxes, colors, glyphs, rel):
        i = best_off + int(k)
        label = LABEL_ORDER[i] if i < len(LABEL_ORDER) else f"?{i}"
        out.append(Swatch(label, _hex(col), (int(x), int(y), int(bw), int(bh)), g))
    return out


def legend_top(swatches: list[Swatch]) -> int | None:
    return min(s.box[1] for s in swatches) if swatches else None
