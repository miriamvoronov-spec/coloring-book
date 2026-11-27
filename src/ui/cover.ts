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

export function coverFace(book: BookMeta, url: string | null, which: 'cover' | 'back' = 'cover'): HTMLElement {
  const face = h('div', { class: 'cover cover--' + which });
  face.style.setProperty('--cover', book.coverColor);
  face.style.setProperty('--cover-dark', shade(book.coverColor, -0.18));
  face.style.setProperty('--cover-light', shade(book.coverColor, 0.12));
  if (url) {
    face.classList.add('cover--image');
    face.append(h('img', { src: url, alt: '', draggable: 'false' }));
  } else if (which === 'cover') {
    face.append(
      h('div', { class: 'cover__frame' }),
      h('div', { class: 'cover__star', 'aria-hidden': 'true' }, '✦'),
      h('div', { class: 'cover__title', dir: 'auto' }, book.title),
      h('div', { class: 'cover__by', dir: 'ltr' }, 'Miriam Coloring Books'));
  } else {
    face.append(h('div', { class: 'cover__frame' }), h('div', { class: 'cover__star cover__star--back', 'aria-hidden': 'true' }, '✦'));
  }
  return face;
}

export function spineFace(book: BookMeta): HTMLElement {
  const s = h('div', { class: 'spine' }, h('span', { dir: 'auto' }, book.title));
  s.style.setProperty('--cover', book.coverColor);
  s.style.setProperty('--cover-dark', shade(book.coverColor, -0.22));
  return s;
}
