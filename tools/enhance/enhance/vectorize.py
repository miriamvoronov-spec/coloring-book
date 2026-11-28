"""Stage 8: vectorise the clean line art with potrace and compose the page SVG."""
from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from html import escape
from pathlib import Path

import numpy as np
from PIL import Image


def potrace_group(lines: np.ndarray) -> str:
    """Return potrace's <g>…</g> for a bool line mask, in pixel units."""
    if not shutil.which("potrace"):
        raise RuntimeError("potrace לא מותקן (Windows: choco install potrace, Mac: brew install potrace)")
    h, w = lines.shape
    with tempfile.TemporaryDirectory() as td:
        pbm = Path(td) / "l.pbm"
        Image.fromarray(np.where(lines, 0, 255).astype(np.uint8)).convert("1").save(pbm)
        svg = Path(td) / "l.svg"
        subprocess.run(["potrace", str(pbm), "-s", "-o", str(svg), "-r", "72",
                        "-t", "8", "-a", "1.1", "-O", "0.6", "--flat"], check=True)
        text = svg.read_text()
    m = re.search(r"<g\b.*</g>", text, re.S)
    return m.group(0) if m else ""


def page_svg(lines: np.ndarray, placed, swatches, legend_h: int = 0,
             font_family: str = "Inter, Arial, Helvetica, sans-serif") -> str:
    h, w = lines.shape
    total_h = h + legend_h
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {total_h}" width="{w}" height="{total_h}">',
        f'<rect width="{w}" height="{total_h}" fill="#fff"/>',
        f'<g id="lines" fill="#000">{potrace_group(lines)}</g>',
        f'<g id="labels" font-family="{font_family}" font-weight="800" text-anchor="middle" '
        f'dominant-baseline="central" fill="#000" stroke="#fff" paint-order="stroke" stroke-linejoin="round">',
    ]
    for p in placed:
        fs = p.size / 0.72
        cls = ' class="uncertain"' if p.uncertain else ""
        parts.append(f'<text x="{p.x:.1f}" y="{p.y:.1f}" font-size="{fs:.1f}" '
                     f'stroke-width="{max(2, p.size * 0.24):.1f}" data-confidence="{p.confidence:.2f}"{cls}>'
                     f'{escape(p.value)}</text>')
    parts.append("</g>")
    if legend_h and swatches:
        n = len(swatches)
        gap = 18
        side = min(legend_h - 40, (w - 80 - gap * (n - 1)) // n)
        x = (w - (n * side + (n - 1) * gap)) // 2
        y = h + (legend_h - side) // 2
        parts.append('<g id="legend">')
        for s in swatches:
            r, g, b = (int(s.hex[i:i + 2], 16) for i in (1, 3, 5))
            fill = "#000" if 0.299 * r + 0.587 * g + 0.114 * b > 150 else "#fff"
            parts.append(f'<rect x="{x}" y="{y}" width="{side}" height="{side}" rx="{side // 6}" '
                         f'fill="{s.hex}" stroke="#000" stroke-width="3"/>'
                         f'<text x="{x + side / 2}" y="{y + side / 2}" font-family="{font_family}" '
                         f'font-weight="800" font-size="{side * 0.55:.0f}" text-anchor="middle" '
                         f'dominant-baseline="central" fill="{fill}">{escape(s.label)}</text>')
            x += side + gap
        parts.append("</g>")
    parts.append("</svg>")
    return "\n".join(parts)
