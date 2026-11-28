"""Stage 9: find the small printed labels (digits and letters) and classify them.

Labels are separate connected components of the ink mask, small and compact.
They are classified by normalised template matching against the white glyphs
printed inside the legend swatches of the same page, so the classifier always
uses that book's own font. Confidence = best score; margin = best - second.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

PATCH = (24, 32)  # w, h of the normalised glyph


@dataclass
class Label:
    value: str
    x: float  # centre, page pixels
    y: float
    w: int
    h: int
    confidence: float
    margin: float

    @property
    def uncertain(self) -> bool:
        return self.confidence < 0.55 or self.margin < 0.06


def _norm(glyph: np.ndarray) -> np.ndarray:
    """Normalise a glyph (bool mask or float darkness patch) to a unit vector."""
    ys, xs = np.nonzero(glyph > (0 if glyph.dtype == bool else glyph.max() * 0.25))
    if len(ys) == 0:
        return np.zeros(PATCH[::-1], np.float32)
    g = glyph[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.float32)
    if glyph.dtype == bool:
        g *= 255
    gh, gw = g.shape
    # keep aspect: fit into PATCH, pad
    s = min(PATCH[0] / gw, PATCH[1] / gh)
    nw, nh = max(1, round(gw * s)), max(1, round(gh * s))
    r = cv2.resize(g, (nw, nh), interpolation=cv2.INTER_AREA)
    out = np.zeros(PATCH[::-1], np.float32)
    ox, oy = (PATCH[0] - nw) // 2, (PATCH[1] - nh) // 2
    out[oy:oy + nh, ox:ox + nw] = r
    out = cv2.GaussianBlur(out.astype(np.float32), (0, 0), 1.0)
    out -= out.mean()
    n = np.linalg.norm(out)
    return out / n if n else out


def _lum(hex_: str) -> float:
    r, g, b = (int(hex_[i:i + 2], 16) for i in (1, 3, 5))
    return 0.299 * r + 0.587 * g + 0.114 * b


def build_templates(swatches, max_lum: float = 150) -> dict[str, np.ndarray]:
    """Templates from the white glyphs in the legend swatches.

    On a pale swatch the white glyph barely shows, so its template would be
    noise; those classes get None and fall back to the synthetic font.
    """
    t: dict[str, np.ndarray | None] = {}
    for s in swatches:
        if _lum(s.hex) > max_lum:
            t[s.label] = None
            continue
        g = s.glyph.astype(np.uint8)
        # biggest few components = the glyph; drop specks
        n, lab, st, _ = cv2.connectedComponentsWithStats(g)
        if n <= 1:
            continue
        big = st[1:, cv2.CC_STAT_AREA].max()
        keep = np.zeros(n, bool)
        keep[1:] = st[1:, cv2.CC_STAT_AREA] > big * 0.15
        t[s.label] = _norm(keep[lab])
    return t


SANS_FONTS = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def synthetic_templates(chars: str) -> dict[str, np.ndarray]:
    """Templates rendered from an Arial-like font.

    Colouring books almost always print labels in a plain Helvetica/Arial
    style, so these are a clean, reliable first guess for every page, even
    when the legend swatch is too pale to read its glyph.
    """
    import os
    from PIL import Image, ImageDraw, ImageFont
    path = next((p for p in SANS_FONTS if os.path.exists(p)), None)
    if not path:
        return {}
    font = ImageFont.truetype(path, 120)
    out = {}
    for ch in chars:
        img = Image.new("L", (160, 160), 0)
        ImageDraw.Draw(img).text((80, 80), ch, font=font, fill=255, anchor="mm")
        out[ch] = _norm(np.asarray(img, np.float32))
    return out


def candidates(ink: np.ndarray, glyph_h: tuple[int, int] = (22, 60)):
    """Yield (x, y, w, h, mask) for compact components sized like a label.

    Multi-stroke glyphs are single components here because the blur in the
    ink mask already fuses them.
    """
    n, lab, st, _ = cv2.connectedComponentsWithStats(ink.astype(np.uint8), connectivity=8)
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if glyph_h[0] <= h <= glyph_h[1] and 6 <= w <= 1.3 * h and area < w * h * 0.92:
            yield i, x, y, w, h, lab[y:y + h, x:x + w] == i


def _feature(dark, m, x, y, w, h):
    """Darkness inside the component's (slightly grown) footprint.

    Using grey levels rather than the binary mask keeps faint strokes, e.g.
    the thin top bar of a 5, which otherwise reads as a 3.
    """
    if dark is None:
        return _norm(m)
    grown = cv2.dilate(m.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    return _norm(np.where(grown, dark[y:y + h, x:x + w], 0).astype(np.float32))


# Closed loops per glyph in an Arial-like font. Templates confuse 5/6 and 3/8
# on dotted print, but loops survive the dots, so they settle those cases.
HOLES = {"0": 1, "4": None, "6": 1, "8": 2, "9": 1, "A": 1, "B": 2, "D": 1, "O": 1, "P": 1, "Q": 1, "R": 1}


def count_holes(m: np.ndarray, min_area: int = 12) -> int:
    pad = np.pad(m.astype(np.uint8), 1)
    inv = (1 - pad).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    return int(sum(1 for i in range(2, n) if st[i, cv2.CC_STAT_AREA] >= min_area)) if n > 2 else 0


def classify(ink: np.ndarray, templates: dict[str, np.ndarray], dark: np.ndarray | None = None):
    keys = list(templates)
    T = np.stack([templates[k].ravel() for k in keys])
    want = np.array([HOLES.get(k, 0) if HOLES.get(k, 0) is not None else -1 for k in keys])
    labels, comp_ids = [], []
    for i, x, y, w, h, m in candidates(ink):
        v = _feature(dark, m, x, y, w, h).ravel()
        sc = T @ v
        holes = count_holes(m)
        sc = sc - 0.12 * ((want >= 0) & (want != holes))
        order = np.argsort(-sc)
        best = float(sc[order[0]])
        second = float(sc[order[1]]) if len(order) > 1 else 0.0
        if best < 0.35:
            continue  # not a glyph (line fragment, speck)
        labels.append(Label(keys[order[0]], x + w / 2, y + h / 2, int(w), int(h), best, best - second))
        comp_ids.append(i)
    return labels, comp_ids


def refine_templates(ink: np.ndarray, labels_: list[Label], comp_ids: list[int],
                     min_conf: float = 0.45, per_class: int = 25, dark: np.ndarray | None = None) -> dict[str, np.ndarray]:
    """Second pass: build templates from this page's own confident labels.

    The legend glyphs are a different size and weight than the labels in the
    drawing; averaging the page's own confident glyphs gives a much closer
    template and fixes most confusions (E/6, 0/D, 1/7).
    """
    n, lab = cv2.connectedComponents(ink.astype(np.uint8), connectivity=8)
    by: dict[str, list[np.ndarray]] = {}
    for L, cid in sorted(zip(labels_, comp_ids), key=lambda p: -p[0].confidence):
        if L.confidence < min_conf or L.margin < 0.12:
            continue
        lst = by.setdefault(L.value, [])
        if len(lst) >= per_class:
            continue
        x0, y0 = int(L.x - L.w / 2), int(L.y - L.h / 2)
        lst.append(_feature(dark, lab[y0:y0 + L.h, x0:x0 + L.w] == cid, x0, y0, L.w, L.h))
    out = {}
    for k, v in by.items():
        t = np.mean(v, 0)
        t -= t.mean()
        nn = np.linalg.norm(t)
        out[k] = t / nn if nn else t
    return out


class TemplateBank:
    """Glyph templates learned from earlier pages of the same book.

    Every page of a book uses one font, so confident glyphs from earlier pages
    are better first-pass templates than the white-on-colour legend glyphs.
    """

    def __init__(self):
        self.sum: dict[str, np.ndarray] = {}
        self.n: dict[str, int] = {}

    def add(self, templates: dict[str, np.ndarray]):
        for k, v in templates.items():
            self.sum[k] = self.sum.get(k, 0) + v
            self.n[k] = self.n.get(k, 0) + 1

    def templates(self) -> dict[str, np.ndarray]:
        out = {}
        for k, v in self.sum.items():
            t = v - v.mean()
            nn = np.linalg.norm(t)
            out[k] = t / nn if nn else t
        return out


def two_pass(ink: np.ndarray, legend_templates: dict[str, np.ndarray], dark: np.ndarray | None = None,
             bank: TemplateBank | None = None):
    allowed = set(legend_templates)
    synth = synthetic_templates("".join(sorted(allowed)))
    first = {}
    for k in allowed:
        leg, syn = legend_templates.get(k), synth.get(k)
        if leg is not None and syn is not None:
            t = leg + syn  # both are unit vectors; their sum is a fair blend
            first[k] = t / np.linalg.norm(t)
        elif leg is not None or syn is not None:
            first[k] = leg if leg is not None else syn
    if bank is not None:
        first.update({k: v for k, v in bank.templates().items() if k in allowed})
    labs, ids = classify(ink, first, dark)
    # Iterate: every class gets a template made of this page's own glyphs, so
    # all classes compete on equal terms (a page-made "4" must not beat a
    # synthetic "1" just because it looks more like the page's print).
    templates = first
    for _ in range(2):
        page_t = refine_templates(ink, labs, ids, dark=dark)
        templates = {**templates, **page_t}
        labs, ids = classify(ink, templates, dark)
    if bank is not None:
        bank.add(refine_templates(ink, labs, ids, dark=dark, min_conf=0.7))
    return labs, ids


def ocr_second_opinion(gray: np.ndarray, labels_: list[Label], allowed: str) -> int:
    """Re-read uncertain labels with Tesseract on the original pixels.

    Uses several scales and keeps the answer Tesseract gives most often. If
    Tesseract agrees with the template, or gives a clear answer, the label is
    updated and its confidence raised so it is no longer flagged.
    Returns how many labels were resolved.
    """
    import shutil
    import subprocess
    import tempfile
    from collections import Counter

    if not shutil.which("tesseract"):
        return 0
    fixed = 0
    with tempfile.TemporaryDirectory() as td:
        for lb in labels_:
            if not lb.uncertain:
                continue
            p = int(max(lb.w, lb.h) * 0.6)
            x0, y0 = int(lb.x - lb.w / 2) - p, int(lb.y - lb.h / 2) - p
            crop = gray[max(0, y0):y0 + lb.h + 2 * p, max(0, x0):x0 + lb.w + 2 * p]
            votes = Counter()
            for s in (2.0, 3.0, 4.0):
                c = cv2.resize(crop, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
                c = cv2.GaussianBlur(c, (0, 0), s * 0.8)
                _, b = cv2.threshold(c, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                f = f"{td}/g.png"
                cv2.imwrite(f, b)
                out = subprocess.run(
                    ["tesseract", f, "-", "--psm", "10", "-c", f"tessedit_char_whitelist={allowed}"],
                    capture_output=True, text=True).stdout.strip()
                if len(out) == 1 and out in allowed:
                    votes[out] += 1
            if not votes:
                continue
            val, n = votes.most_common(1)[0]
            if n >= 2 or val == lb.value:
                lb.value = val
                lb.confidence = max(lb.confidence, 0.6 + 0.1 * n)
                lb.margin = max(lb.margin, 0.1)
                fixed += 1
    return fixed


def real_size_templates(dark: np.ndarray, labels_: list[Label], per_class: int = 30):
    """Average darkness crops of confident labels at their native pixel size."""
    if not labels_:
        return {}, (0, 0)
    W = int(np.median([l.w for l in labels_]))
    H = int(np.median([l.h for l in labels_]))
    by: dict[str, list[np.ndarray]] = {}
    for lb in sorted(labels_, key=lambda l: -l.confidence):
        if lb.uncertain or len(by.setdefault(lb.value, [])) >= per_class:
            continue
        x0, y0 = int(lb.x - W / 2), int(lb.y - H / 2)
        c = dark[y0:y0 + H, x0:x0 + W]
        if c.shape == (H, W):
            by[lb.value].append(c.astype(np.float32))
    return {k: np.mean(v, 0) for k, v in by.items() if len(v) >= 2}, (W, H)


# Glyphs made of a single straight stroke look like line pieces; demand more.
STROKE_LIKE = {"1": 0.9, "7": 0.88}


def find_touching(dark: np.ndarray, line_ink: np.ndarray, labels_: list[Label],
                  thresh: float = 0.78, scale: float = 0.5):
    """Find labels that touch a line (and so were not separate components).

    Template-matches this page's own average glyphs over the line ink only.
    Returns (new labels, mask of glyph pixels to remove from the lines).
    """
    T, (W, H) = real_size_templates(dark, labels_)
    if not T:
        return [], np.zeros_like(line_ink)
    small = cv2.resize(dark, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    near = cv2.dilate(line_ink.astype(np.uint8), np.ones((9, 9), np.uint8))
    near = cv2.resize(near, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_NEAREST)
    taken = np.zeros(small.shape, bool)
    for lb in labels_:
        cx, cy = int(lb.x * scale), int(lb.y * scale)
        taken[max(0, cy - int(H * scale)):cy + int(H * scale), max(0, cx - int(W * scale)):cx + int(W * scale)] = True
    best = np.full(small.shape, -1.0, np.float32)
    which = np.zeros(small.shape, np.int16)
    keys = list(T)
    for i, k in enumerate(keys):
        t = cv2.resize(T[k], None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        r = cv2.matchTemplate(small, t, cv2.TM_CCOEFF_NORMED)
        th, tw = t.shape
        full = np.full(small.shape, -1.0, np.float32)
        full[th // 2:th // 2 + r.shape[0], tw // 2:tw // 2 + r.shape[1]] = r
        upd = full > best
        best[upd] = full[upd]
        which[upd] = i
    cand = (best > thresh - 0.05) & (near > 0) & ~taken
    # non-maximum suppression
    local_max = best == cv2.dilate(best, np.ones((int(H * scale), int(W * scale)), np.uint8))
    ys, xs = np.nonzero(cand & local_max)
    found, erase = [], np.zeros_like(line_ink)
    for y, x in zip(ys, xs):
        k = keys[which[y, x]]
        if best[y, x] < STROKE_LIKE.get(k, thresh):
            continue
        cx, cy = x / scale, y / scale
        found.append(Label(k, float(cx), float(cy), W, H, float(best[y, x]), 0.1))
        x0, y0 = int(cx - W / 2), int(cy - H / 2)
        glyph = T[k] > T[k].max() * 0.3
        glyph = cv2.dilate(glyph.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        sub = erase[y0:y0 + H, x0:x0 + W]
        sub |= glyph[:sub.shape[0], :sub.shape[1]]
    return found, erase


def _tesseract_char(img_dark: np.ndarray, allowed: str) -> str:
    """Read one glyph from a darkness image (ink bright) with Tesseract."""
    import shutil
    import subprocess
    import tempfile
    if not shutil.which("tesseract"):
        return ""
    g = cv2.normalize(img_dark.astype(np.float32), None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    s = 96 / max(1, g.shape[0])
    g = cv2.resize(g, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    _, b = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)  # black glyph on white
    b = np.pad(b, 30, constant_values=255)
    with tempfile.TemporaryDirectory() as td:
        f = f"{td}/g.png"
        cv2.imwrite(f, b)
        out = subprocess.run(["tesseract", f, "-", "--psm", "10", "-c", f"tessedit_char_whitelist={allowed}"],
                             capture_output=True, text=True).stdout.strip()
    return out[0] if len(out) == 1 else ""


def cluster_labels(ink: np.ndarray, dark: np.ndarray, templates: dict[str, np.ndarray],
                   threshold: float = 0.85):
    """Group look-alike glyphs, then read each group once.

    Every copy of a label on a page is the same printed glyph, so glyphs
    cluster very cleanly. The average of a cluster cancels the halftone dots
    and gives a smooth glyph that Tesseract reads reliably; the font
    templates give a second, independent vote. Agreement → confident.
    """
    keys = [k for k, v in templates.items() if v is not None]
    allowed = "".join(keys)
    T = np.stack([templates[k].ravel() for k in keys])
    cands = list(candidates(ink))
    if not cands:
        return [], []
    F = np.array([_feature(dark, m, x, y, w, h).ravel() for _, x, y, w, h, m in cands])
    tmpl_score = F @ T.T
    keep = tmpl_score.max(1) >= 0.35  # drop line fragments and specks
    idx = np.nonzero(keep)[0]
    # greedy clustering, densest glyphs first
    S = F[idx] @ F[idx].T
    order = idx[np.argsort(-np.sort(S, 1)[:, -min(5, len(idx))])]
    cents: list[np.ndarray] = []
    members: list[list[int]] = []
    for i in order:
        if cents:
            C = np.array(cents)
            C /= np.linalg.norm(C, axis=1, keepdims=True)
            sc = C @ F[i]
            j = int(np.argmax(sc))
            if sc[j] > threshold:
                cents[j] = cents[j] + F[i]
                members[j].append(i)
                continue
        cents.append(F[i].copy())
        members.append([i])

    from collections import Counter
    labels_, ids = [], []
    for cent, mem in zip(cents, members):
        c = cent / np.linalg.norm(cent)
        ts = T @ c
        o = np.argsort(-ts)
        by_template = keys[o[0]]
        margin = float(ts[o[0]] - (ts[o[1]] if len(o) > 1 else 0))
        # native-resolution average of the members (aligned on their centres)
        W = int(np.median([cands[i][3] for i in mem])) + 8
        H = int(np.median([cands[i][4] for i in mem])) + 8
        crops = []
        for i in mem[:40]:
            _, x, y, w, h, _ = cands[i]
            cx, cy = x + w // 2, y + h // 2
            cr = dark[max(0, cy - H // 2):cy + H - H // 2, max(0, cx - W // 2):cx + W - W // 2]
            if cr.shape == (H, W):
                crops.append(cr)
        votes = Counter()
        if crops:
            r = _tesseract_char(np.mean(crops, 0), allowed)
            if r:
                votes[r] += 2
        if len(mem) >= 2:  # a few individual reads as extra, independent votes
            for cr in crops[:4]:
                r = _tesseract_char(cr, allowed)
                if r:
                    votes[r] += 1
        votes[by_template] += 2 if margin > 0.08 else 1
        (value, top), *rest = votes.most_common()
        total = sum(votes.values())
        conf = top / total
        if len(mem) == 1:
            conf *= 0.8
        for i in mem:
            cid, x, y, w, h, _ = cands[i]
            fit = float(F[i] @ c)
            labels_.append(Label(value, x + w / 2, y + h / 2, int(w), int(h),
                                 conf * min(1.0, fit / threshold), margin if value == by_template else 0.1))
            ids.append(cid)
    return labels_, ids
