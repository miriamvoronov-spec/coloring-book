/** Category cards: open a bookshelf, add, rename, choose an icon. */
import { jobsBox } from '../ui/jobs';
import { BOOKS_CHANGED } from '../app/jobs';
import { addCategory, go } from '../app/app';
import { prefs, store } from '../app/store';
import type { Category } from '../app/types';
import { h, onLongPress, sheet, toast } from '../ui/dom';
import { logoMark } from '../ui/logo';
import { appBar } from '../ui/appbar';
import { dailyLine, greeting, greetingIcon, settings } from '../app/settings';
import { shelfScreen, FAV_SHELF, CUR_SHELF } from './shelf';
import { openCabinet } from '../ui/cabinet';

const ICONS = ['✨', '🏰', '🧚', '🦄', '🌸', '🐉', '🌙', '⭐', '🎨', '🍄', '🐚', '🦋', '🌈', '👑', '🪄', '📚'];

function iconPicker(selected: string, onPick: (i: string) => void): HTMLElement {
  const row = h('div', { class: 'icon-grid', role: 'radiogroup', 'aria-label': 'אייקון' });
  for (const i of ICONS) {
    const b = h('button', { class: 'icon-choice' + (i === selected ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': String(i === selected) }, i);
    b.addEventListener('click', () => {
      row.querySelectorAll('.icon-choice').forEach((x) => { x.classList.remove('is-on'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('is-on'); b.setAttribute('aria-checked', 'true'); onPick(i);
    });
    row.append(b);
  }
  return row;
}

function editCategory(cat: Category | null, refresh: () => void) {
  let icon = cat?.icon ?? '⭐';
  const name = h('input', { class: 'field', id: 'cat-name', value: cat?.name ?? '', placeholder: 'שם הקטגוריה', maxlength: 40 });
  const body = h('div', { class: 'form' },
    h('label', { for: 'cat-name' }, 'שם'), name,
    h('label', {}, 'אייקון'), iconPicker(icon, (i) => { icon = i; }));
  const actions = h('div', { class: 'form__actions' });
  const save = h('button', { class: 'btn btn--gold', type: 'button' }, cat ? 'שמירה' : 'הוספה');
  actions.append(save);
  if (cat) {
    const move = async (d: -1 | 1) => {
      const cats = await store.categories();
      const i = cats.findIndex((c) => c.id === cat.id), j = i + d;
      if (j < 0 || j >= cats.length) return;
      const a = cats[i], b = cats[j];
      [a.order, b.order] = [b.order, a.order];
      if (a.order === b.order) { a.order = j; b.order = i; }
      await store.putCategory(a); await store.putCategory(b);
      cat.order = a.order;
      refresh();
    };
    actions.append(
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => void move(-1) }, '→ הזזה להתחלה'),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => void move(1) }, 'הזזה לסוף ←'));
  }
  if (cat && !cat.role) {
    const del = h('button', { class: 'btn btn--ghost', type: 'button' }, 'מחיקת הקטגוריה');
    del.addEventListener('click', async () => {
      const books = (await store.books()).filter((b) => b.categoryId === cat.id);
      if (books.length) { toast('יש חוברות בקטגוריה הזאת. העבירי או מחקי אותן קודם.'); return; }
      await store.deleteCategory(cat.id); close(); refresh();
    });
    actions.append(del);
  }
  body.append(actions);
  const close = sheet(cat ? 'עריכת קטגוריה' : 'קטגוריה חדשה', body);
  save.addEventListener('click', async () => {
    const n = name.value.trim();
    if (!n) { toast('כתבי שם לקטגוריה'); return; }
    if (cat) await store.putCategory({ ...cat, name: n, icon }); else await addCategory(n, icon);
    close(); refresh();
  });
  setTimeout(() => name.focus(), 300);
}

export function categoriesScreen(el: HTMLElement) {
  const grid = h('div', { class: 'cat-grid' });
  const pick = h('input', { type: 'file', accept: '.pdf,application/pdf,image/*,.colorbook,.zip', multiple: true, hidden: true }) as HTMLInputElement;
  pick.addEventListener('change', async () => {
    const fs = [...(pick.files ?? [])]; pick.value = '';
    if (!fs.length) return;
    const cb = fs.find((f) => /\.(colorbook|zip)$/i.test(f.name));
    if (cb) {
      const cats = await store.categories();
      const cat = cats.find((c) => c.id === 'cat-imported') ?? cats[0];
      const { importFiles } = await import('../app/importer');
      try { const b = await importFiles([cb], cat, () => {}); toast(`"${b.title}" נוספה למדף ${cat.name}`); dispatchEvent(new CustomEvent(BOOKS_CHANGED)); void import('./friends').then((m) => m.askToShare(b)); }
      catch (e) { toast(e instanceof Error ? e.message : 'הייבוא נכשל'); }
      return;
    }
    const { pdfWizard } = await import('./pdfwizard');
    pdfWizard(fs);
  });
  const addPdf = h('button', { class: 'btn btn--gold appbar__add', type: 'button', onclick: () => pick.click(), title: 'הוספת חוברת: קובץ PDF, תמונות של הדפים או .colorbook', 'aria-label': 'הוספת חוברת' }, h('span', { class: 'appbar__ico' }, '📥'), h('span', { class: 'appbar__txt' }, ' הוספת חוברת (PDF, תמונות או .colorbook)'));
  const friendsBtn = h('button', { class: 'btn appbar__add', type: 'button', title: 'חברות, קבוצות וחוברות משותפות', onclick: async () => { const { friendsScreen } = await import('./friends'); go(friendsScreen, 'forward'); }, 'aria-label': 'חברות וקבוצות' }, h('span', { class: 'appbar__ico' }, '👭'), h('span', { class: 'appbar__txt' }, ' חברות וקבוצות'));
  const [jobs, offJobs] = jobsBox();
  const lists = h('div', { class: 'lists-row' });
  el.append(h('main', { class: 'categories' },
    appBar({ title: h('div', { class: 'appbar__brand' }, h('span', { class: 'appbar__logo', html: logoMark(48) }), h('h1', { class: 'appbar__title' }, 'הספרייה שלי')), end: [friendsBtn, addPdf], home: 'splash' }), pick,
    !prefs.get('showGreeting', true) ? null : h('p', { class: 'greet' }, h('span', { class: 'greet__icon', 'aria-hidden': 'true' }, greetingIcon()), ' ', greeting(),
      settings().name ? '' : h('button', { class: 'greet__ask', type: 'button', onclick: async () => { const { settingsScreen } = await import('./settings'); go(settingsScreen, 'forward'); } }, 'איך קוראים לך?')),
    prefs.get('showLine', true) ? h('p', { class: 'greet__line' }, dailyLine()) : null,
    jobs,
    lists,
    grid,
    h('p', { class: 'hint' }, 'לחיצה ארוכה על קטגוריה פותחת עריכה')));

  const render = async () => {
    const [cats, books] = await Promise.all([store.categories(), store.books()]);
    grid.replaceChildren();
    lists.replaceChildren();
    for (const [v, n] of [[FAV_SHELF, books.filter((b) => b.favorite).length], [CUR_SHELF, books.filter((b) => b.current).length]] as const) {
      const pill = h('button', { class: 'list-pill', type: 'button' }, h('span', { class: 'list-pill__icon', 'aria-hidden': 'true' }, v.icon), h('span', {}, v.name), h('span', { class: 'list-pill__n' }, String(n)));
      pill.addEventListener('click', () => go((r) => shelfScreen(r, v), 'forward'));
      lists.append(pill);
    }
    for (const c of cats) {
      const count = books.filter((b) => b.categoryId === c.id).length;
      const card = h('button', { class: 'cat-card', type: 'button' },
        h('span', { class: 'cat-card__icon', 'aria-hidden': 'true' }, c.icon),
        h('span', { class: 'cat-card__name', dir: 'auto' }, c.name),
        h('span', { class: 'cat-card__count' }, count === 1 ? 'חוברת אחת' : `${count} חוברות`));
      card.addEventListener('click', () => void openCabinet(c.name, c.icon, () => go((r) => shelfScreen(r, c), 'none')));
      onLongPress(card, () => editCategory(c, render));
      grid.append(card);
    }
    const add = h('button', { class: 'cat-card cat-card--add', type: 'button' },
      h('span', { class: 'cat-card__icon', 'aria-hidden': 'true' }, '＋'),
      h('span', { class: 'cat-card__name' }, 'קטגוריה חדשה'));
    add.addEventListener('click', () => editCategory(null, render));
    grid.append(add);
  };
  void render();
  const onBooks = () => void render();
  addEventListener(BOOKS_CHANGED, onBooks);
  return () => { offJobs(); removeEventListener(BOOKS_CHANGED, onBooks); };
}
