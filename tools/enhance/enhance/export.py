"""Stage 12: write a page's outputs (SVG, 300dpi PNG, labels/legend JSON)."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from . import render, vectorize


def write_page(out_dir: Path, stem: str, result, src_dpi: float, legend_h: int = 260) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    placed = render.place_labels(result)
    svg = vectorize.page_svg(result.lines, placed, result.swatches, legend_h)
    (out_dir / f"{stem}.svg").write_text(svg, encoding="utf-8")

    img = render.render_png(result, placed)
    legend = render.legend_strip(result.swatches, img.width, legend_h)
    full = Image.new("L", (img.width, img.height + legend_h), 255)
    full.paste(img, (0, 0))
    full = full.convert("RGB")
    full.paste(legend, (0, img.height))
    # resample to 300 dpi for print
    s = 300 / src_dpi
    png = full.resize((round(full.width * s), round(full.height * s)), Image.LANCZOS) if abs(s - 1) > 0.01 else full
    png.save(out_dir / f"{stem}.png", dpi=(300, 300), optimize=True)

    data = {
        "labels": [{"value": p.value, "x": round(p.x, 1), "y": round(p.y, 1), "size": round(p.size, 1),
                    "confidence": round(p.confidence, 3), "uncertain": p.uncertain} for p in placed],
        "legend": [{"label": s.label, "color": s.hex} for s in result.swatches],
        "flags": result.flags,
        "stats": {"labels": len(placed), "uncertain": sum(p.uncertain for p in placed),
                  "touching_lines": result.touching, "ocr_rechecked": result.ocr_fixed,
                  "gaps_bridged": result.bridges},
        "size": {"width": int(result.lines.shape[1]), "height": int(result.lines.shape[0])},
    }
    (out_dir / f"{stem}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"placed": placed, "png": full, "data": data}
