/** Share a blank book (print PDF or .colorbook zip) or a single page. */
import { zipSync, strToU8 } from 'fflate';
import { store } from './store';
import type { BookMeta, PageRec } from './types';
import { drawNumbers } from '../coloring/engine';
import { saveFile } from './runtime';
import { h, sheet, toast } from '../ui/dom';

async function img(blob: Blob): Promise<HTMLImageElement> {
  const u = URL.createObjectURL(blob);
  const i = new Image(); i.src = u; await i.decode(); URL.revokeObjectURL(u); return i;
}

/** A page as printed: lines, numbers and the colour legend underneath. */
export async function blankPageCanvas(p: PageRec, maxSide = 3508): Promise<HTMLCanvasElement> {
  const k = Math.min(1, maxSide / Math.max(p.width, p.height)) || 1;
  const w = Math.round(p.width * k), hh = Math.round(p.height * k);
  const legendH = p.legend.length && !p.numbersInImage ? Math.round(w * 0.09) : 0;
  const c = document.createElement('canvas');
  c.width = w; c.height = hh + legendH;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(await img(p.image), 0, 0, w, hh);
  if (!p.numbersInImage) drawNumbers(x, p.labels, k);
  if (legendH) {
    const n = p.legend.length, cell = Math.min(legendH * 0.8, (w * 0.9) / n);
    const x0 = (w - cell * n) / 2;
    p.legend.forEach((e, i) => {
      const cx = x0 + i * cell + cell / 2, cy = hh + legendH / 2;
      x.fillStyle = e.color; x.beginPath(); x.arc(cx, cy, cell * 0.36, 0, Math.PI * 2); x.fill();
      x.lineWidth = Math.max(1, cell * 0.03); x.strokeStyle = '#333'; x.stroke();
      x.font = `700 ${cell * 0.34}px Fredoka, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = cell * 0.08; x.strokeStyle = '#fff'; x.strokeText(e.label, cx, cy); x.fillStyle = '#111'; x.fillText(e.label, cx, cy);
    });
  }
  return c;
}

const toBlob = (c: HTMLCanvasElement, type = 'image/png', q?: number) => new Promise<Blob>((r) => c.toBlob((b) => r(b!), type, q));
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'coloring-book';

interface JsPdf { addPage(): void; addImage(d: string, t: string, x: number, y: number, w: number, h: number): void; output(t: 'blob'): Blob }
let jsPdfLoad: Promise<new (o: object) => JsPdf> | null = null;
function loadJsPdf() {
  jsPdfLoad ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => res((window as unknown as { jspdf: { jsPDF: new (o: object) => JsPdf } }).jspdf.jsPDF);
    s.onerror = () => { jsPdfLoad = null; rej(new Error('אין חיבור לאינטרנט כדי ליצור PDF')); };
    document.head.append(s);
  });
  return jsPdfLoad;
}

/** Print-quality PDF (A4, about 300 dpi) of the chosen blank pages. */
export async function blankBookPdf(pages: PageRec[], progress: (m: string) => void): Promise<Blob> {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  for (let i = 0; i < pages.length; i++) {
    progress(`מכינה עמוד ${i + 1} מתוך ${pages.length}…`);
    const c = await blankPageCanvas(pages[i]);
    const ar = c.width / c.height, W = 200, H = 287;
    let w = W, hh = W / ar;
    if (hh > H) { hh = H; w = H * ar; }
    if (i) doc.addPage();
    doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', (210 - w) / 2, (297 - hh) / 2, w, hh);
    c.width = 0;
  }
  return doc.output('blob');
}

/** The book as a .colorbook (zip) that opens in the app, without anyone's colouring. */
export async function bookZip(book: BookMeta, pages: PageRec[]): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const manifest = { format: 'colorbook', version: 1, title: book.title, direction: book.direction, coverColor: book.coverColor, pages: [] as object[] };
  for (const [i, p] of pages.entries()) {
    const ext = p.image.type === 'image/jpeg' ? 'jpg' : 'png';
    const name = `pages/${String(i + 1).padStart(3, '0')}.${ext}`;
    files[name] = new Uint8Array(await p.image.arrayBuffer());
    const entry: Record<string, unknown> = p.kind === 'coloring'
      ? { kind: 'coloring', lines: name, size: { width: p.width, height: p.height }, labels: p.labels, legend: p.legend, numbersInImage: p.numbersInImage, title: p.title }
      : { kind: p.kind, image: name };
    if (p.solution) { const sn = `solutions/${String(i + 1).padStart(3, '0')}.jpg`; files[sn] = new Uint8Array(await p.solution.arrayBuffer()); entry.solution = sn; }
    manifest.pages.push(entry);
  }
  files['book.json'] = strToU8(JSON.stringify(manifest, null, 1));
  return new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' });
}

/** Share sheet for a whole book: choose pages, then PDF or .colorbook. */
export async function shareBook(book: BookMeta): Promise<void> {
  const pages = (await Promise.all(book.pageIds.map((id) => store.page(id)))).filter((p): p is PageRec => !!p);
  const coloring = pages.filter((p) => p.kind === 'coloring');
  const list = h('div', { class: 'pick-pages' });
  const boxes = coloring.map((p, i) => {
    const id = 'sp-' + i;
    const cb = h('input', { type: 'checkbox', id, checked: true });
    list.append(h('label', { class: 'pick-pages__item', for: id }, cb, h('span', {}, p.title || `עמוד ${i + 1}`)));
    return cb;
  });
  const all = h('button', { class: 'btn btn--small', type: 'button' }, 'סימון הכול / ניקוי');
  all.addEventListener('click', () => { const on = !boxes.every((b) => b.checked); boxes.forEach((b) => { b.checked = on; }); });
  const status = h('p', { class: 'muted', role: 'status' });
  const pdf = h('button', { class: 'btn btn--gold', type: 'button' }, 'PDF להדפסה');
  const zip = h('button', { class: 'btn', type: 'button' }, 'קובץ חוברת לאפליקציה');
  const chosen = () => coloring.filter((_, i) => boxes[i].checked);
  const run = async (btn: HTMLButtonElement, fn: () => Promise<[string, Blob]>) => {
    if (!chosen().length) { toast('בחרי לפחות עמוד אחד'); return; }
    btn.disabled = true;
    try { const [name, blob] = await fn(); status.textContent = await saveFile(name, blob); }
    catch (e) { status.textContent = e instanceof Error ? e.message : 'משהו השתבש'; }
    finally { btn.disabled = false; }
  };
  pdf.addEventListener('click', () => void run(pdf, async () => [`${safe(book.title)}.pdf`, await blankBookPdf(chosen(), (m) => { status.textContent = m; })]));
  zip.addEventListener('click', () => void run(zip, async () => {
    status.textContent = 'אורזת…';
    const keep = new Set(chosen());
    return [`${safe(book.title)}.zip`, await bookZip(book, pages.filter((p) => p.kind !== 'coloring' || keep.has(p)))];
  }));
  sheet('שיתוף חוברת ריקה', h('div', { class: 'form' },
    h('p', { class: 'muted' }, 'רק הקווים, המספרים והמקרא, בלי הצביעה. אחרי השמירה אפשר לשלוח בוואטסאפ, במייל או ב-Drive.'),
    h('label', {}, 'אילו דפים'), all, list,
    h('div', { class: 'form__actions' }, pdf, zip), status));
}

/** Save one page, coloured (as it looks now) or blank. */
export async function sharePage(page: PageRec, coloured: () => HTMLCanvasElement): Promise<void> {
  const status = h('p', { class: 'muted', role: 'status' });
  const a = h('button', { class: 'btn btn--gold', type: 'button' }, 'הדף הצבוע שלי');
  const b = h('button', { class: 'btn', type: 'button' }, 'הדף ריק להדפסה');
  const name = safe(page.title || 'page');
  a.addEventListener('click', async () => { a.disabled = true; status.textContent = await saveFile(`${name}.png`, await toBlob(coloured())); a.disabled = false; });
  b.addEventListener('click', async () => { b.disabled = true; status.textContent = await saveFile(`${name}-blank.png`, await toBlob(await blankPageCanvas(page))); b.disabled = false; });
  const g = h('button', { class: 'btn', type: 'button' }, '🖼️ לגלריה של החברות');
  g.addEventListener('click', async () => {
    const cloud = await import('./cloud');
    if (!cloud.cloudConfig() || !(await cloud.session())) { status.textContent = 'כדי לשתף בגלריה צריך להיכנס לחשבון, ב"👭 חברות וקבוצות" במסך הספרייה.'; return; }
    const groups = await cloud.groups().catch(() => []);
    const pick = h('div', { class: 'form__actions' });
    const send = async (to: string | null, label: string) => {
      pick.querySelectorAll('button').forEach((x) => { (x as HTMLButtonElement).disabled = true; });
      status.textContent = 'שולחת…';
      try { await cloud.postArt(coloured(), page.title || '', to); status.textContent = ''; toast(`הציור בגלריה של ${label} 🖼️`); close(); }
      catch (e) { status.textContent = e instanceof Error && !/^[a-z]/i.test(e.message) ? e.message : cloud.hebrewError(e); pick.querySelectorAll('button').forEach((x) => { (x as HTMLButtonElement).disabled = false; }); }
    };
    pick.append(h('button', { class: 'btn btn--gold', type: 'button', onclick: () => void send(null, 'כל החברות') }, '👭 כל החברות שלי'),
      ...groups.map((gr) => h('button', { class: 'btn', type: 'button', onclick: () => void send(gr.id, gr.name) }, `${gr.icon} ${gr.name}`)));
    g.replaceWith(h('div', { class: 'form' }, h('p', { class: 'muted' }, 'למי להראות את הציור? רק הציור הצבוע שלך נשלח, בגודל מסך.'), pick));
  });
  const close = sheet('שיתוף הדף', h('div', { class: 'form' }, h('div', { class: 'form__actions' }, a, b), g, status));
}
