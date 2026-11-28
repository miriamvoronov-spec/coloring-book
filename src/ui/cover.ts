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

/** Small deterministic random generator, so every cover draws the same stars. */
function rng(seed: number) {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

const sparkle4 = (x: number, y: number, r: number, fill: string, op = 1) =>
  `<path fill="${fill}" opacity="${op.toFixed(2)}" d="M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z"/>`;

/** An original fairy-tale castle: keep, spired towers, lit windows. */
function castle(g: { wall: string; roof: string; gold: string; glow: string }): string {
  const tower = (x: number, w: number, top: number, roofH: number, bottom = 384) => {
    const cx = x + w / 2;
    return `<rect x="${x}" y="${top}" width="${w}" height="${bottom - top}" fill="url(#${g.wall})"/>
      <path d="M${x - 4} ${top + 2} L${cx} ${top - roofH} L${x + w + 4} ${top + 2}Z" fill="url(#${g.roof})"/>
      <path d="M${x - 4} ${top + 2} H${x + w + 4}" stroke="url(#${g.gold})" stroke-width="2"/>
      <path d="M${cx} ${top - roofH} v-12" stroke="url(#${g.gold})" stroke-width="1.2"/>
      <path d="M${cx} ${top - roofH - 12} l9 3 -9 3z" fill="#f28fb0"/>
      <circle cx="${cx}" cy="${top - roofH}" r="1.8" fill="url(#${g.gold})"/>
      <path d="M${cx - 3.5} ${top + 22} v-6 a3.5 3.5 0 0 1 7 0 v6z" fill="#ffd77a" filter="url(#${g.glow})"/>`;
  };
  const crenel = (x0: number, x1: number, y: number) => {
    let out = '';
    for (let x = x0; x < x1 - 4; x += 9) out += `<rect x="${x}" y="${y - 6}" width="5" height="7" fill="url(#${g.wall})"/>`;
    return out;
  };
  return `
  <g>
    ${crenel(56, 244, 336)}
    <rect x="56" y="336" width="188" height="48" fill="url(#${g.wall})"/>
    ${tower(60, 20, 300, 40)}${tower(220, 20, 300, 40)}
    ${tower(84, 24, 262, 58)}${tower(192, 24, 262, 58)}
    ${crenel(108, 192, 292)}
    <rect x="108" y="292" width="84" height="92" fill="url(#${g.wall})"/>
    ${tower(131, 38, 214, 84)}
    ${tower(116, 14, 246, 34, 292)}${tower(170, 14, 246, 34, 292)}
    <path d="M136 384 v-26 a14 14 0 0 1 28 0 v26z" fill="#3a2f73"/>
    <path d="M140 384 v-24 a10 10 0 0 1 20 0 v24z" fill="#ffcf6b" opacity=".85" filter="url(#${g.glow})"/>
    <path d="M150 352 v32" stroke="#c98a2c" stroke-width="1.2"/>
    ${[118, 176].map((x) => `<path d="M${x} 330 v-8 a5 5 0 0 1 10 0 v8z" fill="#ffd77a" filter="url(#${g.glow})"/>`).join('')}
    ${[146].map((x) => `<circle cx="${x + 4}" cy="250" r="7" fill="#ffd77a" filter="url(#${g.glow})"/><circle cx="${x + 4}" cy="250" r="7" fill="none" stroke="url(#${g.gold})" stroke-width="1.5"/>`).join('')}
  </g>`;
}

/** Storybook cover art: twilight sky, stars, a trail of fairy dust over a castle, a thin gold frame. */
function ornament(kind: 'front' | 'back', base: string): string {
  const n = ++uidN;
  const id = (k: string) => `${k}${n}`;
  const R = rng(kind === 'front' ? 7 : 11);
  const top = shade(base, -0.22), mid = shade(base, 0.05);
  let stars = '';
  for (let i = 0; i < 70; i++) {
    const x = 18 + R() * 264, y = 18 + R() * (kind === 'front' ? 250 : 380);
    const r = R() < 0.12 ? 2.6 + R() * 2.2 : 0.5 + R() * 1.1;
    stars += r > 2 ? sparkle4(x, y, r * 1.6, '#fff6d6', 0.9) : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#fff6e0" opacity="${(0.35 + R() * 0.6).toFixed(2)}"/>`;
  }
  // fairy dust: dots along a sweeping curve, growing toward a bright star at its tip
  let dust = '';
  const P = kind === 'front'
    ? [[34, 352], [70, 210], [210, 300], [262, 128]]
    : [[60, 330], [90, 230], [220, 300], [240, 170]];
  const bez = (t: number, i: 0 | 1) => (1 - t) ** 3 * P[0][i] + 3 * (1 - t) ** 2 * t * P[1][i] + 3 * (1 - t) * t * t * P[2][i] + t ** 3 * P[3][i];
  for (let i = 0; i < 140; i++) {
    const t = i / 140;
    const j = (1 - t) * 10;
    const x = bez(t, 0) + (R() - 0.5) * j, y = bez(t, 1) + (R() - 0.5) * j;
    const r = 0.4 + t * 1.6 * R() + 0.3;
    dust += R() < 0.1 ? sparkle4(x, y, r * 2.4, '#ffe9a8', 0.9) : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${R() < 0.5 ? '#fff3c4' : '#ffd1e6'}" opacity="${(0.4 + t * 0.6).toFixed(2)}"/>`;
  }
  const tip = P[3];
  dust += sparkle4(tip[0], tip[1], 13, '#fffbe8') + sparkle4(tip[0], tip[1], 6, '#ffffff');
  const g = { wall: id('w'), roof: id('r'), gold: id('g'), glow: id('gl') };
  return `
<svg class="cover__art" viewBox="0 0 300 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="${id('sky')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}"/><stop offset=".45" stop-color="${mid}"/>
      <stop offset=".78" stop-color="#b98bd0"/><stop offset=".92" stop-color="#f4b6cf"/><stop offset="1" stop-color="#ffd9c2"/>
    </linearGradient>
    <radialGradient id="${id('halo')}" cx=".5" cy=".75" r=".55"><stop offset="0" stop-color="#ffe7f3" stop-opacity=".55"/><stop offset="1" stop-color="#ffe7f3" stop-opacity="0"/></radialGradient>
    <linearGradient id="${g.wall}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaff"/><stop offset=".6" stop-color="#e6dcf6"/><stop offset="1" stop-color="#c2b2e2"/></linearGradient>
    <linearGradient id="${g.roof}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7f95f0"/><stop offset=".5" stop-color="#4b63d1"/><stop offset="1" stop-color="#2c3d93"/></linearGradient>
    <linearGradient id="${g.gold}" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#fff4c8"/><stop offset=".35" stop-color="#f2c862"/><stop offset=".6" stop-color="#b9822a"/><stop offset="1" stop-color="#f6d77c"/></linearGradient>
    <filter id="${g.glow}" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="${id('dg')}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="300" height="420" fill="url(#${id('sky')})"/>
  <rect width="300" height="420" fill="url(#${id('halo')})"/>
  <g>${stars}</g>
  <g transform="translate(${kind === 'front' ? 58 : 150} ${kind === 'front' ? 92 : 120})">
    <circle r="30" fill="#fff6dc" opacity=".14"/><circle r="20" fill="#fff6dc" opacity=".18"/>
    <path d="M6 -16 a17 17 0 1 0 0 32 a13 13 0 1 1 0 -32z" fill="#fff3cf"/>
  </g>
  ${kind === 'front' ? castle(g) : ''}
  <g filter="url(#${id('dg')})">${dust}</g>
  <g fill="#ffffff">
    <ellipse cx="40" cy="398" rx="80" ry="22" opacity=".55"/><ellipse cx="150" cy="406" rx="110" ry="20" opacity=".6"/>
    <ellipse cx="262" cy="396" rx="80" ry="22" opacity=".55"/><ellipse cx="150" cy="420" rx="200" ry="20" opacity=".8"/>
  </g>
  <g fill="none" stroke="url(#${g.gold})" stroke-linecap="round">
    <rect x="10" y="10" width="280" height="400" rx="8" stroke-width="2.2"/>
    <rect x="16" y="16" width="268" height="388" rx="5" stroke-width=".8" opacity=".8"/>
    ${[[16, 16, 1, 1], [284, 16, -1, 1], [16, 404, 1, -1], [284, 404, -1, -1]].map(([x, y, sx, sy]) =>
      `<path stroke-width="1.4" d="M${x} ${y + sy * 30} q0 ${-sy * 30} ${sx * 30} ${-sy * 30}"/><circle cx="${x + sx * 9}" cy="${y + sy * 9}" r="2.4" fill="url(#${g.gold})" stroke="none"/>`).join('')}
  </g>
</svg>`;
}

/** The main colour of a cover picture (its outer band), so the binding around the pages matches it. */
export async function coverTone(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = 48; c.height = 64;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, 48, 64);
    const d = x.getImageData(0, 0, 48, 64).data;
    // the most common colour of the outer band, in coarse bins
    const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (let y = 0; y < 64; y++) for (let xx = 0; xx < 48; xx++) {
      if (xx > 5 && xx < 42 && y > 6 && y < 57) continue;
      const i = (y * 48 + xx) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      const e = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += b; bins.set(k, e);
    }
    const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
    if (!top) return null;
    const hex = '#' + [top.r, top.g, top.b].map((v) => Math.round(v / top.n).toString(16).padStart(2, '0')).join('');
    // a leather binding is a little deeper than the printed cover
    return shade(hex, -0.18);
  } catch { return null; }
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
    face.insertAdjacentHTML('beforeend', ornament('front', book.coverColor));
    face.append(
      h('div', { class: 'cover__title', dir: 'auto' }, book.title),
      h('div', { class: 'cover__by', dir: 'ltr' }, "Miriam's Coloring Books"));
  } else {
    face.insertAdjacentHTML('beforeend', ornament('back', book.coverColor));
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
