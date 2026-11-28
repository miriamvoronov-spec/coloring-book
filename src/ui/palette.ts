/**
 * The page's colour squares as a floating panel, opened only on request:
 * each row is the label as printed in the square, a large swatch of its
 * colour, and the colour's code. Tapping a row picks that colour.
 */
import { h } from './dom';
import type { LegendEntry } from '../app/types';

let current: { close: () => void } | null = null;

export interface PaletteHooks { onEdit: (label: string, hex: string) => void; onSample: (label: string) => void }

export function openPalette(entries: LegendEntry[], color: string, onPick: (hex: string) => void, onClose?: () => void, hooks?: PaletteHooks): { close: () => void; mark: (hex: string) => void } {
  current?.close();
  const list = h('div', { class: 'palwin__list', role: 'listbox', 'aria-label': 'צבעי הדף' });
  const rows = entries.map((e) => {
    const hex = e.color.toUpperCase();
    const sw = h('span', { class: 'palwin__sw' }); sw.style.background = e.color;
    const row = h('div', { class: 'palwin__row', role: 'option', tabindex: 0, 'data-c': e.color.toLowerCase(), 'aria-label': `${e.label}: ${hex}` },
      h('span', { class: 'palwin__label' }, e.label), sw, h('span', { class: 'palwin__hex', dir: 'ltr' }, hex));
    if (hooks) {
      const edit = h('button', { class: 'palwin__act', type: 'button', 'aria-label': `לשנות את הצבע של ${e.label}`, title: 'שינוי הצבע' }, '✏️');
      edit.addEventListener('click', (ev) => { ev.stopPropagation(); hooks.onEdit(e.label, e.color); });
      const drop = h('button', { class: 'palwin__act', type: 'button', 'aria-label': `לדגום צבע ל-${e.label}`, title: 'דגימה מהדף, מהרפרנס או מהפתרון' }, '💧');
      drop.addEventListener('click', (ev) => { ev.stopPropagation(); hooks.onSample(e.label); });
      row.append(edit, drop);
    }
    row.addEventListener('click', () => { onPick(e.color); mark(e.color); });
    row.addEventListener('keydown', (ev) => { if ((ev as KeyboardEvent).key === 'Enter') { onPick(e.color); mark(e.color); } });
    list.append(row);
    return row;
  });
  const closeBtn = h('button', { class: 'icon-btn refwin__btn', type: 'button', 'aria-label': 'סגירה' }, '✕');
  const bar = h('div', { class: 'refwin__bar' }, h('span', { class: 'refwin__title' }, '🎨 צבעי הדף'), closeBtn);
  const win = h('div', { class: 'refwin palwin', role: 'dialog', 'aria-label': 'צבעי הדף' }, bar, list);
  document.body.append(win);

  let pos = { x: innerWidth - Math.min(300, innerWidth - 16) - 90, y: 90 };
  try { pos = { ...pos, ...JSON.parse(localStorage.getItem('mcb.palwin') || '{}') }; } catch { /* first time */ }
  const place = () => {
    const r = win.getBoundingClientRect();
    pos.x = Math.max(8, Math.min(pos.x, innerWidth - r.width - 8)); pos.y = Math.max(8, Math.min(pos.y, innerHeight - r.height - 8));
    win.style.left = pos.x + 'px'; win.style.top = pos.y + 'px';
  };
  place();
  bar.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    bar.setPointerCapture(e.pointerId);
    const sx = e.clientX - pos.x, sy = e.clientY - pos.y;
    const mv = (ev: PointerEvent) => { pos.x = ev.clientX - sx; pos.y = ev.clientY - sy; place(); };
    bar.addEventListener('pointermove', mv);
    bar.addEventListener('pointerup', () => { bar.removeEventListener('pointermove', mv); try { localStorage.setItem('mcb.palwin', JSON.stringify(pos)); } catch { /* fine */ } }, { once: true });
  });

  const mark = (hex: string) => rows.forEach((r) => r.classList.toggle('is-on', r.dataset.c === hex.toLowerCase()));
  mark(color);
  const close = () => { win.remove(); current = null; onClose?.(); };
  closeBtn.addEventListener('click', close);
  current = { close };
  return { close, mark };
}

export function closePalette(): void { current?.close(); }
