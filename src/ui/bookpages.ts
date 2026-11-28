/**
 * "Pages and solutions" for one book: add pages one by one (photos or scans),
 * give each coloring page its own solution picture, change a page's kind,
 * move pages and remove them.
 */
import { store } from '../app/store';
import type { BookMeta, PageRec } from '../app/types';
import { h, sheet, toast } from './dom';

const KIND: Record<string, string> = { cover: 'כריכה', coloring: 'דף צביעה', back: 'כריכה אחורית' };

async function solutionBlob(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
  return new Promise((r, j) => c.toBlob((b) => b ? r(b) : j(new Error('image')), 'image/jpeg', 0.9));
}

function pick(multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept: 'image/*', multiple }) as HTMLInputElement;
    inp.addEventListener('change', () => resolve([...(inp.files ?? [])]));
    inp.click();
  });
}

export async function bookPagesSheet(book: BookMeta, onChange: () => void): Promise<void> {
  let b = (await store.book(book.id)) ?? book;
  const urls: string[] = [];
  const list = h('ol', { class: 'bp__list' });
  const status = h('p', { class: 'muted', role: 'status' });
  const save = async (ids: string[]) => { b = { ...b, pageIds: ids }; await store.putBook(b); onChange(); };

  const render = async () => {
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    list.replaceChildren();
    const pages = (await Promise.all(b.pageIds.map((id) => store.page(id)))).filter(Boolean) as PageRec[];
    pages.forEach((p, i) => {
      const u = URL.createObjectURL(p.image); urls.push(u);
      const thumbs = h('div', { class: 'bp__thumbs' }, h('img', { src: u, alt: '' }));
      if (p.solution) { const su = URL.createObjectURL(p.solution); urls.push(su); thumbs.append(h('img', { src: su, alt: 'פתרון', class: 'bp__sol' })); }
      const kindSel = h('select', { class: 'field bp__kind', 'aria-label': 'סוג הדף' },
        ...Object.entries(KIND).map(([k, t]) => h('option', { value: k, selected: p.kind === k }, t)));
      kindSel.addEventListener('change', async () => { await store.putPage({ ...p, kind: kindSel.value as PageRec['kind'] }); onChange(); void render(); });
      const btn = (label: string, aria: string, fn: () => void | Promise<void>, disabled = false) => h('button', { class: 'btn btn--small', type: 'button', 'aria-label': aria, disabled, onclick: () => void fn() }, label);
      const move = (d: number) => async () => { const ids = [...b.pageIds]; const j = i + d; [ids[i], ids[j]] = [ids[j], ids[i]]; await save(ids); void render(); };
      const delBtn = btn('🗑', 'מחיקת הדף', async () => {
        if (!delBtn.dataset.armed) { delBtn.dataset.armed = '1'; delBtn.textContent = 'בטוח?'; setTimeout(() => { delete delBtn.dataset.armed; delBtn.textContent = '🗑'; }, 2500); return; }
        await save(b.pageIds.filter((id) => id !== p.id)); await store.deletePage(p.id); toast('הדף נמחק'); void render();
      });
      const solBtns = p.kind === 'coloring' ? [
        btn(p.solution ? '🖼️ החלפת פתרון' : '➕ פתרון לדף', 'פתרון לדף', async () => {
          const [f] = await pick(false); if (!f) return;
          status.textContent = 'שומרת את הפתרון…';
          await store.putPage({ ...p, solution: await solutionBlob(f) }); status.textContent = ''; toast('הפתרון נשמר לדף ✨'); onChange(); void render();
        }),
        ...(p.solution ? [btn('הסרת פתרון', 'הסרת הפתרון', async () => { const { solution: _s, ...rest } = p; await store.putPage(rest as PageRec); onChange(); void render(); })] : []),
      ] : [];
      list.append(h('li', { class: 'bp__item' },
        h('span', { class: 'bp__num' }, String(i + 1)), thumbs,
        h('div', { class: 'bp__ctl' }, kindSel,
          h('div', { class: 'bp__btns' }, btn('⬆', 'למעלה', move(-1), i === 0), btn('⬇', 'למטה', move(1), i === pages.length - 1), ...solBtns, delBtn))));
    });
    if (!pages.length) list.append(h('li', { class: 'muted' }, 'אין עדיין דפים. מוסיפים בכפתור למטה.'));
  };

  const addKind = h('select', { class: 'field', 'aria-label': 'סוג הדפים שמוסיפים' },
    h('option', { value: 'coloring' }, 'דפי צביעה'), h('option', { value: 'cover' }, 'כריכה'), h('option', { value: 'back' }, 'כריכה אחורית'));
  const add = h('button', { class: 'btn btn--gold', type: 'button' }, '➕ הוספת דפים מתמונות');
  add.addEventListener('click', async () => {
    const files = await pick(true); if (!files.length) return;
    add.disabled = true;
    const { pageFromPicture } = await import('../app/pdfimport');
    const kind = addKind.value as 'coloring' | 'cover' | 'back';
    const ids = [...b.pageIds];
    for (const [n, f] of files.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true })).entries()) {
      status.textContent = `מכינה דף ${n + 1} מתוך ${files.length}…`;
      try {
        const p = await pageFromPicture(b.id, f, kind);
        await store.putPage({ ...p, title: `עמוד ${ids.length + 1}` });
        if (kind === 'cover') ids.unshift(p.id); else if (kind === 'back') ids.push(p.id);
        else { const last = ids.length ? await store.page(ids[ids.length - 1]) : undefined; ids.splice(last?.kind === 'back' ? ids.length - 1 : ids.length, 0, p.id); }
      } catch (e) { console.error(e); toast(`לא הצלחתי לקרוא את ${f.name}`); }
    }
    await save(ids); status.textContent = ''; add.disabled = false; toast('הדפים נוספו ✨'); void render();
  });

  sheet(`📑 דפים ופתרונות: ${b.title}`, h('div', { class: 'bp' },
    h('p', { class: 'muted' }, 'כאן מוסיפים דפים אחד אחד, מצרפים לכל דף צביעה את הפתרון שלו, משנים סוג וסדר.'),
    list, h('div', { class: 'bp__add' }, addKind, add), status), () => setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 400));
  document.querySelector('.sheet:last-of-type')?.classList.add('sheet--wide');
  await render();
}
