/** Personal settings: her name, the look of the app, sounds. Kept in prefs on this device. */
import { prefs } from './store';
import { hexToRgb, rgbToHex } from './raster';

export type ThemeId = 'walnut' | 'night' | 'rose' | 'forest' | 'cream' | 'custom';
export const THEMES: { id: ThemeId; name: string; swatch: [string, string] }[] = [
  { id: 'walnut', name: 'ספריית עץ ונרות', swatch: ['#4a2c19', '#e7b850'] },
  { id: 'night', name: 'לילה של כוכבים', swatch: ['#1b2350', '#cfd8ff'] },
  { id: 'rose', name: 'ארמון ורוד', swatch: ['#5a1f3d', '#f3b5c8'] },
  { id: 'forest', name: 'יער הפיות', swatch: ['#1d3a2c', '#e9d27a'] },
  { id: 'cream', name: 'נייר ושמנת', swatch: ['#f6ecd9', '#9c6b2f'] },
];

export const TITLE_FONTS: { id: string; name: string; css: string }[] = [
  { id: 'suez', name: 'סואץ', css: "'Suez One', Georgia, serif" },
  { id: 'bellefair', name: 'בלפייר', css: "'Bellefair', Georgia, serif" },
  { id: 'secular', name: 'סקולר', css: "'Secular One', system-ui, sans-serif" },
  { id: 'amatic', name: 'כתב יד', css: "'Amatic SC', cursive" },
  { id: 'karantina', name: 'קרנטינה', css: "'Karantina', system-ui, sans-serif" },
];

export interface Settings { name: string; theme: ThemeId; titleFont: string; sounds: boolean; sparkles: boolean; customBg: string; customAccent: string }

export function settings(): Settings {
  return {
    name: prefs.get('name', ''),
    theme: prefs.get<ThemeId>('theme', 'walnut'),
    titleFont: prefs.get('titleFont', 'suez'),
    sounds: prefs.get('sound', true),
    sparkles: prefs.get('sparkles', true),
    customBg: prefs.get('customBg', '#3b2a5c'),
    customAccent: prefs.get('customAccent', '#f2c4a0'),
  };
}

export function saveSettings(s: Partial<Settings>): void {
  for (const [k, v] of Object.entries(s)) prefs.set(k === 'sounds' ? 'sound' : k, v);
  applySettings();
}

export function applySettings(): void {
  const s = settings();
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  const vars = ['--wood-0', '--wood-1', '--wood-2', '--wood-3', '--gold', '--gold-hi', '--gold-deep', '--paper', '--paper-2', '--muted'];
  for (const v of vars) root.style.removeProperty(v);
  root.style.removeProperty('color-scheme');
  if (s.theme === 'custom') {
    const light = lum(s.customBg) > 0.55;
    const set = (k: string, v: string) => root.style.setProperty(k, v);
    set('--wood-0', mix(s.customBg, light ? '#ffffff' : '#000000', light ? 0.1 : 0.62));
    set('--wood-1', mix(s.customBg, light ? '#ffffff' : '#000000', light ? 0.45 : 0.4));
    set('--wood-2', s.customBg);
    set('--wood-3', mix(s.customBg, light ? '#000000' : '#ffffff', 0.25));
    set('--gold', s.customAccent);
    set('--gold-hi', mix(s.customAccent, '#ffffff', 0.6));
    set('--gold-deep', mix(s.customAccent, '#000000', 0.3));
    if (light) {
      set('--paper', '#2c1d10'); set('--paper-2', '#4a3826'); set('--muted', mix(s.customBg, '#000000', 0.55));
      set('--gold-hi', mix(s.customAccent, '#000000', 0.15)); set('--gold', mix(s.customAccent, '#000000', 0.25));
      set('color-scheme', 'light');
    } else set('--muted', mix(s.customBg, '#ffffff', 0.6));
  }
  const f = TITLE_FONTS.find((x) => x.id === s.titleFont) ?? TITLE_FONTS[0];
  root.style.setProperty('--font-display', f.css);
  root.classList.toggle('no-sparkles', !s.sparkles);
}

/** Greeting by the hour of the day on this device. */
export function greeting(d = new Date()): string {
  const hr = d.getHours();
  const name = settings().name.trim();
  const g = hr >= 5 && hr < 12 ? 'בוקר טוב' : hr >= 12 && hr < 17 ? 'צהריים טובים' : hr >= 17 && hr < 21 ? 'ערב טוב' : 'לילה טוב';
  return name ? `${g}, ${name}` : g;
}

export function greetingIcon(d = new Date()): string {
  const hr = d.getHours();
  return hr >= 5 && hr < 12 ? '☀️' : hr >= 12 && hr < 17 ? '🌤️' : hr >= 17 && hr < 21 ? '🌅' : '🌙';
}

const LINES = [
  'איזה צבע ירגיש היום כמו קסם?',
  'כל קו שאת צובעת מוסיף קצת אור לעולם ✨',
  'הפיות כבר חידדו לך את העפרונות',
  'היום הוא יום מושלם לצבוע ארמון',
  'אין דבר כזה לצבוע מחוץ לקווים, יש רק סגנון',
  'קצת צבע, קצת שקט, הרבה קסם',
  'הדף מחכה לך, והוא מתרגש',
  'גם הכוכבים התחילו פעם מנקודה קטנה',
  'שבי בנוח, הקסם יעשה את השאר',
  'איזה עמוד יזכה היום לצבעים שלך?',
  'צבע אחד, נשימה אחת, ועוד צבע',
  'העפרונות התגעגעו אלייך',
  'כל ציור הוא הרפתקה קטנה',
  'זמן מצוין לזהב ולנצנצים',
  'הספרייה שלך מנצנצת היום במיוחד',
  'מותר להתחיל בכל פינה',
  'היום נצבע בלי למהר',
  'אולי היום תורו של הסגול?',
  'יש לך ידיים של קוסמת',
  'כל חוברת היא ממלכה קטנה שמחכה למלכה שלה',
];

/** A small sweet line that changes once a day. */
export function dailyLine(d = new Date()): string {
  const day = Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  return LINES[day % LINES.length];
}

function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(Math.round(x[0] + (y[0] - x[0]) * t), Math.round(x[1] + (y[1] - x[1]) * t), Math.round(x[2] + (y[2] - x[2]) * t));
}
function lum(hex: string): number { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
