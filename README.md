# Miriam Coloring Books

אפליקציית PWA בעברית לצביעת חוברות צביעה לפי מספרים, מותאמת ל-Samsung Galaxy Tab S12+ עם S Pen.
כל ההנחיות וההחלטות נמצאות ב-[CLAUDE.md](CLAUDE.md). קראי אותו לפני שמתחילים לעבוד.

> המאגר פרטי וחייב להישאר פרטי. אסור להעלות אליו קבצי PDF או תמונות של חוברות שנקנו (`.gitignore` חוסם אותם).

## מבנה

```
src/            קוד האפליקציה (Vite + TypeScript)
  screens/      מסכים: פתיחה, קטגוריות, ארון ספרים, חוברת
  coloring/     כלי צביעה
  layers/       מנוע שכבות
  storage/      IndexedDB ו-.colorbook
  music/        נגן מוזיקה
public/         אייקונים, מוזיקה (public/music/<channel>/)
tools/enhance/  כלי פייתון לעיבוד חוברות PDF
CREDITS.md      קרדיטים למוזיקה
```

## הרצת האפליקציה

דרוש Node.js 20 ומעלה.

```bash
npm install
npm run dev        # שרת פיתוח, נפתח גם ברשת המקומית (אפשר לגלוש אליו מהטאבלט)
npm run build      # בנייה לתיקיית dist/ כולל service worker
npm run preview    # הרצת הבנייה, כולל מצב אופליין
```

בדיקה מהטאבלט: הריצי `npm run dev`, וגלשי בכרום בטאבלט לכתובת `Network` שמודפסת בטרמינל (באותה רשת Wi-Fi).

## כלי העיבוד

ראי [tools/enhance/README.md](tools/enhance/README.md).

```bash
python tools/enhance/enhance.py ./books --out ./output
```

## עבודה משותפת

1. לא עובדים ישירות על `main`. לכל משימה פותחים branch: `git checkout -b feature/<שם>`.
2. מעלים את ה-branch ופותחים Pull Request. השנייה מאיתנו עוברת ומאשרת.
3. כשמחליטים על משהו חדש, מוסיפים שורה ל"החלטות שהתקבלו" בסוף `CLAUDE.md`, באותו PR.

## התקנה בטאבלט

יתווסף בשלב הפריסה (Chrome → ⋮ → "הוסף למסך הבית").
