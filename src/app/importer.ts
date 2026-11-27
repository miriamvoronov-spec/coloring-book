/**
 * Import books at runtime: a .colorbook (ZIP with book.json) from the
 * enhance tool, a ZIP of page images, or page images picked on the device.
 * Nothing is uploaded anywhere: pages are stored only in this browser.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { store, uid } from './store';
import type { BookMeta, Category, Label, LegendEntry, PageKind, PageRec } from './types';

/** Long side of a stored coloring page. Big enough for zoom, small enough for a phone's memory. */
export const MAX_SIDE = 2800;
const COVER_SIDE = 1600;

interface ManifestPage {
  kind?: PageKind | 'solution';
  lines?: string; image?: string; svg?: string;
  labels?: Label[]; legend?: LegendEntry[];
  numbersInImage?: boolean; solution?: string; title?: string;
  size?: { width: number; height: number };
}
interface Manifest {
  format?: string; version?: number; title?: string; direction?: 'ltr' | 'rtl'; coverColor?: string;
  pages: ManifestPage[];
}

const IMG_RE = /\.(png|jpe?g|webp|svg)$/i;
const mime = (name: string) => name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : name.toLowerCase().match(/\.jpe?g$/) ? 'image/jpeg' : name.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/png';

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

function fit(w: number, h: number, max: number): [number, number, number] {
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.round(w * s), Math.round(h * s), s];
}

function drawTo(img: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

const toBlob = (c: HTMLCanvasElement, type = 'image/png', q?: number) =>
  new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('לא הצלחתי לשמור את התמונה'))), type, q));

/** How colourful an image is (0..1): used to tell covers and solutions from line art. */
function colorfulness(img: CanvasImageSource, iw: number, ih: number): number {
  const c = drawTo(img, 64, Math.max(1, Math.round((64 * ih) / iw)));
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let sat = 0;
  for (let i = 0; i < d.length; i += 4) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (mx - mn > 60) sat++;
  }
  return sat / (d.length / 4);
}

/**
 * Light cleanup for a photographed or scanned page: even out the lighting,
 * whiten the paper and turn the lines solid black.
 */
export function cleanLineArt(src: HTMLCanvasElement): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const sw = Math.max(8, Math.round(w / 24)), sh = Math.max(8, Math.round(h / 24));
  const small = document.createElement('canvas');
  small.width = sw; small.height = sh;
  const sctx = small.getContext('2d')!;
  sctx.drawImage(src, 0, 0, sw, sh);
  // max filter: lighten with shifted copies removes the lines from the paper estimate
  sctx.globalCompositeOperation = 'lighten';
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) sctx.drawImage(small, dx, dy);
  const bg = document.createElement('canvas');
  bg.width = w; bg.height = h;
  const bctx = bg.getContext('2d', { willReadFrequently: true })!;
  bctx.imageSmoothingQuality = 'high';
  bctx.filter = 'blur(6px)';
  bctx.drawImage(small, 0, 0, w, h);
  const ctx = src.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const b = bctx.getImageData(0, 0, w, h).data;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const bl = Math.max(40, 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2]);
    const r = lum / bl;
    const v = r > 0.78 ? 255 : r < 0.55 ? 0 : Math.round(((r - 0.55) / 0.23) * 255);
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return src;
}

async function coloringPage(bookId: string, blob: Blob, meta: ManifestPage, clean: boolean, solution?: Blob): Promise<PageRec> {
  const img = await loadImage(blob);
  const iw = img.naturalWidth || meta.size?.width || 1600, ih = img.naturalHeight || meta.size?.height || 2240;
  const [w, h, s] = fit(iw, ih, MAX_SIDE);
  let c = drawTo(img, w, h);
  if (clean) c = cleanLineArt(c);
  // labels are in the source image's pixels; scale them to the stored size
  const ls = meta.size ? w / meta.size.width : s;
  const labels = (meta.labels ?? []).map((l) => ({ ...l, x: l.x * ls, y: l.y * ls, size: (l.size || 40) * ls }));
  return {
    id: uid('p'), bookId, kind: 'coloring', width: w, height: h, image: await toBlob(c),
    labels, legend: meta.legend ?? [], numbersInImage: meta.numbersInImage ?? (meta.labels ? true : false),
    solution, title: meta.title,
  };
}

async function coverPage(bookId: string, blob: Blob, kind: 'cover' | 'back'): Promise<PageRec> {
  const img = await loadImage(blob);
  const [w, h] = fit(img.naturalWidth, img.naturalHeight, COVER_SIDE);
  const c = drawTo(img, w, h);
  return { id: uid('p'), bookId, kind, width: w, height: h, image: await toBlob(c, 'image/jpeg', 0.9), labels: [], legend: [], numbersInImage: true };
}

type Entry = { name: string; blob: Blob };

function baseName(n: string) { return n.split('/').pop()!.replace(/\.[^.]+$/, ''); }

