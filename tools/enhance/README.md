# tools/enhance

כלי אצווה שהופך חוברות PDF לדפי צביעה מקצועיים (שלב 1 ב-CLAUDE.md).

## התקנה

```bash
cd tools/enhance
python -m venv .venv && source .venv/bin/activate   # ב-Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

צריך גם שתי תוכנות חיצוניות: **tesseract** (זיהוי תוויות) ו-**potrace** (וקטוריזציה). קישורי התקנה ב-`requirements.txt`.

## הרצה

```bash
python enhance.py ./books --out ./output                    # כל החוברות, כל העמודים
python enhance.py ./books --out ./output --pages 4,20,47    # כיוונון על כמה עמודים
python enhance.py --list-stages ./books                     # מה כבר עובד
```

לכל חוברת נוצרת תיקייה `output/<שם החוברת>/` עם:

- `report.html`: סיווג העמודים, ולכל דף צביעה לפני/אחרי עם סימון של תוויות לא בטוחות ואזורים לא סגורים.
- `classification.json`: הסיווג. אם מתקנים אותו ומריצים שוב, התיקון נשמר.
- `pages/pNNN.svg`, `pNNN.png` (300dpi), `pNNN.json` (תוויות עם מיקום, ערך וביטחון, מקרא, דגלים).
- `covers/`: כריכות ועמודים צבעוניים, משופרים.

תיקיות `books/` ו-`output/` לא עולות למאגר.

## מה עוד חסר

שיוך פתרונות לדפים, יישור דף מעוגל, Real-ESRGAN לסריקות קטנות, PDF להדפסה וקובץ `.colorbook`.
