"""Ordered list of pipeline stages, matching the 13 steps in CLAUDE.md (phase 1)."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Stage:
    key: str
    title: str
    module: str
    implemented: bool = False


STAGES: list[Stage] = [
    Stage("extract", "חילוץ מקור (PyMuPDF, תמונה טבעית או 600dpi, implemented=True)", "extract"),
    Stage("classify", "סיווג עמודים: כריכות, צביעה, פתרונות", "classify", implemented=True),
    Stage("match", "שיוך פתרונות לדפי ציור (feature matching)", "match"),
    Stage("dewarp", "יישור דף מעוגל ותיקון פרספקטיבה", "dewarp"),
    Stage("upscale", "הגדלה עם Real-ESRGAN", "upscale"),
    Stage("clean", "נרמול תאורה, הסרת צללים, הלבנת רקע וניקוי רעש", "clean", implemented=True),
    Stage("lines", "קווים: threshold, סגירת חורים, עובי אחיד", "lines", implemented=True),
    Stage("vectorize", "וקטוריזציה ל-SVG עם potrace", "vectorize", implemented=True),
    Stage("labels", "זיהוי מספרים וכתיבה מחדש בהדגשה מקסימלית", "labels", implemented=True),
    Stage("legend", "מקרא מספר→צבע", "legend", implemented=True),
    Stage("covers", "שיפור כריכות בצבע", "covers", implemented=True),
    Stage("export", "פלט: SVG, ‏PNG 300dpi, ‏PDF, ‏.colorbook", "export"),
    Stage("report", "דוח בקרת איכות HTML לפני/אחרי", "report", implemented=True),
]
