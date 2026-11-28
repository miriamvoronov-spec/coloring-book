"""Draw the final page: white paper, uniform black lines, big bold labels."""
from __future__ import annotations

import os
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    os.path.join(os.path.dirname(__file__), "..", "fonts", "label.ttf"),
    "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
]


def font_path() -> str | None:
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


@dataclass
class Placed:
    value: str
    x: float
    y: float
    size: float      # cap height in px
    confidence: float
    uncertain: bool


def place_labels(result, max_scale: float = 2.6, min_scale: float = 1.2) -> list[Placed]:
    """Move each label to the roomiest nearby spot of its region and size it to fit.

    The distance transform gives, for every pixel, the distance to the nearest
    line; its maximum inside the region near the original label is the optical
    centre, and twice that distance bounds the glyph size.
    """
    free = (~result.lines).astype(np.uint8)
    dt = cv2.distanceTransform(free, cv2.DIST_L2, 5)
    base = result.label_px
    out = []
    taken = np.zeros_like(free, dtype=bool)
    for lb in sorted(result.labels, key=lambda l: -l.confidence):
        rid = result.regions[int(lb.y), int(lb.x)]
        R = int(base * 2.0)
        H, W = free.shape
        y0, y1 = max(0, int(lb.y) - R), min(H, int(lb.y) + R)
        x0, x1 = max(0, int(lb.x) - R), min(W, int(lb.x) + R)
        win = dt[y0:y1, x0:x1].copy()
        same = result.regions[y0:y1, x0:x1] == rid
        win[~same | taken[y0:y1, x0:x1]] = 0
        # prefer staying close to where the book put it
        yy, xx = np.mgrid[y0:y1, x0:x1]
        dist = np.hypot(yy - lb.y, xx - lb.x)
        score = np.minimum(win, base * max_scale * 0.7) - 0.15 * dist
        iy, ix = np.unravel_index(np.argmax(score), score.shape)
        cy, cx = y0 + iy, x0 + ix
        room = dt[cy, cx]
        size = float(np.clip(room * 1.1, base * min_scale, base * max_scale))
        if room * 1.1 < base * min_scale:  # tight spot: keep original place and size
            cy, cx, size = int(lb.y), int(lb.x), base * 1.05
        r = int(size * 0.7)
        taken[max(0, cy - r):cy + r, max(0, cx - r):cx + r] = True
        out.append(Placed(lb.value, float(cx), float(cy), size, lb.confidence, lb.uncertain))
    return out


def render_png(result, placed: list[Placed], halo: bool = True) -> Image.Image:
    h, w = result.lines.shape
    img = Image.fromarray(np.where(result.lines, 0, 255).astype(np.uint8), "L")
    draw = ImageDraw.Draw(img)
    fp = font_path()
    for p in placed:
        px = int(p.size / 0.72)  # cap height → font size
        font = ImageFont.truetype(fp, px) if fp else ImageFont.load_default()
        stroke = max(2, int(p.size * 0.12)) if halo else 0
        draw.text((p.x, p.y), p.value, font=font, fill=0, anchor="mm",
                  stroke_width=stroke, stroke_fill=255)
    return img


def legend_strip(swatches, width: int, height: int = 220) -> Image.Image:
    """Clean redrawn legend: rounded swatches with the label in a contrasting colour."""
    img = Image.new("RGB", (width, height), "white")
    d = ImageDraw.Draw(img)
    fp = font_path()
    n = max(1, len(swatches))
    gap = 18
    side = min(height - 40, (width - 80 - gap * (n - 1)) // n)
    x = (width - (n * side + (n - 1) * gap)) // 2
    font = ImageFont.truetype(fp, int(side * 0.55)) if fp else ImageFont.load_default()
    for s in swatches:
        r, g, b = (int(s.hex[i:i + 2], 16) for i in (1, 3, 5))
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        y = (height - side) // 2
        d.rounded_rectangle([x, y, x + side, y + side], radius=side // 6, fill=(r, g, b),
                            outline=(0, 0, 0), width=3)
        d.text((x + side / 2, y + side / 2), s.label, font=font,
               fill="black" if lum > 150 else "white", anchor="mm")
        x += side + gap
    return img
