#!/usr/bin/env python3
"""Batch tool: turn low-quality coloring-book PDFs into clean, professional pages.

Usage:
    python enhance.py ./books --out ./output

Step 1 of the work order only builds the skeleton: this script finds the PDFs
and prints the pipeline plan. Each stage lives in its own module under
enhance/ and is implemented in phase 1 (see CLAUDE.md).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from enhance.pipeline import STAGES


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="עיבוד חוברות צביעה מ-PDF לדפים מקצועיים")
    p.add_argument("books", type=Path, help="תיקייה עם קבצי PDF")
    p.add_argument("--out", type=Path, default=Path("./output"), help="תיקיית פלט")
    p.add_argument("--pages", help="רק עמודים מסוימים לכיוונון, למשל 1,3,5-7")
    p.add_argument("--dry-run", action="store_true", help="רק להציג מה ייעשה")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.books.is_dir():
        print(f"התיקייה לא נמצאה: {args.books}", file=sys.stderr)
        return 2

    pdfs = sorted(p for p in args.books.iterdir() if p.suffix.lower() == ".pdf")
    if not pdfs:
        print(f"לא נמצאו קבצי PDF ב-{args.books}")
        return 1

    print(f"נמצאו {len(pdfs)} חוברות:")
    for pdf in pdfs:
        print(f"  • {pdf.name}")
    print("\nשלבי העיבוד (יופעלו בשלב 1):")
    for i, stage in enumerate(STAGES, 1):
        status = "✓" if stage.implemented else "○"
        print(f"  {status} {i:2}. {stage.title}")
    print(f"\nפלט יישמר ב: {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
