/**
 * Add a book from a PDF: name it, choose (or create) its category and reading
 * direction, check what each page is, then build it page by page.
 */
import { addCategory, go } from '../app/app';
import { store } from '../app/store';
import type { Category } from '../app/types';
import { guessKind, importPdfBook, KIND_HE, openPdf, renderPage, type PdfDoc, type PdfKind } from '../app/pdfimport';
import { appBar } from '../ui/appbar';
import { h, toast } from '../ui/dom';
import { categoriesScreen } from './categories';
import { shelfScreen } from './shelf';

const CYCLE: PdfKind[] = ['coloring', 'cover', 'back', 'solution', 'skip'];

function sizeHe(bytes: number): string {
  return bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

export function pdfWizard(file: File, preferred?: Category) {
  go((el) => wizardScreen(el, file, preferred), 'forward');
}

function wizardScreen(el: HTMLElement, file: File, preferred?: Category) {
  let doc: PdfDoc | null = null;
  let kinds: PdfKind[] = [];
  let stop = false;
  const abort = new AbortController();
  const leave = (to: () => void) => { stop = true; abort.abort(); void doc?.destroy(); to(); };

  const title = h('input', { class: 'field', id: 'pdf-title', value: file.name.replace(/\.pdf$/i, ''), maxlength: 80, dir: 'auto' }) as HTMLInputElement;
  const catSel = h('select', { class: 'field', id: 'pdf-cat' }) as HTMLSelectElement;
  const newCat = h('input', { class: 'field', id: 'pdf-newcat', placeholder: 'שם הקטגוריה החדשה', maxlength: 40, hidden: true }) as HTMLInputElement;
  const dir = h('select', { class: 'field', id: 'pdf-dir' },
    h('option', { value: 'rtl' }, 'מימין לשמאל (עברית)'),
    h('option', { value: 'ltr' }, 'משמאל לימין (אנגלית, צרפתית)')) as HTMLSelectElement;
  if (/[a-z]/i.test(file.name) && !/[א-ת]/.test(file.name)) dir.value = 'ltr';
  catSel.addEventListener('change', () => { newCat.hidden = catSel.value !== '__new'; if (!newCat.hidden) newCat.focus(); });

  const status = h('p', { class: 'wiz__status', role: 'status' }, `פותחת את הקובץ (${sizeHe(file.size)})…`);
  const bar = h('div', { class: 'wiz__bar' }, h('span', {}));
  const grid = h('div', { class: 'wiz__grid' });
  const go1 = h('button', { class: 'btn btn--gold wiz__go', type: 'button', disabled: true }, 'הוספה למדף ✨');
  const counts = h('p', { class: 'wiz__counts muted' });

  const setBar = (f: number) => { (bar.firstElementChild as HTMLElement).style.width = `${Math.round(f * 100)}%`; };
  const refreshCounts = () => {
    const n = (k: PdfKind) => kinds.filter((x) => x === k).length;
    counts.textContent = `${n('coloring')} דפי צביעה · ${n('cover') + n('back')} כריכות · ${n('solution')} פתרונות · ${n('skip')} מדולגים`;
  };

  el.append(h('main', { class: 'wiz' },
    appBar({ title: 'הוספת חוברת מ-PDF', back: { label: 'ביטול', to: () => leave(() => go(preferred ? (r) => shelfScreen(r, preferred) : categoriesScreen, 'back')) } }),
    h('div', { class: 'wiz__body' },
      h('section', { class: 'set-card wiz__form' },
        h('label', { for: 'pdf-title', class: 'set-label' }, 'שם החוברת'), title,
        h('label', { for: 'pdf-cat', class: 'set-label' }, 'קטגוריה'), catSel, newCat,
        h('label', { for: 'pdf-dir', class: 'set-label' }, 'כיוון הדפדוף'), dir),
      h('section', { class: 'set-card' },
        h('h2', { class: 'set-card__title' }, 'מה יש בכל עמוד?'),
        h('p', { class: 'set-label' }, 'זיהיתי לבד מה כל עמוד. הקשה על עמוד מחליפה: דף צביעה, כריכה, כריכה אחורית, פתרון או דילוג. פתרונות לא נכנסים כדפי צביעה.'),
        status, bar, counts, grid)),
    h('footer', { class: 'wiz__foot' }, go1)));

  void (async () => {
    const cats = await store.categories();
    for (const c of cats) catSel.append(h('option', { value: c.id }, `${c.icon} ${c.name}`));
    catSel.append(h('option', { value: '__new' }, '＋ קטגוריה חדשה…'));
    catSel.value = preferred?.id ?? cats.find((c) => c.role === 'imported')?.id ?? cats[0]?.id ?? '__new';
    newCat.hidden = catSel.value !== '__new';
    try {
      doc = await openPdf(file);
    } catch (e) { status.textContent = e instanceof Error ? e.message : 'לא הצלחתי לפתוח את הקובץ'; return; }
    const n = doc.numPages;
    kinds = new Array(n).fill('skip');
    status.textContent = `${n} עמודים. מכינה תמונות קטנות…`;
    const tiles: HTMLButtonElement[] = [];
    for (let i = 0; i < n; i++) {
      const tile = h('button', { class: 'wiz__tile', type: 'button', 'aria-label': `עמוד ${i + 1}` },
        h('span', { class: 'wiz__thumb' }), h('span', { class: 'wiz__num' }, String(i + 1)), h('span', { class: 'wiz__kind' }, '…')) as HTMLButtonElement;
      tile.addEventListener('click', () => {
        kinds[i] = CYCLE[(CYCLE.indexOf(kinds[i]) + 1) % CYCLE.length];
        paintTile(tile, kinds[i]); refreshCounts();
      });
      tiles.push(tile); grid.append(tile);
    }
    for (let i = 0; i < n && !stop; i++) {
      try {
        const c = await renderPage(doc, i + 1, 220);
        kinds[i] = guessKind(i, n, c);
        c.className = 'wiz__img';
        tiles[i].querySelector('.wiz__thumb')!.replaceChildren(c);
      } catch (e) { console.error(e); kinds[i] = 'skip'; }
      paintTile(tiles[i], kinds[i]);
      setBar((i + 1) / n); refreshCounts();
      if (i === 0) go1.disabled = false;
    }
    if (!stop) status.textContent = `${n} עמודים מוכנים לבדיקה.`;
  })();

  go1.addEventListener('click', async () => {
    if (!doc) return;
    let cat: Category | undefined;
    if (catSel.value === '__new') {
      const name = newCat.value.trim();
      if (!name) { toast('כתבי שם לקטגוריה החדשה'); newCat.focus(); return; }
      cat = await addCategory(name, '📚');
    } else cat = (await store.categories()).find((c) => c.id === catSel.value);
    if (!cat) return;
    if (!kinds.includes('coloring')) { toast('סמני לפחות דף צביעה אחד'); return; }
    stop = true;
    go1.disabled = true;
    grid.classList.add('wiz__grid--busy');
    try {
      const book = await importPdfBook(doc, { title: title.value.trim() || 'חוברת חדשה', category: cat, direction: dir.value as 'rtl' | 'ltr', kinds },
        (m, f) => { status.textContent = m; setBar(f); }, abort.signal);
      toast(`"${book.title}" נוספה למדף ✨`);
      const c = cat;
      leave(() => go((r) => shelfScreen(r, c), 'forward'));
    } catch (e) {
      console.error(e);
      status.textContent = e instanceof Error ? e.message : 'הייבוא נכשל';
      go1.disabled = false;
    }
  });

  return () => { stop = true; };
}

function paintTile(tile: HTMLElement, k: PdfKind) {
  tile.dataset.kind = k;
  tile.querySelector('.wiz__kind')!.textContent = KIND_HE[k];
}
