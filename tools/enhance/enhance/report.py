"""Stage 13: QA report: page classification + before/after for each processed page."""
from __future__ import annotations

from html import escape
from pathlib import Path

import cv2
import numpy as np

KIND_HE = {"front_cover": "כריכה קדמית", "coloring": "דף צביעה", "solution": "דף פתרונות",
           "back_cover": "כריכה אחורית", "extra": "עמוד נוסף"}

CSS = """
:root{--bg:#faf6ee;--ink:#2b1a10;--card:#fff;--muted:#7a6a5a;--gold:#c9932e;--bad:#c0392b;--warn:#d68910}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,'Segoe UI',sans-serif}
main{max-width:1400px;margin:auto;padding:16px}
h1{color:var(--gold)} h2{margin-top:40px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.thumb{background:var(--card);border-radius:8px;padding:4px;text-align:center;font-size:12px}
.thumb img{width:100%;border-radius:4px}
.k-coloring{outline:2px solid #8bc34a}.k-solution{outline:2px solid #e67e22}
.k-front_cover,.k-back_cover{outline:2px solid #3f51b5}.k-extra{outline:2px dashed #999}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pair figure{margin:0;background:var(--card);border-radius:10px;padding:8px}
.pair img{width:100%;display:block;border-radius:6px}
figcaption{font-size:14px;color:var(--muted);padding:4px}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.stat{background:var(--card);border-radius:20px;padding:4px 12px;font-size:14px}
.stat.bad{color:var(--bad);font-weight:600}
.legend{display:flex;gap:4px;flex-wrap:wrap}
.legend span{display:inline-block;min-width:34px;padding:4px;text-align:center;border-radius:6px;color:#fff;font-weight:700;text-shadow:0 0 2px #000}
@media (max-width:700px){.pair{grid-template-columns:1fr}}
"""


def _jpg(path: Path, img: np.ndarray, width: int) -> str:
    s = width / img.shape[1]
    small = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(path), small, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return path.name


def _overlay_flags(img: np.ndarray, flags: list[dict]) -> np.ndarray:
    out = img.copy() if img.ndim == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    for f in flags:
        color = (43, 57, 192) if f["type"] == "uncertain_label" else (16, 137, 214)
        cv2.circle(out, (int(f["x"]), int(f["y"])), 55, color, 8)
    return out


