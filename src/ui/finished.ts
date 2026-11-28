/**
 * "סיימתי": the finished page laid out like a real painted sheet of paper.
 * The colour sweeps across the lines as if it were being painted right now.
 * The ✕ closes it and hands back to the open book.
 */
import { drawNumbers } from '../coloring/engine';
import type { PageRec } from '../app/types';
import { h } from './dom';
import { sparkle } from './sparkles';

async function bitmap(b: Blob): Promise<ImageBitmap> { return createImageBitmap(b); }

/** Paper + lines + numbers, the sheet before the colour arrives. */
async function sheetBase(pg: PageRec, maxSide: number): Promise<HTMLCanvasElement> {
  const k = Math.min(1, maxSide / Math.max(pg.width, pg.height));
  const c = document.createElement('canvas');
  c.width = Math.round(pg.width * k); c.height = Math.round(pg.height * k);
  const x = c.getContext('2d')!;
  x.fillStyle = '#fffdf6'; x.fillRect(0, 0, c.width, c.height);
  const lines = await bitmap(pg.image);
  x.globalCompositeOperation = 'multiply'; x.drawImage(lines, 0, 0, c.width, c.height); lines.close();
  x.globalCompositeOperation = 'source-over';
  if (!pg.numbersInImage) drawNumbers(x, pg.labels, k);
  return c;
}

export async function showFinished(pg: PageRec, paint: Blob | null, title: string, onClose: () => void): Promise<void> {
  const base = await sheetBase(pg, 2000);
  const urls: string[] = [];
  const baseUrl = await new Promise<string>((r) => base.toBlob((b) => { const u = URL.createObjectURL(b!); urls.push(u); r(u); }, 'image/png'));
  const paper = h('div', { class: 'fin__paper' });
  paper.style.aspectRatio = `${pg.width} / ${pg.height}`;
  paper.append(h('img', { class: 'fin__lines', src: baseUrl, alt: '' }));
  if (paint) { const u = URL.createObjectURL(paint); urls.push(u); paper.append(h('img', { class: 'fin__paint', src: u, alt: 'הציור שלך' })); }
  paper.append(h('div', { class: 'fin__brush', 'aria-hidden': 'true' }));
  const x = h('button', { class: 'fin__x', type: 'button', 'aria-label': 'סגירה וחזרה לחוברת' }, '✕');
  const wrap = h('div', { class: 'fin', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'הציור הגמור' },
    x,
    h('div', { class: 'fin__stage' }, paper),
    h('p', { class: 'fin__title' }, 'כל הכבוד! ✨'),
    h('p', { class: 'fin__sub', dir: 'auto' }, title));
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('is-in'));
  // a few sparkles follow the brush across the sheet
  const timers: number[] = [];
  for (let i = 0; i < 7; i++) {
    timers.push(window.setTimeout(() => {
      const r = paper.getBoundingClientRect();
      sparkle(r.left + r.width * (0.1 + 0.8 * (i / 6)), r.top + r.height * (0.25 + 0.5 * Math.random()), 12, 5);
    }, 700 + i * 330));
  }
  const close = () => {
    timers.forEach(clearTimeout);
    removeEventListener('keydown', onKey);
    wrap.classList.remove('is-in');
    setTimeout(() => { wrap.remove(); urls.forEach((u) => URL.revokeObjectURL(u)); }, 450);
    onClose();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);
  x.addEventListener('click', close);
  x.focus();
}
