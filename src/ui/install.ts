/**
 * "Install on the home screen". Where the browser offers its own install
 * prompt (the PWA build), one tap installs. Inside the claude.ai link the
 * browser never offers it, so we show the two-step way for her device.
 */
import { prefs } from '../app/store';
import { h, sheet } from './dom';

interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: InstallEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; showInstallBar(); });
window.addEventListener('appinstalled', () => { deferred = null; bar?.remove(); bar = null; });

/** The browser says this site can be installed: offer it straight away, one tap. */
let bar: HTMLElement | null = null;
function showInstallBar() {
  let off = false; try { off = !!sessionStorage.getItem('installBar.off'); } catch { /* ignore */ }
  if (bar || off) return;
  const close = () => { bar?.remove(); bar = null; try { sessionStorage.setItem('installBar.off', '1'); } catch { /* ignore */ } };
  bar = h('div', { class: 'install-bar', role: 'dialog', 'aria-label': 'התקנת האפליקציה' },
    h('button', { class: 'btn btn--gold', type: 'button', onclick: async () => { const d = deferred; close(); if (d) { deferred = null; await d.prompt(); } } }, '📲 להתקין את האפליקציה'),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'לא עכשיו', onclick: close }, '✕'));
  document.body.append(bar);
}

const installed = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

function device(): 'android' | 'ios' | 'desktop' {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

const STEPS: Record<ReturnType<typeof device>, [string, string[]]> = {
  android: ['בטאבלט או בטלפון אנדרואיד (Chrome)', ['לוחצים על ⋮ (שלוש הנקודות) למעלה בצד', 'בוחרים "הוספה למסך הבית" (או "התקנת אפליקציה")', 'לוחצים "הוספה". האייקון מופיע במסך הבית ופותח את הספרייה שלך ישר']],
  ios: ['באייפד או באייפון (Safari)', ['לוחצים על כפתור השיתוף (ריבוע עם חץ למעלה)', 'גוללים ובוחרים "הוספה למסך הבית"', 'לוחצים "הוסף". האייקון מופיע במסך הבית']],
  desktop: ['במחשב (Chrome או Edge)', ['לוחצים על ⋮ למעלה בצד', 'בוחרים "שמירה ושיתוף" ואז "יצירת קיצור דרך" (או "התקנה")', 'מסמנים "פתיחה כחלון" ולוחצים "יצירה"']],
};

/** One-tap install when the browser allows it, otherwise the steps for this device. */
export async function installApp(): Promise<void> {
  prefs.set('installAsked.v1', true);
  if (deferred) {
    const d = deferred; deferred = null;
    await d.prompt();
    return;
  }
  const mine = device();
  const block = (k: ReturnType<typeof device>, open: boolean) => {
    const [title, steps] = STEPS[k];
    const list = h('ol', { class: 'install__steps' }, ...steps.map((s) => h('li', {}, s)));
    return open ? h('div', { class: 'install__mine' }, h('h3', {}, title), list) : h('details', { class: 'idea__more' }, h('summary', {}, title), list);
  };
  sheet('📲 התקנה במסך הבית', h('div', { class: 'install' },
    h('p', { class: 'set-label' }, 'כך האפליקציה נפתחת בלחיצה אחת מהאייקון, כמו כל אפליקציה אחרת, והספרייה והצביעה שלך נשארות בדיוק כמו שהן.'),
    block(mine, true),
    ...(['android', 'ios', 'desktop'] as const).filter((k) => k !== mine).map((k) => block(k, false))));
}

/** Offer it once, the first time the library opens, unless it is already installed. */
export function offerInstallOnce(): void {
  if (installed() || prefs.get('installAsked.v1', false)) return;
  setTimeout(() => void installApp(), 900);
}
