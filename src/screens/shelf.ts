/** Bookshelf: books stand on wooden shelves. Tap opens, long press edits. */
import { go } from '../app/app';
import { store } from '../app/store';
import type { BookMeta, Category } from '../app/types';
import { importFiles } from '../app/importer';
import { shareBook } from '../app/share';
import { appBar } from '../ui/appbar';
import { ideaPanel } from '../ui/ideas';
import { h, onLongPress, sheet, toast } from '../ui/dom';
import { coverFace, coverUrl, spineFace } from '../ui/cover';
import { categoriesScreen } from './categories';
import { openBookAnimation } from './book3d';
import { readerScreen } from './reader';

const SWATCHES = ['#1f2c5c', '#7a1f2b', '#1f5a45', '#4a2058', '#1d4f5a', '#5a3218', '#8c3a55', '#2f4a22', '#2e3440', '#8a5a14'];

export function shelfScreen(el: HTMLElement, cat: Category) {
  const shelves = h('div', { class: 'shelves' });
  const fileInput = h('input', { type: 'file', id: 'import-file', accept: '.pdf,application/pdf,.colorbook,.zip,image/*,.json', multiple: true, hidden: true });
  const importBtn = h('button', { class: 'btn btn--gold', type: 'button' }, '📥 הוספת חוברת');
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files ?? [])];
    fileInput.value = '';
    if (!files.length) return;
    const pdf = files.find((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (pdf) { const { pdfWizard } = await import('./pdfwizard'); pdfWizard(pdf, cat); return; }
    const status = h('div', { class: 'busy', role: 'status' }, h('div', { class: 'busy__spin' }), h('p', {}, 'מייבאת את החוברת…'));
    document.body.append(status);
    try {
      const book = await importFiles(files, cat, (msg) => { status.querySelector('p')!.textContent = msg; });
      toast(`"${book.title}" נוספה למדף`);
      await render();
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : 'הייבוא נכשל');
    } finally { status.remove(); }
  });

  el.append(h('main', { class: 'shelf-screen' },
    appBar({ title: `${cat.icon} ${cat.name}`, back: { label: 'חזרה לספרייה', to: () => go(categoriesScreen, 'back') }, end: [importBtn] }),
    cat.role === 'claude' ? h('details', { class: 'set-card idea-card', open: true },
      h('summary', { class: 'idea-card__sum' }, '✨ מה היית רוצה שאצור?'),
      ideaPanel({ inline: true, onDone: () => void render() })) : null,
    shelves, fileInput));

  const render = async () => {
    const books = (await store.books()).filter((b) => b.categoryId === cat.id);
    shelves.replaceChildren();
    const perShelf = innerWidth < 560 ? 2 : innerWidth < 900 ? 3 : innerWidth < 1300 ? 4 : 5;
    const rows = Math.max(2, Math.ceil(books.length / perShelf));
    for (let r = 0; r < rows; r++) {
      const shelf = h('div', { class: 'shelf' });
      const row = h('div', { class: 'shelf__books' });
      for (const b of books.slice(r * perShelf, (r + 1) * perShelf)) row.append(await bookOnShelf(b));
      if (!books.length && r === 0) {
        row.append(h('div', { class: 'shelf__empty' },
          h('p', {}, 'המדף עוד ריק.'),
          h('p', {}, 'ייבאי קובץ .colorbook מכלי העיבוד, או תמונות של דפים.')));
      }
      shelf.append(row, h('div', { class: 'shelf__board', 'aria-hidden': 'true' }));
      shelves.append(shelf);
    }
  };

  const bookOnShelf = async (b: BookMeta) => {
    const url = await coverUrl(b);
    const book = h('button', { class: 'shelf-book' + (b.direction === 'rtl' ? ' shelf-book--rtl' : ''), type: 'button', 'aria-label': `פתיחת ${b.title}` },
      h('div', { class: 'shelf-book__body' }, spineFace(b), coverFace(b, url), h('div', { class: 'shelf-book__pages' })),
      h('div', { class: 'shelf-book__label', dir: 'auto' }, b.title));
    book.addEventListener('click', async () => {
      const rect = book.querySelector('.shelf-book__body')!.getBoundingClientRect();
      book.classList.add('is-pulled');
      let shown = false;
      await openBookAnimation(b, url, rect, () => { shown = true; go((r) => readerScreen(r, b, cat), 'none'); });
      if (!shown) go((r) => readerScreen(r, b, cat), 'none');
    });
    onLongPress(book, () => editBook(b, render));
    return book;
  };

  const editBook = (b: BookMeta, refresh: () => Promise<void>) => {
    let color = b.coverColor;
    const name = h('input', { class: 'field', id: 'book-name', value: b.title, maxlength: 60 });
    const sw = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'צבע כריכה' });
    const custom = h('input', { type: 'color', id: 'book-color', value: color, 'aria-label': 'צבע אחר' });
    const mark = () => sw.querySelectorAll<HTMLElement>('.swatch').forEach((s) => s.classList.toggle('is-on', s.dataset.c === color));
    for (const c of SWATCHES) {
      const s = h('button', { class: 'swatch', type: 'button', 'data-c': c, 'aria-label': c });
      s.style.background = c;
      s.addEventListener('click', () => { color = c; custom.value = c; mark(); });
      sw.append(s);
    }
    custom.addEventListener('input', () => { color = custom.value; mark(); });
    sw.append(custom);
    mark();
    const dirSel = h('select', { class: 'field', id: 'book-dir' },
      h('option', { value: 'rtl', selected: b.direction === 'rtl' }, 'מימין לשמאל (עברית)'),
      h('option', { value: 'ltr', selected: b.direction === 'ltr' }, 'משמאל לימין (אנגלית)'));
    const catSel = h('select', { class: 'field', id: 'book-cat' });
    void store.categories().then((cats) => {
      for (const c of cats) catSel.append(h('option', { value: c.id, selected: c.id === b.categoryId }, `${c.icon} ${c.name}`));
    });
    const save = h('button', { class: 'btn btn--gold', type: 'button' }, 'שמירה');
    const share = h('button', { class: 'btn', type: 'button' }, 'שיתוף');
    const del = h('button', { class: 'btn btn--danger', type: 'button' }, 'מחיקה');
    const body = h('div', { class: 'form' },
      h('label', { for: 'book-name' }, 'שם החוברת'), name,
      h('label', {}, 'צבע כריכה'), sw,
      h('label', { for: 'book-dir' }, 'כיוון הדפדוף'), dirSel,
      h('label', { for: 'book-cat' }, 'קטגוריה'), catSel,
      h('div', { class: 'form__actions' }, save, share, del));
    const close = sheet('עריכת חוברת', body);
    save.addEventListener('click', async () => {
      await store.putBook({ ...b, title: name.value.trim() || b.title, coverColor: color, direction: dirSel.value === 'ltr' ? 'ltr' : 'rtl', categoryId: catSel.value || b.categoryId });
      close(); await refresh();
    });
    share.addEventListener('click', () => { close(); void shareBook(b); });
    let armed = false;
    del.addEventListener('click', async () => {
      if (!armed) { armed = true; del.textContent = 'ללחוץ שוב כדי למחוק לתמיד'; return; }
      await store.deleteBook(b); close(); toast('החוברת נמחקה'); await refresh();
    });
  };

  const onResize = () => { void render(); };
  let rt = 0;
  const debounced = () => { clearTimeout(rt); rt = window.setTimeout(onResize, 200); };
  addEventListener('resize', debounced);
  void render();
  return () => removeEventListener('resize', debounced);
}