async function fromEntries(entries: Entry[], jsonByName: Map<string, unknown>, manifest: Manifest | null, cat: Category,
  fallbackTitle: string, progress: (m: string) => void, cleanLoose: boolean): Promise<BookMeta> {
  const bookId = uid('b');
  const byName = new Map(entries.map((e) => [e.name, e.blob]));
  const pages: PageRec[] = [];
  if (manifest) {
    const list = manifest.pages.filter((p) => p.kind !== 'solution');
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      progress(`מעבדת עמוד ${i + 1} מתוך ${list.length}…`);
      const path = p.lines ?? p.image ?? p.svg;
      const blob = path ? byName.get(path) : undefined;
      if (!blob) continue;
      const typed = blob.type ? blob : new Blob([blob], { type: mime(path!) });
      if (p.kind === 'cover' || p.kind === 'back') pages.push(await coverPage(bookId, typed, p.kind));
      else pages.push(await coloringPage(bookId, typed, p, false, p.solution ? byName.get(p.solution) : undefined));
    }
  } else {
    const imgs = entries.filter((e) => IMG_RE.test(e.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (let i = 0; i < imgs.length; i++) {
      const e = imgs[i];
      progress(`מעבדת עמוד ${i + 1} מתוך ${imgs.length}…`);
      const typed = e.blob.type ? e.blob : new Blob([e.blob], { type: mime(e.name) });
      const img = await loadImage(typed);
      const colorful = colorfulness(img, img.naturalWidth, img.naturalHeight) > 0.25;
      const many = imgs.length >= 3;
      const isEdge = many && (i === 0 || i === imgs.length - 1);
      const named = /cover|כריכה/i.test(e.name) ? (i === imgs.length - 1 && imgs.length > 1 ? 'back' : 'cover') : /back/i.test(e.name) ? 'back' : null;
      if (named || (colorful && isEdge)) {
        pages.push(await coverPage(bookId, typed, named ?? (i === 0 ? 'cover' : 'back')));
        continue;
      }
      if (colorful && many) continue; // a coloured solution page, not a page to colour
      const meta = (jsonByName.get(baseName(e.name)) ?? {}) as ManifestPage;
      pages.push(await coloringPage(bookId, typed, meta, cleanLoose && !meta.labels, undefined));
    }
  }
  if (!pages.some((p) => p.kind === 'coloring')) throw new Error('לא מצאתי בקובץ דפי צביעה');
  // the cover goes first and the back cover last, whatever order they came in
  pages.sort((a, b) => (a.kind === 'cover' ? -1 : a.kind === 'back' ? 1 : 0) - (b.kind === 'cover' ? -1 : b.kind === 'back' ? 1 : 0));
  for (const p of pages) await store.putPage(p);
  const book: BookMeta = {
    id: bookId, categoryId: cat.id, title: manifest?.title || fallbackTitle,
    coverColor: manifest?.coverColor || '#7a3f22', direction: manifest?.direction || 'ltr',
    madeWithClaude: cat.role === 'claude', pageIds: pages.map((p) => p.id), createdAt: Date.now(),
  };
  await store.putBook(book);
  return book;
}

export async function importFiles(files: File[], cat: Category, progress: (m: string) => void): Promise<BookMeta> {
  const zip = files.find((f) => /\.(colorbook|zip)$/i.test(f.name));
  if (zip) {
    progress('פותחת את הקובץ…');
    let unz: Record<string, Uint8Array>;
    try { unz = unzipSync(new Uint8Array(await zip.arrayBuffer())); } catch { throw new Error('הקובץ פגום או שאינו ‎.colorbook'); }
    const entries: Entry[] = [];
    const jsons = new Map<string, unknown>();
    let manifest: Manifest | null = null;
    for (const [name, data] of Object.entries(unz)) {
      if (name.endsWith('/') || name.startsWith('__MACOSX')) continue;
      if (name.toLowerCase().endsWith('.json')) {
        try {
          const j = JSON.parse(strFromU8(data));
          if (baseName(name) === 'book' && Array.isArray(j.pages)) manifest = j; else jsons.set(baseName(name), j);
        } catch { /* skip broken JSON */ }
        continue;
      }
      if (IMG_RE.test(name)) entries.push({ name, blob: new Blob([data as BlobPart], { type: mime(name) }) });
    }
    return fromEntries(entries, jsons, manifest, cat, zip.name.replace(/\.(colorbook|zip)$/i, ''), progress, false);
  }
  const jsons = new Map<string, unknown>();
  for (const f of files.filter((f) => f.name.toLowerCase().endsWith('.json'))) {
    try { jsons.set(baseName(f.name), JSON.parse(await f.text())); } catch { /* skip */ }
  }
  const imgs = files.filter((f) => IMG_RE.test(f.name) || f.type.startsWith('image/'));
  if (!imgs.length) throw new Error('בחרי קובץ ‎.colorbook או תמונות של דפים');
  const title = imgs.length === 1 ? baseName(imgs[0].name) : 'חוברת חדשה';
  return fromEntries(imgs.map((f) => ({ name: f.name, blob: f })), jsons, null, cat, title, progress, true);
}
