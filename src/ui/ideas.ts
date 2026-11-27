/**
 * "✨ רעיון לצביעה": tell Claude what to draw. A single page, or a whole book
 * from one theme sentence (page names first, to approve or edit). Ideas are
 * kept in a history she can tap to edit and send again.
 */
import { go } from '../app/app';
import { store } from '../app/store';
import type { BookMeta, PageRec } from '../app/types';
import { creatorError, history, LEVEL_HE, makePage, savePages, themeTitles, type Level } from '../app/creator';
import { freshIdeas, surprise, surpriseTheme } from '../app/ideas';
import { h, sheet, toast } from './dom';
import { sparkle } from './sparkles';

const COVERS = ['#1f2c5c', '#4a2058', '#7a1f2b', '#1f5a45', '#1d4f5a', '#8c3a55', '#5a3218', '#2e3440'];

export interface PanelOpts { mode: 'page' | 'theme'; preset?: string; categoryId?: string; onDone?: (b: BookMeta) => void }

export function ideaPanel(o: PanelOpts): HTMLElement {
  const mode = o.mode;
  let level: Level = 2;
  let cover = COVERS[Math.floor(Math.random() * COVERS.length)];
  let ctl: AbortController | null = null;

  const text = h('textarea', { class: 'field idea__text', rows: 3, maxlength: 400, dir: 'auto',
    placeholder: mode === 'page' ? 'מה היית רוצה שאצייר? למשל: ארנב קוסם בתוך ספר פתוח, עם כוכבים מסביב' : 'נושא לחוברת במשפט אחד, למשל: פירות הדר בתפקיד שוליית המכשף' }) as HTMLTextAreaElement;
  if (o.preset) text.value = o.preset;

  const levels = h('div', { class: 'seg seg--small', role: 'radiogroup', 'aria-label': 'רמת קושי' });
  for (const l of [1, 2, 3] as Level[]) {
    const b = h('button', { class: 'seg__btn' + (l === level ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': String(l === level) }, LEVEL_HE[l]);
    b.addEventListener('click', () => { level = l; levels.querySelectorAll('.seg__btn').forEach((x) => { x.classList.remove('is-on'); x.setAttribute('aria-checked', 'false'); }); b.classList.add('is-on'); b.setAttribute('aria-checked', 'true'); });
    levels.append(b);
  }
  const colors = h('input', { type: 'range', class: 'slider', min: 4, max: 16, value: 10, id: 'idea-colors', 'aria-label': 'מספר צבעים' }) as HTMLInputElement;
  const colorsOut = h('output', { for: 'idea-colors' }, '10');
  colors.addEventListener('input', () => { colorsOut.textContent = colors.value; });
  const count = h('input', { type: 'range', class: 'slider', min: 3, max: 16, value: 8, id: 'idea-count', 'aria-label': 'מספר עמודים' }) as HTMLInputElement;
  const countOut = h('output', { for: 'idea-count' }, '8');
  count.addEventListener('input', () => { countOut.textContent = count.value; });

  // where it goes: a category, then a new book or one of that category's books
  const catSel = h('select', { class: 'field', id: 'idea-cat' }) as HTMLSelectElement;
  const target = h('select', { class: 'field', id: 'idea-target', hidden: mode === 'theme' }, h('option', { value: '' }, '✨ חוברת חדשה')) as HTMLSelectElement;
  const bookTitle = h('input', { class: 'field', id: 'idea-title', placeholder: 'שם החוברת החדשה', maxlength: 60, dir: 'auto' }) as HTMLInputElement;
  const wheel = h('input', { type: 'color', class: 'idea__wheel', value: cover, 'aria-label': 'צבע כריכה מגלגל הצבעים' }) as HTMLInputElement;
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'צבע כריכה' });
  const paintSw = () => swatches.querySelectorAll<HTMLElement>('.swatch').forEach((x) => x.classList.toggle('is-on', x.dataset.c === cover));
  for (const c of COVERS) {
    const b = h('button', { class: 'swatch', type: 'button', style: `background:${c}`, 'aria-label': 'צבע כריכה', 'data-c': c });
    b.addEventListener('click', () => { cover = c; wheel.value = c; paintSw(); });
    swatches.append(b);
  }
  swatches.append(wheel);
  wheel.addEventListener('input', () => { cover = wheel.value; paintSw(); });
  paintSw();
  const newBook = h('div', { class: 'idea__new' }, h('label', { for: 'idea-title' }, 'שם וצבע הכריכה'), bookTitle, swatches);
  target.addEventListener('change', () => { newBook.hidden = !!target.value; });
  let allBooks: BookMeta[] = [];
  const fillBooks = () => {
    target.replaceChildren(h('option', { value: '' }, '✨ חוברת חדשה'));
    for (const b of allBooks.filter((x) => x.categoryId === catSel.value)) target.append(h('option', { value: b.id }, `הוספה ל: ${b.title}`));
    newBook.hidden = !!target.value;
  };
  catSel.addEventListener('change', fillBooks);
  void (async () => {
    const cats = await store.categories();
    allBooks = await store.books();
    for (const c of cats) catSel.append(h('option', { value: c.id }, `${c.icon} ${c.name}`));
    catSel.value = o.categoryId && cats.some((c) => c.id === o.categoryId) ? o.categoryId : 'cat-claude';
    fillBooks();
  })();

  const status = h('p', { class: 'idea__status', role: 'status' });
  const go1 = h('button', { class: 'btn btn--gold', type: 'button' }, mode === 'page' ? '✨ צור דף' : '✨ הצע שמות לעמודים');
  const surpriseBtn = h('button', { class: 'btn', type: 'button' }, '🎲 הפתע אותי');
  const cancel = h('button', { class: 'btn btn--ghost', type: 'button', hidden: true }, 'עצירה');
  const titlesBox = h('div', { class: 'idea__titles', hidden: true });
  const histBox = h('div', { class: 'idea__hist' });

  surpriseBtn.addEventListener('click', async () => {
    surpriseBtn.disabled = true; const was = surpriseBtn.textContent; surpriseBtn.textContent = '🎲 חושבת…';
    try {
      const [idea] = await freshIdeas(mode, 1, [text.value, ...history.all().map((x) => x.text)]);
      text.value = idea ?? (mode === 'theme' ? surpriseTheme() : surprise());
    } catch { text.value = mode === 'theme' ? surpriseTheme() : surprise(); }
    surpriseBtn.disabled = false; surpriseBtn.textContent = was; text.focus();
  });

  const renderHist = () => {
    const list = history.all().filter((x) => x.kind === mode);
    histBox.replaceChildren();
    if (!list.length) return;
    histBox.append(h('h3', { class: 'idea__h' }, 'הרעיונות שלי (הקשה לעריכה ושליחה מחדש)'));
    for (const it of list.slice(0, 20)) {
      const chip = h('div', { class: 'hist-chip' },
        h('button', { class: 'hist-chip__text', type: 'button', dir: 'auto', title: 'עריכה ושליחה מחדש' }, it.text),
        h('button', { class: 'hist-chip__x', type: 'button', 'aria-label': 'מחיקה מההיסטוריה' }, '×'));
      chip.firstElementChild!.addEventListener('click', () => { text.value = it.text; text.focus(); text.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
      chip.lastElementChild!.addEventListener('click', () => { history.remove(it.id); renderHist(); });
      histBox.append(chip);
    }
  };
  renderHist();

  const busy = (on: boolean) => { go1.disabled = on; surpriseBtn.disabled = on; cancel.hidden = !on; text.disabled = on; };
  cancel.addEventListener('click', () => ctl?.abort());

  const finish = async (pages: PageRec[], fallbackTitle: string) => {
    const book = await savePages(target.value ? { bookId: target.value } : { title: bookTitle.value.trim() || fallbackTitle, coverColor: cover, categoryId: catSel.value || 'cat-claude' }, pages);
    const r = go1.getBoundingClientRect(); sparkle(r.left + r.width / 2, r.top, 60, 7);
    toast(`נוסף ל"${book.title}" ✨`);
    o.onDone?.(book);
  };

  const makePages = async (items: { idea: string; title: string }[], fallbackTitle: string) => {
    ctl = new AbortController(); busy(true);
    const pages: PageRec[] = [];
    const bookId = target.value || `b-${Date.now().toString(36)}`;
    try {
      for (let i = 0; i < items.length; i++) {
        const pre = items.length > 1 ? `עמוד ${i + 1} מתוך ${items.length}: ` : '';
        try {
          pages.push(await makePage(bookId, items[i].idea, items[i].title, { level, colors: Number(colors.value), signal: ctl.signal, progress: (m) => { status.textContent = pre + m; } }));
        } catch (e) {
          if (ctl.signal.aborted || items.length === 1) throw e;
          status.textContent = `${pre}${creatorError(e)} ממשיכה לעמוד הבא…`;
        }
      }
      if (!pages.length) throw new Error('לא נוצרו עמודים');
      await finish(pages, fallbackTitle);
      status.textContent = '';
    } catch (e) {
      console.error(e);
      if (pages.length) { await finish(pages, fallbackTitle); status.textContent = `נשמרו ${pages.length} עמודים. ${creatorError(e)}`; }
      else status.textContent = creatorError(e);
    } finally { busy(false); ctl = null; }
  };

  const showTitles = (titles: string[], theme: string) => {
    titlesBox.replaceChildren(h('h3', { class: 'idea__h' }, 'שמות העמודים: אפשר לערוך, למחוק ולהוסיף'));
    const list = h('ol', { class: 'titles' });
    const row = (t: string) => {
      const input = h('input', { class: 'field', value: t, dir: 'auto', maxlength: 60 }) as HTMLInputElement;
      const li = h('li', {}, input, h('button', { class: 'icon-btn icon-btn--sm', type: 'button', 'aria-label': 'מחיקת עמוד', onclick: () => li.remove() }, '×'));
      list.append(li);
    };
    titles.forEach(row);
    const add = h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => row('') }, '＋ עמוד');
    const draw = h('button', { class: 'btn btn--gold', type: 'button' }, '🎨 צייר את החוברת');
    draw.addEventListener('click', () => {
      const names = [...list.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
      if (!names.length) { toast('צריך לפחות עמוד אחד'); return; }
      titlesBox.hidden = true;
      void makePages(names.map((n) => ({ idea: `${n} (חלק מחוברת בנושא: ${theme})`, title: n })), theme);
    });
    titlesBox.append(list, h('div', { class: 'form__actions' }, add, draw));
    titlesBox.hidden = false;
  };

  go1.addEventListener('click', async () => {
    const idea = text.value.trim();
    if (!idea) { toast('כתבי רעיון, או לחצי על "הפתע אותי"'); text.focus(); return; }
    history.add(idea, mode); renderHist();
    if (mode === 'page') { await makePages([{ idea, title: idea.slice(0, 40) }], idea.slice(0, 40)); return; }
    ctl = new AbortController(); busy(true); status.textContent = 'קלוד חושב על שמות לעמודים…';
    try {
      const titles = await themeTitles(idea, Number(count.value), ctl.signal);
      if (!bookTitle.value.trim()) bookTitle.value = idea.slice(0, 60);
      status.textContent = '';
      showTitles(titles, idea);
    } catch (e) { status.textContent = creatorError(e); }
    finally { busy(false); ctl = null; }
  });

  return h('div', { class: 'idea' },
    text,
    h('div', { class: 'idea__actions' }, go1, surpriseBtn, cancel),
    status, titlesBox,
    h('div', { class: 'idea__where' },
      h('label', { for: 'idea-cat', class: 'set-label' }, mode === 'page' ? 'לאיזו קטגוריה לשייך?' : 'באיזו קטגוריה לשים את החוברת?'), catSel,
      mode === 'page' ? h('label', { for: 'idea-target', class: 'set-label' }, 'לאיזו חוברת?') : null, target, newBook),
    h('details', { class: 'idea__more' }, h('summary', {}, 'רמת קושי ומספר צבעים'),
      h('div', { class: 'idea__opts' },
        h('label', {}, 'רמת קושי'), levels,
        h('div', { class: 'idea__row' }, h('label', { for: 'idea-colors' }, 'מספר צבעים ', colorsOut), colors),
        mode === 'theme' ? h('div', { class: 'idea__row' }, h('label', { for: 'idea-count' }, 'עמודים בחוברת ', countOut), count) : null)),
    histBox);
}

/** "רעיון לצביעה": a handful of ready ideas; tap one to draw it. */
function ideaList(onPick: (idea: string, kind: 'page' | 'theme') => void): HTMLElement {
  const box = h('div', { class: 'ideas-list' });
  const status = h('p', { class: 'idea__status', role: 'status' });
  const more = h('button', { class: 'btn', type: 'button' }, '🎲 עוד רעיונות');
  const shown: string[] = [];
  const load = async () => {
    more.disabled = true; status.textContent = 'קלוד ממציא רעיונות…';
    box.replaceChildren(...Array.from({ length: 6 }, () => h('div', { class: 'idea-pick idea-pick--wait' })));
    const [pages, themes] = await Promise.all([freshIdeas('page', 6, shown), freshIdeas('theme', 2, shown)]);
    box.replaceChildren();
    for (const [list, kind] of [[pages, 'page'], [themes, 'theme']] as const) for (const t of list) {
      shown.push(t);
      const b = h('button', { class: 'idea-pick', type: 'button', dir: 'auto' },
        h('span', { class: 'idea-pick__kind' }, kind === 'page' ? '🖍️ דף' : '📚 חוברת'), h('span', {}, t));
      b.addEventListener('click', () => onPick(t, kind));
      box.append(b);
    }
    status.textContent = ''; more.disabled = false;
  };
  more.addEventListener('click', () => void load());
  void load();
  return h('div', { class: 'idea' }, h('p', { class: 'set-label' }, 'בחרי רעיון, ואפשר לערוך אותו לפני שמציירים.'), status, box, h('div', { class: 'idea__actions' }, more));
}

/** "✨ צור חוברת צביעה": choose a single page, a whole themed book, or a ready idea. */
export function openCreator(o: { categoryId?: string; onDone?: (b: BookMeta) => void } = {}): void {
  const body = h('div', { class: 'creator' });
  let close = () => {};
  const done = async (b: BookMeta) => {
    close();
    if (o.onDone) { o.onDone(b); return; }
    const cat = (await store.categories()).find((c) => c.id === b.categoryId);
    if (cat) { const { shelfScreen } = await import('../screens/shelf'); go((r) => shelfScreen(r, cat), 'forward'); }
  };
  const back = h('button', { class: 'btn btn--ghost creator__back', type: 'button' }, '→ חזרה לבחירה');
  const show = (mode: 'page' | 'theme' | 'ideas', preset?: string) => {
    const inner = mode === 'ideas'
      ? ideaList((idea, kind) => show(kind, idea))
      : ideaPanel({ mode, preset, categoryId: o.categoryId, onDone: (b) => void done(b) });
    const head = h('h3', { class: 'creator__h' }, mode === 'page' ? '🖍️ דף אחד' : mode === 'theme' ? '📚 חוברת שלמה מנושא' : '🌟 רעיון לצביעה');
    body.replaceChildren(h('div', { class: 'creator__top' }, back, head), inner);
  };
  const menu = () => {
    const card = (icon: string, t: string, sub: string, m: 'page' | 'theme' | 'ideas') => {
      const b = h('button', { class: 'creator__opt', type: 'button' }, h('span', { class: 'creator__icon', 'aria-hidden': 'true' }, icon), h('span', { class: 'creator__t' }, t), h('span', { class: 'creator__sub' }, sub));
      b.addEventListener('click', () => show(m));
      return b;
    };
    body.replaceChildren(h('div', { class: 'creator__menu' },
      card('🖍️', 'דף אחד', 'ציור אחד, לחוברת חדשה או קיימת, בכל קטגוריה', 'page'),
      card('📚', 'חוברת שלמה מנושא', 'משפט אחד, וכל עמוד הוא וריאציה עליו', 'theme'),
      card('🌟', 'רעיון לצביעה', 'קלוד מציע כמה רעיונות, ואת בוחרת', 'ideas')));
  };
  back.addEventListener('click', menu);
  menu();
  close = sheet('✨ צור חוברת צביעה', body);
}

export function openIdeas(): void { openCreator(); }

/** The floating "✨ רעיון לצביעה" button: on every screen, draggable, remembers where it was left. */
export function mountIdeaFab(): void {
  if (document.querySelector('.fab')) return;
  const fab = h('button', { class: 'fab', type: 'button', 'aria-label': 'רעיון לצביעה', title: 'רעיון לצביעה' }, h('span', { class: 'fab__icon', 'aria-hidden': 'true' }, '✨'), h('span', { class: 'fab__text' }, 'רעיון לצביעה'));
  document.body.append(fab);
  let pos: { x: number; y: number } | null = null;
  try { pos = JSON.parse(localStorage.getItem('mcb.fabPos') ?? 'null'); } catch { pos = null; }
  const place = () => {
    if (!pos) { fab.style.left = 'calc(max(16px, env(safe-area-inset-left)) + 66px)'; fab.style.top = ''; fab.style.bottom = 'max(16px, env(safe-area-inset-bottom))'; return; }
    const r = fab.getBoundingClientRect();
    fab.style.left = Math.max(6, Math.min(innerWidth - r.width - 6, pos.x * innerWidth)) + 'px';
    fab.style.top = Math.max(6, Math.min(innerHeight - r.height - 6, pos.y * innerHeight)) + 'px';
    fab.style.bottom = 'auto';
  };
  place();
  addEventListener('resize', place);
  let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, down = false;
  fab.addEventListener('pointerdown', (e) => { down = true; moved = false; sx = e.clientX; sy = e.clientY; const r = fab.getBoundingClientRect(); ox = r.left; oy = r.top; fab.setPointerCapture(e.pointerId); });
  fab.addEventListener('pointermove', (e) => {
    if (!down) return;
    if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 8) return;
    moved = true;
    fab.style.left = ox + e.clientX - sx + 'px'; fab.style.top = oy + e.clientY - sy + 'px'; fab.style.bottom = 'auto';
  });
  fab.addEventListener('pointerup', () => {
    down = false;
    if (!moved) { openIdeas(); return; }
    const r = fab.getBoundingClientRect();
    pos = { x: r.left / innerWidth, y: r.top / innerHeight };
    try { localStorage.setItem('mcb.fabPos', JSON.stringify(pos)); } catch { /* private mode */ }
  });
  // while colouring, shrink to the icon so it never covers the page
  const sync = () => {
    const last = document.getElementById('app')!.lastElementChild;
    fab.classList.toggle('fab--mini', !!last?.querySelector('.reader'));
    fab.hidden = !!last?.querySelector('.splash');
  };
  new MutationObserver(sync).observe(document.getElementById('app')!, { childList: true });
  sync();
}
