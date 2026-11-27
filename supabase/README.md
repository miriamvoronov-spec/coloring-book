# חיבור החשבונות, הקבוצות והשיתוף (Supabase)

החשבונות, החברות, הקבוצות, הצ'אט והחוברות המשותפות נשמרים בשרת Supabase חינמי שבבעלותך.
עושים את זה פעם אחת, בערך 20 דקות. לא צריך לדעת לתכנת.

## 1. יצירת הפרויקט

1. נכנסים ל-supabase.com ← Start your project ← נרשמים עם גוגל.
2. New project. שם: `coloring-book`. סיסמה למסד הנתונים: לוחצים Generate ושומרים אותה במקום בטוח.
3. Region: **Central EU (Frankfurt)**. אין אזור בישראל, ופרנקפורט הוא מהקרובים.
4. Instance size / Compute: משאירים את מה שמוגדר (Nano או Micro, החינמי).
5. Create new project, ומחכים כשתי דקות.

## 2. הדבקת קובץ ה-SQL

1. בתפריט הצד: **SQL Editor** ← **New query**.
2. פותחים את הקובץ `supabase/schema.sql` (בגיבוי: `supabase-schema.sql`), מעתיקים את כל התוכן ומדביקים.
3. **Run**. אמור להופיע `Success. No rows returned`. מותר להריץ שוב, זה לא מוחק כלום.

## 3. הגדרות כניסה

**Authentication ← URL Configuration**

* Site URL: `https://miriamvoronov-spec.github.io/coloring-book/`
* Redirect URLs ← Add URL: אותה כתובת, וגם `http://localhost:5173/` (לעבודה במחשב).

**Authentication ← Sign In / Providers ← Email**

* מומלץ לכבות את **Confirm email**, כדי שחברות ייכנסו מיד בלי לחכות למייל אישור. Save.

## 4. כניסה עם גוגל

בגוגל:

1. console.cloud.google.com ← למעלה בוחרים פרויקט ← **New Project** ← שם `coloring-book` ← Create.
2. **APIs & Services ← OAuth consent screen** (או Google Auth Platform ← Branding): External, שם האפליקציה `Miriam's Coloring Books`, המייל שלך ← Save. ב-Audience לוחצים **Publish app**, כדי שכל אחת תוכל להיכנס.
3. **Credentials ← Create credentials ← OAuth client ID**: סוג **Web application**.
4. **Authorized redirect URIs ← Add URI**: הכתובת שמופיעה ב-Supabase בעמוד של Google (שלב הבא), בצורה `https://XXXX.supabase.co/auth/v1/callback`.
5. Create. מעתיקים את **Client ID** ואת **Client secret**.

ב-Supabase:

1. **Authentication ← Sign In / Providers ← Google** ← Enable.
2. מדביקים Client ID ו-Client secret ← Save.

## 5. שני הקודים לאפליקציה

**Project Settings ← API** (או Data API / API Keys):

* **Project URL**, בצורה `https://XXXX.supabase.co`
* **anon public key** (מתחיל ב-`eyJ`), או **Publishable key** (מתחיל ב-`sb_publishable_`).

שני אלה מותר לפרסם: הם לא סודיים, וכל ההגנה היא בכללי ההרשאות שבקובץ ה-SQL.
אסור לפרסם את ה-**service_role** / **Secret key**.

איך מכניסים אותם:

* **לכולן בבת אחת (מומלץ):** בונים את האפליקציה עם הקודים. בקובץ `.env.local` בתיקיית הפרויקט:
  ```
  VITE_SUPABASE_URL=https://XXXX.supabase.co
  VITE_SUPABASE_KEY=eyJ...
  ```
  ואז `npm run build` ומעלים את `dist/` כרגיל. כל מי שפותחת את הקישור מחוברת אוטומטית.
* **רק במכשיר שלך, בלי לבנות:** באפליקציה ← "👭 חברות וקבוצות" ← מדביקים את שני הקודים ← חיבור.

## 6. טביעת אצבע

אחרי הכניסה, ב"👭 חברות וקבוצות" לוחצים **👆 כניסה בטביעת אצבע**. מעכשיו החשבון במכשיר הזה נפתח בטביעת האצבע (או בנעילת המסך) של הטאבלט או הטלפון. זה עובד באפליקציה המותקנת ובכרום, לא בתוך claude.ai.

## מה יש בשרת

| טבלה | מה זה |
| --- | --- |
| `profiles` | שם משתמש, שם לתצוגה, שאלת אבטחה ותשובה מוצפנת |
| `friendships` | בקשות חברות ואישורים |
| `groups`, `group_members` | קבוצות בלי הגבלה, וחברות בהן |
| `messages` | צ'אט הקבוצה, בזמן אמת |
| `invites` | קישורי הזמנה לקבוצה, בתוקף 14 יום |
| `shared_books`, `book_shares` | חוברות משותפות (בלי הצביעה), ועם מי שותפו |
| Storage `books` | קבצי החוברות, בחלקים של עד 45MB |

כל טבלה מוגנת: רואים רק את מה ששלך, של חברות שאישרו, או של קבוצות שאת חברה בהן.
שחזור סיסמה בשאלת אבטחה: אחרי 5 תשובות שגויות החשבון ננעל לשעה.
המכסה החינמית: 500MB למסד הנתונים ו-1GB לקבצים. פרויקט שלא נכנסים אליו שבוע נכנס להשהיה, ומעירים אותו בלחיצה ב-supabase.com.
