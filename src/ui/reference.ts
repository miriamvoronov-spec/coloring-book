/**
 * A small floating window with a picture to look at while colouring (the
 * solution). Drag it by its top bar, resize it from the corner, zoom with
 * the buttons, the wheel or two fingers, and move the picture by dragging.
 */
import { h } from './dom';

let open: (() => void) | null = null;
/** While set, a tap on the picture samples its colour instead of moving it. */
let picking: ((hex: string) => void) | null = null;
let current: HTMLElement | null = null;
export function setRefPicking(cb: ((hex: string) => void) | null): void { picking = cb; current?.classList.toggle('is-picking', !!cb); }
export const refOpen = () => !!open;

export function openReference(src: string, title: string, onClose?: () => void, onImage?: (src: string) => void): () => void {
  open?.();
  const img = h('img', { class: 'refwin__img', src, alt: title, draggable: false }) as HTMLImageElement;
  if (!src) img.hidden = true;
  const view = h('div', { class: 'refwin__view' }, img);
  const zoomOut = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'הקטנה' }, '−');
  const zoomIn = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'הגדלה' }, '+');
  const fitBtn = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'להתאים לחלון' }, '⤢');
  const closeBtn = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'סגירה' }, '✕');
  // any picture of her own as the reference
  const file = h('input', { type: 'file', accept: 'image/*,application/pdf,.pdf', hidden: true }) as HTMLInputElement;
  const fileBtn = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'תמונה או PDF משלי לרפרנס', title: 'תמונה או PDF משלי' }, '🖼');
  fileBtn.addEventListener('click', () => file.click());
  const titleEl = h('span', { class: 'refwin__title' }, title);
  // a PDF: one page at a time, with arrows
  const prevP = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'העמוד הקודם', hidden: true }, '›');
  const nextP = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'העמוד הבא', hidden: true }, '‹');
  const empty = h('button', { class: 'refwin__empty', type: 'button', hidden: !!src }, '🖼 לבחור תמונה (PNG, JPG) או PDF');
  empty.addEventListener('click', () => file.click());
  let pdf: { doc: import('../app/pdfimport').PdfDoc; n: number; name: string } | null = null;
  const show = (url: string, name: string) => { img.src = url; img.hidden = false; empty.hidden = true; titleEl.textContent = name; s = 1; tx = 0; ty = 0; apply(); onImage?.(url); };
  const showPdfPage = async () => {
    if (!pdf) return;
    titleEl.textContent = `${pdf.name} · ${pdf.n}/${pdf.doc.numPages}`;
    const { renderPage } = await import('../app/pdfimport');
    const c = await renderPage(pdf.doc, pdf.n, 2000);
    show(c.toDataURL('image/png'), `${pdf.name} · ${pdf.n}/${pdf.doc.numPages}`);
    prevP.hidden = nextP.hidden = pdf.doc.numPages < 2;
  };
  prevP.addEventListener('click', () => { if (pdf && pdf.n > 1) { pdf.n--; void showPdfPage(); } });
  nextP.addEventListener('click', () => { if (pdf && pdf.n < pdf.doc.numPages) { pdf.n++; void showPdfPage(); } });
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; if (!f) return;
    file.value = '';
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
      titleEl.textContent = 'פותחת את ה-PDF…';
      try {
        const { openPdf } = await import('../app/pdfimport');
        void pdf?.doc.destroy();
        pdf = { doc: await openPdf(f), n: 1, name: f.name.replace(/\.pdf$/i, '') };
        await showPdfPage();
      } catch (e) { titleEl.textContent = e instanceof Error ? e.message : 'לא הצלחתי לפתוח את ה-PDF'; }
      return;
    }
    void pdf?.doc.destroy(); pdf = null; prevP.hidden = nextP.hidden = true;
    const r = new FileReader();
    r.onload = () => show(String(r.result), f.name);
    r.readAsDataURL(f);
  });
  const bar = h('div', { class: 'refwin__bar' }, titleEl, prevP, nextP, zoomOut, zoomIn, fitBtn, fileBtn, closeBtn, file);
  view.append(empty);
  const win = h('div', { class: 'refwin', role: 'dialog', 'aria-label': title }, bar, view);
  document.body.append(win);
  current = win;

  // where it sits: remembered between pages
  let pos = { x: 24, y: 90, w: Math.min(340, innerWidth * 0.42), h: Math.min(460, innerHeight * 0.6) };
  try { pos = { ...pos, ...JSON.parse(localStorage.getItem('mcb.refwin') || '{}') }; } catch { /* first time */ }
  const place = () => {
    pos.w = Math.max(180, Math.min(pos.w, innerWidth - 16)); pos.h = Math.max(200, Math.min(pos.h, innerHeight - 16));
    pos.x = Math.max(8, Math.min(pos.x, innerWidth - pos.w - 8)); pos.y = Math.max(8, Math.min(pos.y, innerHeight - pos.h - 8));
    Object.assign(win.style, { left: pos.x + 'px', top: pos.y + 'px', width: pos.w + 'px', height: pos.h + 'px' });
  };
  const remember = () => { try { localStorage.setItem('mcb.refwin', JSON.stringify(pos)); } catch { /* fine */ } };
  place();

  // zoom and pan of the picture
  let s = 1, tx = 0, ty = 0;
  const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`; };
  const zoomAt = (f: number, cx = view.clientWidth / 2, cy = view.clientHeight / 2) => {
    const ns = Math.max(1, Math.min(8, s * f));
    tx = cx - ((cx - tx) * ns) / s; ty = cy - ((cy - ty) * ns) / s; s = ns;
    if (s === 1) { tx = 0; ty = 0; }
    apply();
  };
  zoomIn.addEventListener('click', () => zoomAt(1.5));
  zoomOut.addEventListener('click', () => zoomAt(1 / 1.5));
  fitBtn.addEventListener('click', () => { s = 1; tx = 0; ty = 0; apply(); });
  view.addEventListener('wheel', (e) => { e.preventDefault(); const r = view.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  const pts = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  view.addEventListener('pointerdown', (e) => {
    if (picking) { const hex = sampleAt(e.clientX, e.clientY); if (hex) { const cb = picking; setRefPicking(null); cb(hex); } return; }
    view.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
  view.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 2) {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) { const r = view.getBoundingClientRect(); zoomAt(d / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); }
      pinch = d; return;
    }
    tx += e.clientX - p.x; ty += e.clientY - p.y; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); apply();
  });
  const up = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);

  /** The colour of the picture under a screen point. */
  function sampleAt(cx: number, cy: number): string | null {
    const r = img.getBoundingClientRect();
    const nw = img.naturalWidth, nh = img.naturalHeight; if (!nw || !r.width) return null;
    // object-fit: contain inside the transformed box
    const k = Math.min(r.width / nw, r.height / nh);
    const ox = r.left + (r.width - nw * k) / 2, oy = r.top + (r.height - nh * k) / 2;
    const px = (cx - ox) / k, py = (cy - oy) / k;
    if (px < 0 || py < 0 || px >= nw || py >= nh) return null;
    const c = document.createElement('canvas'); c.width = 5; c.height = 5;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    try { x.drawImage(img, px - 2, py - 2, 5, 5, 0, 0, 5, 5); } catch { return null; }
    const d = x.getImageData(0, 0, 5, 5).data;
    let rr = 0, gg = 0, bb = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
    if (!n) return null;
    return '#' + [rr / n, gg / n, bb / n].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }

  // move the window by its bar
  bar.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    bar.setPointerCapture(e.pointerId);
    const sx = e.clientX - pos.x, sy = e.clientY - pos.y;
    const mv = (ev: PointerEvent) => { pos.x = ev.clientX - sx; pos.y = ev.clientY - sy; place(); };
    const end = () => { bar.removeEventListener('pointermove', mv); remember(); };
    bar.addEventListener('pointermove', mv);
    bar.addEventListener('pointerup', end, { once: true });
  });
  // resize from the corner (native), and remember it
  const ro = new ResizeObserver(() => { const r = win.getBoundingClientRect(); pos.w = r.width; pos.h = r.height; remember(); });
  ro.observe(win);

  const close = () => { void pdf?.doc.destroy(); ro.disconnect(); win.remove(); open = null; current = null; picking = null; onClose?.(); };
  closeBtn.addEventListener('click', close);
  open = close;
  return close;
}

export function closeReference(): void { open?.(); }
