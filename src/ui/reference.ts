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
  const view = h('div', { class: 'refwin__view' }, img);
  const zoomOut = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'הקטנה' }, '−');
  const zoomIn = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'הגדלה' }, '+');
  const fitBtn = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'להתאים לחלון' }, '⤢');
  const closeBtn = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'סגירה' }, '✕');
  // any picture of her own as the reference
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true }) as HTMLInputElement;
  const fileBtn = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'תמונה משלי לרפרנס', title: 'תמונה משלי' }, '🖼');
  fileBtn.addEventListener('click', () => file.click());
  const titleEl = h('span', { class: 'refwin__title' }, title);
  file.addEventListener('change', () => {
    const f = file.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { img.src = String(r.result); titleEl.textContent = f.name; s = 1; tx = 0; ty = 0; apply(); onImage?.(img.src); };
    r.readAsDataURL(f);
  });
  const bar = h('div', { class: 'refwin__bar' }, titleEl, zoomOut, zoomIn, fitBtn, fileBtn, closeBtn, file);
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

  const close = () => { ro.disconnect(); win.remove(); open = null; current = null; picking = null; onClose?.(); };
  closeBtn.addEventListener('click', close);
  open = close;
  return close;
}

export function closeReference(): void { open?.(); }
