/** Screen flow: splash → categories → bookshelf → book. */
import { store, uid } from './store';
import { DEMO_COVER, makeDemoBook } from './demo';
import type { Category } from './types';

export type Cleanup = (() => void) | void;
export type Screen = (root: HTMLElement) => Cleanup;

let root: HTMLElement;
let current: { el: HTMLElement; cleanup: Cleanup } | null = null;

export function initApp(el: HTMLElement): void { root = el; }

/** Swap screens with an animated transition. */
export function go(screen: Screen, transition: 'fade' | 'forward' | 'back' | 'none' = 'fade'): void {
  const el = document.createElement('div');
  el.className = 'screen screen--enter-' + transition;
  root.append(el);
  const cleanup = screen(el);
  const prev = current;
  current = { el, cleanup };
  requestAnimationFrame(() => {
    el.classList.add('screen--in');
    if (prev) {
      prev.el.classList.add('screen--leave-' + transition);
      try { if (typeof prev.cleanup === 'function') prev.cleanup(); } catch (e) { console.error(e); }
      setTimeout(() => prev.el.remove(), transition === 'none' ? 0 : 520);
    }
  });
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-claude', name: 'החוברות האישיות שלי', icon: '✨', order: 0, role: 'claude' },
  { id: 'cat-imported', name: 'Disney Mystery Coloring Book', icon: '🏰', order: 1, role: 'imported' },
];

export async function seed(): Promise<void> {
  const cats = await store.categories();
  if (!cats.length) for (const c of DEFAULT_CATEGORIES) await store.putCategory(c);
  if (!(await store.kv<boolean>('seeded-demo'))) {
    const { book, pages } = await makeDemoBook('cat-claude');
    for (const p of pages) await store.putPage(p);
    await store.putBook(book);
    await store.setKv('seeded-demo', true);
  }
  // the creator's category was renamed
  const cc = (await store.categories()).find((c) => c.id === 'cat-claude');
  if (cc && cc.name === 'נוצר עם קלוד') await store.putCategory({ ...cc, name: 'החוברות האישיות שלי' });
  // the first version gave the demo book a flat purple cover
  for (const b of await store.books()) {
    if (b.demo && b.coverColor === '#6b3fa0') await store.putBook({ ...b, coverColor: DEMO_COVER, direction: 'rtl' });
  }
}

export async function addCategory(name: string, icon: string): Promise<Category> {
  const cats = await store.categories();
  const c: Category = { id: uid('cat'), name, icon, order: cats.length ? Math.max(...cats.map((x) => x.order)) + 1 : 0 };
  await store.putCategory(c);
  return c;
}

let seedPromise: Promise<void> | null = null;
/** Default categories and the demo book, created once per device. */
export function whenSeeded(): Promise<void> {
  seedPromise ??= seed().catch((e) => console.error('seed failed', e));
  return seedPromise;
}
