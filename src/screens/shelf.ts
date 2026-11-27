/** Bookshelf: books stand on wooden shelves. Tap opens, long press edits. */
import { go } from '../app/app';
import { store } from '../app/store';
import type { BookMeta, Category } from '../app/types';
import { importFiles } from '../app/importer';
import { h, onLongPress, sheet, toast } from '../ui/dom';
import { coverFace, coverUrl, spineFace } from '../ui/cover';
import { categoriesScreen } from './categories';
import { openBookAnimation } from './book3d';
import { readerScreen } from './reader';

const SWATCHES = ['#6b3fa0', '#1f5f8b', '#2f7d5b', '#a33b3b', '#c27b2a', '#d4577f', '#2c2c54', '#8b5a2b', '#3d6e70', '#b8860b'];

export function shelfScreen(el: HTMLElement, cat: Category) {
  const shelves = h('div', { class: 'shelves' });
  const fileInput = h('input', { type: 'file', id: 'import-file', accept: '.colorbook,.zip,image/*,.json', multiple: true, hidden: true });
  const importBtn = h('button', { class: 'btn btn--gold', type: 'button' }, '📥 ייבוא חוברת');
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files ?? [])];
    fileInput.value = '';
    if (!files.length) return;
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
    h('header', { class: 'top' },
      h('button', { class: 'icon-btn', 'aria-label': 'חזרה לקטגוריות', onclick: () => go(categoriesScreen, 'back') }, '→'),
      h('h1', { class: 'top__title', dir: 'auto' }, `${cat.icon} ${cat.name}`),
      h('div', { class: 'top__end' }, importBtn)),
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
    const book = h('button', { class: 'shelf-book', type: 'button', 'aria-label': `פתיחת ${b.title}` },
      h('div', { class: 'shelf-book__body' }, spineFace(b), coverFace(b, url), h('div', { class: 'shelf-book__pages' })),
      h('div', { class: 'shelf-book__label', dir: 'auto' }, b.title));
    book.addEventListener('click', async () => {
      const rect = book.querySelector('.shelf-book__body')!.getBoundingClientRect();
      book.classList.add('is-pulled');
      await openBookAnimation(b, url, rect);
      go((r) => readerScreen(r, b, cat), 'none');
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
    const catSel = h('select', { class: 'field', id: 'book-cat' });
    void store.categories().then((cats) => {
      for (const c of cats) catSel.append(h('option', { value: c.id, selected: c.id === b.categoryId }, `${c.icon} ${c.name}`));
    });
    const save = h('button', { class: 'btn btn--gold', type: 'button' }, 'שמירה');
    const share = h('button', { class: 'btn btn--ghost', type: 'button', disabled: true, title: 'יגיע בשלב השיתוף' }, 'שיתוף (בקרוב)');
    const del = h('button', { class: 'btn btn--danger', type: 'button' }, 'מחיקה');
    const body = h('div', { class: 'form' },
      h('label', { for: 'book-name' }, 'שם החוברת'), name,
      h('label', {}, 'צבע כריכה'), sw,
      h('label', { for: 'book-cat' }, 'קטגוריה'), catSel,
      h('div', { class: 'form__actions' }, save, share, del));
    const close = sheet('עריכת חוברת', body);
    save.addEventListener('click', async () => {
      await store.putBook({ ...b, title: name.value.trim() || b.title, coverColor: color, categoryId: catSel.value || b.categoryId });
      close(); await refresh();
    });
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
