/** Book cover faces: a picture (imported books) or cover colour with an embossed title. */
import type { BookMeta } from '../app/types';
import { store } from '../app/store';
import { h } from './dom';

const urlCache = new Map<string, string>();

/** Object URL of the book's front or back cover picture, if it has one. */
export async function coverUrl(book: BookMeta, which: 'cover' | 'back' = 'cover'): Promise<string | null> {
  const key = book.id + which;
  if (urlCache.has(key)) return urlCache.get(key)!;
  const ids = which === 'cover' ? book.pageIds.slice(0, 1) : book.pageIds.slice(-1);
  for (const id of ids) {
    const p = await store.page(id);
    if (p && p.kind === which) {
      const u = URL.createObjectURL(p.image);
      urlCache.set(key, u);
      return u;
    }
  }
  return null;
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return '#' + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

let uidN = 0;

/** Gold-tooled ornament for a leather cover: double frame, corner scrolls, a medallion with moon and stars. */
function ornament(kind: 'front' | 'back'): string {
  const n = ++uidN;
  const g = `cg${n}`, e = `ce${n}`;
  const corner = `
    <path d="M24 92 C24 52 52 24 92 24" />
    <path d="M32 32 c14 0 24 10 24 24 c0 10 -7 16 -15 16 c-8 0 -12 -6 -12 -11 c0 -5 4 -8 8 -8 c4 0 6 3 6 5" />
    <path d="M56 30 c8 -6 18 -6 26 0" /><path d="M30 56 c-6 8 -6 18 0 26" />
    <path d="M62 40 q10 -2 14 6 q-10 2 -14 -6z" class="f" /><path d="M40 62 q-2 10 6 14 q2 -10 -6 -14z" class="f" />
    <circle cx="33" cy="33" r="3.2" class="f" />`;
  const sparks = [[78, 120, 5], [228, 104, 4], [64, 318, 3.5], [242, 300, 5], [150, 92, 3], [104, 244, 3], [204, 236, 3.5]]
    .map(([x, y, r]) => `<path class="f" d="M${x} ${y - r * 2} L${x + r * 0.4} ${y - r * 0.4} L${x + r * 2} ${y} L${x + r * 0.4} ${y + r * 0.4} L${x} ${y + r * 2} L${x - r * 0.4} ${y + r * 0.4} L${x - r * 2} ${y} L${x - r * 0.4} ${y - r * 0.4}Z"/>`).join('');
  const medal = kind === 'front' ? `
    <g transform="translate(150 156)">
      <circle r="50" /><circle r="44" stroke-dasharray="1.5 4" />
      <path class="f" d="M10 -30 a32 32 0 1 0 0 60 a25 25 0 1 1 0 -60z" />
      <path class="f" d="M20 -14 l3.4 7.6 7.6 3.4 -7.6 3.4 -3.4 7.6 -3.4 -7.6 -7.6 -3.4 7.6 -3.4z" />
      <path class="f" d="M27 14 l2 4.4 4.4 2 -4.4 2 -2 4.4 -2 -4.4 -4.4 -2 4.4 -2z" />
      <path d="M-50 0 h-30 M50 0 h30" /><circle cx="-84" r="3" class="f" /><circle cx="84" r="3" class="f" />
    </g>` : `
    <g transform="translate(150 210)">
      <circle r="34" /><circle r="28" stroke-dasharray="1.5 4" />
      <path class="f" d="M0 -20 l5 15 15 5 -15 5 -5 15 -5 -15 -15 -5 15 -5z" />
    </g>`;
  return (`
<svg class="cover__art" viewBox="0 0 300 420" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <linearGradient id="${g}" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0" stop-color="#fff4c8"/><stop offset=".28" stop-color="#f2c862"/><stop offset=".5" stop-color="#a8721f"/>
      <stop offset=".72" stop-color="#f6d77c"/><stop offset="1" stop-color="#8a5a14"/>
    </linearGradient>
    <filter id="${e}" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="1.3" stdDeviation=".5" flood-color="#000" flood-opacity=".6"/>
      <feDropShadow dx="0" dy="-.5" stdDeviation=".2" flood-color="#fff3c4" flood-opacity=".35"/>
    </filter>
  </defs>
  <g fill="none" stroke="url(#${g})" stroke-width="2.2" stroke-linecap="round" filter="url(#${e})">
    <rect x="12" y="12" width="276" height="396" rx="5" stroke-width="3.2"/>
    <rect x="19" y="19" width="262" height="382" rx="3" stroke-width="1.1"/>
    <g>${corner}</g>
    <g transform="matrix(-1 0 0 1 300 0)">${corner}</g>
    <g transform="matrix(1 0 0 -1 0 420)">${corner}</g>
    <g transform="matrix(-1 0 0 -1 300 420)">${corner}</g>
    <path d="M118 24 q16 12 32 0 q16 12 32 0" /><path class="f" d="M150 30 l6 6 -6 6 -6 -6z" />
    <path d="M118 396 q16 -12 32 0 q16 -12 32 0" /><path class="f" d="M150 378 l6 6 -6 6 -6 -6z" />
    ${medal}
    ${sparks}
  </g>
</svg>`).replace(/class="f"/g, `fill="url(#${g})"`);
}

export function coverFace(book: BookMeta, url: string | null, which: 'cover' | 'back' = 'cover'): HTMLElement {
  const face = h('div', { class: 'cover cover--' + which });
  face.style.setProperty('--cover', book.coverColor);
  face.style.setProperty('--cover-dark', shade(book.coverColor, -0.2));
  face.style.setProperty('--cover-light', shade(book.coverColor, 0.14));
  if (url) {
    face.classList.add('cover--image');
    face.append(h('img', { src: url, alt: '', draggable: 'false' }));
  } else if (which === 'cover') {
    face.insertAdjacentHTML('beforeend', ornament('front'));
    face.append(
      h('div', { class: 'cover__title', dir: 'auto' }, book.title),
      h('div', { class: 'cover__by', dir: 'ltr' }, 'Miriam Coloring Books'));
  } else {
    face.insertAdjacentHTML('beforeend', ornament('back'));
  }
  face.append(h('div', { class: 'cover__light', 'aria-hidden': 'true' }));
  return face;
}

export function spineFace(book: BookMeta): HTMLElement {
  const s = h('div', { class: 'spine' }, h('span', { dir: 'auto' }, book.title));
  s.style.setProperty('--cover', book.coverColor);
  s.style.setProperty('--cover-dark', shade(book.coverColor, -0.24));
  s.style.setProperty('--cover-light', shade(book.coverColor, 0.1));
  return s;
}
