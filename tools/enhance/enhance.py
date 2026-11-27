#!/usr/bin/env python3
"""Batch tool: turn low-quality coloring-book PDFs into clean, professional pages.

Usage:
    python enhance.py ./books --out ./output              # every page of every book
    python enhance.py ./books --out ./output --pages 4,20,60,90   # tuning run

Per book it writes <out>/<book>/: classification.json, pages/pNNN.{svg,png,json},
covers/, and report.html (before/after + QA flags).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import pymupdf

from enhance import classify, covers, export, extract, page, report
from enhance.pipeline import STAGES


def parse_pages(spec: str | None, n: int) -> list[int] | None:
    if not spec:
        return None
    out: list[int] = []
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-")
            out += range(int(a), int(b) + 1)
        else:
            out.append(int(part))
    return [p for p in out if 1 <= p <= n]


def run_book(pdf: Path, out_root: Path, pages: str | None) -> Path:
    doc = pymupdf.open(pdf)
    out = out_root / pdf.stem
    (out / "pages").mkdir(parents=True, exist_ok=True)
    (out / "covers").mkdir(parents=True, exist_ok=True)
    n = len(doc)

    print(f"\n📖 {pdf.name}: {n} עמודים")
    thumbs = [extract.thumbnail(doc, i) for i in range(n)]
    kinds = classify.classify([classify.features(t) for t in thumbs])
    cls_path = out / "classification.json"
    if cls_path.exists():  # the user's corrections win
        saved = json.loads(cls_path.read_text(encoding="utf-8"))
        kinds = [saved.get(str(i + 1), k) for i, k in enumerate(kinds)]
    cls_path.write_text(json.dumps({str(i + 1): k for i, k in enumerate(kinds)}, ensure_ascii=False, indent=1),
                        encoding="utf-8")

    rep = report.Report(out, f"דוח בקרת איכות: {pdf.stem}")
    rep.classification(thumbs, kinds)

    todo = parse_pages(pages, n) or list(range(1, n + 1))
    bank = page.L.TemplateBank()
    for num in todo:
        kind = kinds[num - 1]
        t = time.time()
        src = extract.page_image(doc, num - 1)
        dpi = src.shape[1] / doc[num - 1].rect.width * 72
        if kind == "coloring":
            r = page.process(src, bank=bank)
            res = export.write_page(out / "pages", f"p{num:03d}", r, dpi)
            import numpy as np
            rep.page(num, src, np.array(res["png"]), r, res["data"])
            st = res["data"]["stats"]
            print(f"  עמוד {num:3}: {st['labels']} תוויות, {st['uncertain']} לא בטוחות "
                  f"({time.time() - t:.0f} שניות)")
        elif kind in ("front_cover", "back_cover", "extra"):
            enh = covers.enhance_color(src)
            cv2.imwrite(str(out / "covers" / f"p{num:03d}.jpg"), enh, [cv2.IMWRITE_JPEG_QUALITY, 92])
            if kind != "extra" or pages:
                rep.cover(num, src, enh)
            print(f"  עמוד {num:3}: {classify_he(kind)} ({time.time() - t:.0f} שניות)")
        else:
            print(f"  עמוד {num:3}: דף פתרונות (שיוך לציורים יגיע בשלב הבא)")
    return rep.write()


def classify_he(kind: str) -> str:
    return report.KIND_HE.get(kind, kind)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="עיבוד חוברות צביעה מ-PDF לדפים מקצועיים")
    p.add_argument("books", type=Path, help="תיקייה עם קבצי PDF (או קובץ PDF אחד)")
    p.add_argument("--out", type=Path, default=Path("./output"), help="תיקיית פלט")
    p.add_argument("--pages", help="רק עמודים מסוימים לכיוונון, למשל 1,4,20,60-62")
    p.add_argument("--list-stages", action="store_true", help="הצג את שלבי העיבוד ומה כבר עובד")
    args = p.parse_args(argv)

    if args.list_stages:
        for i, s in enumerate(STAGES, 1):
            print(f"  {'✓' if s.implemented else '○'} {i:2}. {s.title}")
        return 0
    if args.books.is_file() and args.books.suffix.lower() == ".pdf":
        pdfs = [args.books]
    elif args.books.is_dir():
        pdfs = sorted(x for x in args.books.iterdir() if x.suffix.lower() == ".pdf")
    else:
        print(f"לא נמצא: {args.books}", file=sys.stderr)
        return 2
    if not pdfs:
        print(f"לא נמצאו קבצי PDF ב-{args.books}")
        return 1
    for pdf in pdfs:
        rep = run_book(pdf, args.out, args.pages)
        print(f"  ✨ דוח: {rep}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
