/**
 * A small floating window with a picture to look at while colouring (the
 * solution). Drag it by its top bar, resize it from the corner, zoom with
 * the buttons, the wheel or two fingers, and move the picture by dragging.
 */
import { h } from './dom';

let open: (() => void) | null = null;

export function openReference(src: string, title: string, onClose?: () => void): () => void {
  open?.();
  const img = h('img', { class: 'refwin__img', src, alt: title, draggable: false }) as HTMLImageElement;
  const view = h('div', { class: 'refwin__view' }, img);
  const zoomOut = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'הקטנה' }, '−');
  const zoomIn = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'הגדלה' }, '+');
  const fitBtn = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'להתאים לחלון' }, '⤢');
  const closeBtn = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'סגירה' }, '✕');
  const bar = h('div', { class: 'refwin__bar' }, h('span', { class: 'refwin__title' }, title), zoomOut, zoomIn, fitBtn, closeBtn);
  const win = h('div', { class: 'refwin', role: 'dialog', 'aria-label': title }, bar, view);
  document.body.append(win);

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
  view.addEventListener('pointerdown', (e) => { view.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
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

  const close = () => { ro.disconnect(); win.remove(); open = null; onClose?.(); };
  closeBtn.addEventListener('click', close);
  open = close;
  return close;
}

export function closeReference(): void { open?.(); }
