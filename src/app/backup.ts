/** Back up the whole library (books, pages, her colouring) to one ZIP file, and restore it. */
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { store } from './store';
import type { BookMeta, Category, PageRec, PaintRec } from './types';

type PageMeta = Omit<PageRec, 'image' | 'solution'> & { image: string; solution?: string };
interface Library { format: 'miriam-library'; version: 1; categories: Category[]; books: BookMeta[]; pages: PageMeta[]; paints: { pageId: string; updatedAt: number; file: string }[] }

const ext = (b: Blob) => (b.type === 'image/jpeg' ? 'jpg' : 'png');

export async function exportLibrary(progress: (m: string) => void): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const [categories, books] = await Promise.all([store.categories(), store.books()]);
  const lib: Library = { format: 'miriam-library', version: 1, categories, books, pages: [], paints: [] };
  let n = 0; const total = books.reduce((a, b) => a + b.pageIds.length, 0);
  for (const b of books) for (const id of b.pageIds) {
    progress(`אורזת עמוד ${++n} מתוך ${total}…`);
    const p = await store.page(id); if (!p) continue;
    const img = `pages/${p.id}.${ext(p.image)}`;
    files[img] = new Uint8Array(await p.image.arrayBuffer());
    const meta: PageMeta = { ...p, image: img, solution: undefined };
    if (p.solution) { meta.solution = `solutions/${p.id}.${ext(p.solution)}`; files[meta.solution] = new Uint8Array(await p.solution.arrayBuffer()); }
    lib.pages.push(meta);
    const paint = await store.paint(id);
    if (paint) { const f = `paint/${id}.png`; files[f] = new Uint8Array(await paint.color.arrayBuffer()); lib.paints.push({ pageId: id, updatedAt: paint.updatedAt, file: f }); }
  }
  files['library.json'] = strToU8(JSON.stringify(lib));
  progress('יוצרת קובץ…');
  return new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' });
}

export async function importLibrary(file: File, progress: (m: string) => void): Promise<number> {
  progress('פותחת את הגיבוי…');
  const unz = unzipSync(new Uint8Array(await file.arrayBuffer()));
  if (!unz['library.json']) throw new Error('זה לא קובץ גיבוי של האפליקציה');
  const lib = JSON.parse(strFromU8(unz['library.json'])) as Library;
  const blob = (path: string | undefined, type?: string) => (path && unz[path] ? new Blob([unz[path] as BlobPart], { type: type ?? (path.endsWith('.jpg') ? 'image/jpeg' : 'image/png') }) : undefined);
  for (const c of lib.categories) await store.putCategory(c);
  let n = 0;
  for (const p of lib.pages) {
    progress(`משחזרת עמוד ${++n} מתוך ${lib.pages.length}…`);
    const image = blob(p.image); if (!image) continue;
    await store.putPage({ ...p, image, solution: blob(p.solution) } as PageRec);
  }
  for (const x of lib.paints) { const color = blob(x.file); if (color) await store.putPaint({ pageId: x.pageId, color, updatedAt: x.updatedAt } as PaintRec); }
  for (const b of lib.books) await store.putBook(b);
  return lib.books.length;
}
