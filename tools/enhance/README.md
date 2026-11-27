# tools/enhance

כלי אצווה שהופך חוברות PDF לדפי צביעה מקצועיים (שלב 1 ב-CLAUDE.md).

```bash
cd tools/enhance
python -m venv .venv && source .venv/bin/activate   # ב-Windows: .venv\Scripts\activate
pip install -r requirements.txt
python enhance.py ./books --out ./output
```

כרגע זה שלד: הכלי מוצא את קבצי ה-PDF ומציג את רשימת השלבים. תיקיות `books/` ו-`output/` לא עולות למאגר.
