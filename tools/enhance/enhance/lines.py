"""Stage 7: turn faint, halftone-dotted grey line art into clean black lines.

Scans of printed coloring books carry the lines as a dotted halftone screen.
We flatten the paper (divide by a smoothed background), blur just enough to
merge the halftone dots, then use hysteresis thresholding so faint stretches
that touch a solid stretch survive while isolated specks do not.
"""
from __future__ import annotations

import cv2
import numpy as np
from skimage.filters import apply_hysteresis_threshold


def darkness(gray: np.ndarray, bg_kernel: int = 41) -> np.ndarray:
    """0 = paper white, larger = darker ink. Removes uneven lighting and shadows."""
    g = gray.astype(np.float32)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (bg_kernel, bg_kernel))
    bg = cv2.morphologyEx(g, cv2.MORPH_CLOSE, k)
    bg = cv2.GaussianBlur(bg, (0, 0), 10)
    return np.clip(255.0 - g / np.maximum(bg, 1) * 255.0, 0, 255)


def ink_mask(gray: np.ndarray, sigma: float = 2.5, low: float = 10, high: float = 22,
             min_speck: int = 40) -> np.ndarray:
    """Boolean mask of ink (lines + labels)."""
    d = cv2.GaussianBlur(darkness(gray), (0, 0), sigma)
    m = apply_hysteresis_threshold(d, low, high).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    keep = st[:, cv2.CC_STAT_AREA] >= min_speck
    keep[0] = False
    return keep[lab]


def close_gaps(lines: np.ndarray, radius: int = 3) -> np.ndarray:
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1))
    return cv2.morphologyEx(lines.astype(np.uint8), cv2.MORPH_CLOSE, k).astype(bool)


def bridge_endpoints(skel: np.ndarray, max_gap: int = 18) -> tuple[np.ndarray, int]:
    """Connect dangling line ends to the nearest other ink within max_gap px.

    Returns the bridged skeleton and how many bridges were drawn. This is what
    closes regions whose outline had a break in the scan.
    """
    s = skel.astype(np.uint8)
    nb = cv2.filter2D(s, -1, np.ones((3, 3), np.float32), borderType=cv2.BORDER_CONSTANT)
    ends = np.argwhere((s == 1) & (nb == 2))  # self + exactly one neighbour
    if len(ends) == 0:
        return skel, 0
    n, lab = cv2.connectedComponents(s, connectivity=8)
    ys, xs = np.nonzero(s)
    out = s.copy()
    bridges = 0
    from scipy.spatial import cKDTree
    tree = cKDTree(np.c_[ys, xs])
    labs = lab[ys, xs]
    for (y, x) in ends:
        idx = tree.query_ball_point((y, x), max_gap)
        best, bd = None, 1e9
        own = lab[y, x]
        for i in idx:
            py, px = ys[i], xs[i]
            dd = (py - y) ** 2 + (px - x) ** 2
            if dd < 9:
                continue
            # skip pixels of the same stroke that lie "behind" the endpoint (walk-back)
            if labs[i] == own and dd < (max_gap * 0.6) ** 2:
                continue
            if dd < bd:
                bd, best = dd, (py, px)
        if best is not None:
            cv2.line(out, (int(x), int(y)), (int(best[1]), int(best[0])), 1, 1)
            bridges += 1
    return out.astype(bool), bridges


def uniform_lines(lines: np.ndarray, width: int = 7, bridge: int = 18) -> tuple[np.ndarray, int]:
    """Skeletonize, bridge small breaks, and redraw at an even stroke width."""
    from skimage.morphology import skeletonize
    skel = skeletonize(lines)
    skel, bridges = bridge_endpoints(skel, bridge)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (width, width))
    thick = cv2.dilate(skel.astype(np.uint8), k)
    # soften the staircase so potrace gets a smooth outline
    thick = cv2.GaussianBlur(thick.astype(np.float32), (0, 0), 1.2) > 0.5
    return thick, bridges


def keep_inside_frame(lines: np.ndarray) -> np.ndarray:
    """Drop specks outside the drawing frame (scan edges, copyright text).

    The frame is the largest connected line component; anything whose bounding
    box is not inside it, or that touches the image edge, is removed.
    """
    n, lab, st, _ = cv2.connectedComponentsWithStats(lines.astype(np.uint8), connectivity=8)
    if n <= 1:
        return lines
    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    fx, fy, fw, fh = st[big, :4]
    h, w = lines.shape
    keep = np.zeros(n, bool)
    for i in range(1, n):
        x, y, bw, bh = st[i, :4]
        inside = x >= fx - 2 and y >= fy - 2 and x + bw <= fx + fw + 2 and y + bh <= fy + fh + 2
        edge = x <= 1 or y <= 1 or x + bw >= w - 1 or y + bh >= h - 1
        keep[i] = inside and not edge
    keep[big] = True
    return keep[lab]
