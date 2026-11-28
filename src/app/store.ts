/**
 * IndexedDB storage for categories, books, pages and paint. Falls back to
 * memory when IndexedDB is unavailable (private window, blocked storage),
 * so the app still works for the session.
 */
import { dbName, prefPrefix } from './account';
import type { BookMeta, Category, PageRec, PaintRec } from './types';

type StoreName = 'categories' | 'books' | 'pages' | 'paint' | 'kv';
const KEYS: Record<StoreName, string> = { categories: 'id', books: 'id', pages: 'id', paint: 'pageId', kv: 'key' };

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<StoreName, Map<string, unknown>>();
export let persistent = true;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(dbName(), 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, key] of Object.entries(KEYS)) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: key });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { persistent = false; resolve(null); };
      req.onblocked = () => { persistent = false; resolve(null); };
    } catch {
      persistent = false;
      resolve(null);
    }
  });
  return dbPromise;
}

function mem(name: StoreName): Map<string, unknown> {
  let m = memory.get(name);
  if (!m) { m = new Map(); memory.set(name, m); }
  return m;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

async function get<T>(name: StoreName, key: string): Promise<T | undefined> {
  const db = await open();
  if (!db) return mem(name).get(key) as T | undefined;
  try { return await req(db.transaction(name).objectStore(name).get(key)) as T | undefined; } catch { return mem(name).get(key) as T | undefined; }
}

async function all<T>(name: StoreName): Promise<T[]> {
  const db = await open();
  if (!db) return [...mem(name).values()] as T[];
  try { return await req(db.transaction(name).objectStore(name).getAll()) as T[]; } catch { return [...mem(name).values()] as T[]; }
}

async function put<T extends object>(name: StoreName, value: T): Promise<void> {
  const key = (value as Record<string, unknown>)[KEYS[name]] as string;
  mem(name).set(key, value);
  const db = await open();
  if (!db) return;
  try { await req(db.transaction(name, 'readwrite').objectStore(name).put(value)); } catch { persistent = false; }
}

async function del(name: StoreName, key: string): Promise<void> {
  mem(name).delete(key);
  const db = await open();
  if (!db) return;
  try { await req(db.transaction(name, 'readwrite').objectStore(name).delete(key)); } catch { /* memory copy is gone */ }
}

export const store = {
  categories: () => all<Category>('categories').then((c) => c.sort((a, b) => a.order - b.order)),
  putCategory: (c: Category) => put('categories', c),
  deleteCategory: (id: string) => del('categories', id),

  books: () => all<BookMeta>('books').then((b) => b.sort((a, b2) => a.createdAt - b2.createdAt)),
  book: (id: string) => get<BookMeta>('books', id),
  putBook: (b: BookMeta) => put('books', b),
  async deleteBook(b: BookMeta) {
    for (const p of b.pageIds) { await del('pages', p); await del('paint', p); }
    await del('books', b.id);
  },

  page: (id: string) => get<PageRec>('pages', id),
  putPage: (p: PageRec) => put('pages', p),
  async deletePage(id: string) { await del('pages', id); await del('paint', id); },

  paint: (pageId: string) => get<PaintRec>('paint', pageId),
  putPaint: (p: PaintRec) => put('paint', p),

  async kv<T>(key: string): Promise<T | undefined> {
    const r = await get<{ key: string; value: T }>('kv', key);
    return r?.value;
  },
  setKv: <T>(key: string, value: T) => put('kv', { key, value }),
};

/** Small synchronous preferences (toolbar side, last tool...). */
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(prefPrefix() + key);
      return v == null ? fallback : (JSON.parse(v) as T);
    } catch { return fallback; }
  },
  set(key: string, value: unknown): void {
    try { localStorage.setItem(prefPrefix() + key, JSON.stringify(value)); } catch { /* not saved */ }
  },
  del(key: string): void {
    try { localStorage.removeItem(prefPrefix() + key); } catch { /* nothing to remove */ }
  },
};

export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
