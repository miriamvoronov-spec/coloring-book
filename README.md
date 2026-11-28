# Miriam Coloring Books

אפליקציית PWA בעברית לצביעת חוברות צביעה לפי מספרים, מותאמת ל-Samsung Galaxy Tab S12+ עם S Pen.
כל ההנחיות וההחלטות נמצאות ב-[CLAUDE.md](CLAUDE.md). קראי אותו לפני שמתחילים לעבוד.

> המאגר פרטי וחייב להישאר פרטי. אסור להעלות אליו קבצי PDF או תמונות של חוברות שנקנו (`.gitignore` חוסם אותם).

## מבנה

```
src/            קוד האפליקציה (Vite + TypeScript)
  app/          מודל הנתונים, IndexedDB, ייבוא .colorbook, זיהוי אזורים, Undo, חוברת הדמו
  screens/      מסכים: פתיחה, קטגוריות, ארון ספרים, פתיחה בתלת-ממד, חוברת
  coloring/     מנוע הצביעה, מברשות, סרגל הכלים, גלגל הצבעים
  ui/           לוגו, כריכות, אייקונים, ניצוצות, צלילים
  layers/       מנוע שכבות (שלב 4)
  music/        נגן מוזיקה (בהמשך)
tests/          בדיקות (vitest): אזורים, "בתוך הקווים", מנורה, Undo
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
npm run build:artifact  # קובץ HTML יחיד ב-dist-artifact/index.html, לפרסום כ-Artifact ב-claude.ai
npm test           # בדיקות
```

### גרסת ה-Artifact

אותו קוד נבנה גם כקובץ HTML יחיד שמתפרסם כ-Artifact פרטי ב-claude.ai, כך שאפשר לפתוח את האפליקציה בקישור, בטאבלט ובטלפון, בלי התקנה.
החוברות לא נכנסות לקובץ: מייבאים אותן מתוך האפליקציה (‎.colorbook או תמונות), והן נשמרות רק בדפדפן של המכשיר.
ב-Artifact אין service worker, ולכן הוא דורש אינטרנט כדי להיפתח.

### פורמט ‎.colorbook‎ (גרסה 1)

קובץ ZIP עם `book.json` בשורש:

```json
{
  "format": "colorbook", "version": 1,
  "title": "LES GRANDS CLASSIQUES TOME 7", "direction": "ltr", "coverColor": "#7a3f22",
  "pages": [
    { "kind": "cover", "image": "pages/001.jpg" },
    { "kind": "coloring", "lines": "pages/004.png", "numbersInImage": true,
      "size": { "width": 4912, "height": 6874 },
      "labels": [{ "value": "7", "x": 1200.5, "y": 830, "size": 64, "confidence": 0.97, "uncertain": false }],
      "legend": [{ "label": "1", "color": "#e94b3c" }],
      "solution": "solutions/004.jpg" },
    { "kind": "back", "image": "pages/131.jpg" }
  ]
}
```

`labels` ו-`legend` הם בדיוק השדות שכלי העיבוד כותב ל-`<page>.json`. המיקומים בפיקסלים של `size`.
`numbersInImage: false` אומר שהקווים בלי המספרים, והאפליקציה מציירת אותם בעצמה (וכך אפשר להסתיר אותם).
ZIP בלי `book.json` עובד גם: התמונות לפי סדר השם, ו-`<שם>.json` לידן אם יש.

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