def _busy_crop(labels, shape, size=900):
    """Pick the crop window with the most labels (shows the most detail)."""
    h, w = shape[:2]
    if not labels:
        return h // 2 - size // 2, w // 2 - size // 2
    pts = np.array([[l.y, l.x] for l in labels])
    best, by, bx = -1, 0, 0
    for y in range(0, h - size, size // 3):
        for x in range(0, w - size, size // 3):
            c = int(((pts[:, 0] >= y) & (pts[:, 0] < y + size) & (pts[:, 1] >= x) & (pts[:, 1] < x + size)).sum())
            if c > best:
                best, by, bx = c, y, x
    return by, bx


class Report:
    def __init__(self, out: Path, title: str):
        self.dir = out
        self.img = out / "report_files"
        self.img.mkdir(parents=True, exist_ok=True)
        self.title = title
        self.sections: list[str] = []

    def classification(self, thumbs: list[np.ndarray], kinds: list[str]):
        cells = []
        for i, (t, k) in enumerate(zip(thumbs, kinds), 1):
            name = _jpg(self.img / f"thumb_{i:03d}.jpg", t, 120)
            cells.append(f'<div class="thumb k-{k}"><img src="report_files/{name}" alt="">'
                         f'<div>{i} · {KIND_HE[k]}</div></div>')
        counts = {KIND_HE[k]: kinds.count(k) for k in KIND_HE if kinds.count(k)}
        summary = " · ".join(f"{k}: {v}" for k, v in counts.items())
        self.sections.append(f"<h2>סיווג עמודים</h2><p>{escape(summary)}. "
                             "בדקי שהסיווג נכון. אפשר לתקן ב-<code>classification.json</code>.</p>"
                             f'<div class="grid">{"".join(cells)}</div>')

    def page(self, num: int, before: np.ndarray, after_rgb: np.ndarray, result, data: dict):
        after = cv2.cvtColor(after_rgb, cv2.COLOR_RGB2BGR)
        flagged = _overlay_flags(after[:before.shape[0]], result.flags)
        b = _jpg(self.img / f"p{num:03d}_before.jpg", before, 1100)
        a = _jpg(self.img / f"p{num:03d}_after.jpg", np.vstack([flagged, after[before.shape[0]:]]), 1100)
        y, x = _busy_crop(result.labels, before.shape)
        cb = _jpg(self.img / f"p{num:03d}_zb.jpg", before[y:y + 900, x:x + 900], 900)
        ca = _jpg(self.img / f"p{num:03d}_za.jpg", after[y:y + 900, x:x + 900], 900)
        st = data["stats"]
        legend = "".join(f'<span style="background:{escape(s["color"])}">{escape(s["label"])}</span>'
                         for s in data["legend"])
        opens = sum(f["type"] == "open_region" for f in result.flags)
        unread = sum(f["type"] == "unread_mark" for f in result.flags)
        self.sections.append(f"""
<h2>עמוד {num}</h2>
<div class="stats">
 <span class="stat">{st['labels']} תוויות</span>
 <span class="stat {'bad' if st['uncertain'] else ''}">{st['uncertain']} לא בטוחות (עיגול אדום)</span>
 <span class="stat {'bad' if opens else ''}">{opens} אזורים לא סגורים (עיגול כתום)</span>
 <span class="stat {'bad' if unread else ''}">{unread} סימנים שלא זוהו (עיגול כתום)</span>
 <span class="stat">{st['touching_lines']} תוויות שנגעו בקו</span>
 <span class="stat">{st['gaps_bridged']} חורים בקווים נסגרו</span>
</div>
<div class="legend">{legend}</div>
<div class="pair">
 <figure><img src="report_files/{b}" alt="לפני"><figcaption>לפני</figcaption></figure>
 <figure><img src="report_files/{a}" alt="אחרי"><figcaption>אחרי</figcaption></figure>
 <figure><img src="report_files/{cb}" alt="לפני, זום"><figcaption>לפני (זום 1:1)</figcaption></figure>
 <figure><img src="report_files/{ca}" alt="אחרי, זום"><figcaption>אחרי (זום 1:1)</figcaption></figure>
</div>""")

    def cover(self, num: int, before: np.ndarray, after: np.ndarray):
        b = _jpg(self.img / f"c{num:03d}_before.jpg", before, 900)
        a = _jpg(self.img / f"c{num:03d}_after.jpg", after, 900)
        h, w = before.shape[:2]
        y, x = h // 3, w // 3
        cb = _jpg(self.img / f"c{num:03d}_zb.jpg", before[y:y + 900, x:x + 900], 900)
        ca = _jpg(self.img / f"c{num:03d}_za.jpg", after[y:y + 900, x:x + 900], 900)
        self.sections.append(f"""<h2>עמוד {num} (כריכה, נשאר בצבע)</h2><div class="pair">
 <figure><img src="report_files/{b}" alt=""><figcaption>לפני</figcaption></figure>
 <figure><img src="report_files/{a}" alt=""><figcaption>אחרי</figcaption></figure>
 <figure><img src="report_files/{cb}" alt=""><figcaption>לפני (זום)</figcaption></figure>
 <figure><img src="report_files/{ca}" alt=""><figcaption>אחרי (זום)</figcaption></figure></div>""")

    def write(self) -> Path:
        html = (f'<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">'
                f'<meta name="viewport" content="width=device-width,initial-scale=1">'
                f'<title>{escape(self.title)}</title><style>{CSS}</style></head><body><main>'
                f'<h1>{escape(self.title)}</h1>{"".join(self.sections)}</main></body></html>')
        p = self.dir / "report.html"
        p.write_text(html, encoding="utf-8")
        return p
