/**
 * Import a whole coloring book from a PDF inside the app.
 * The PDF is read in slices straight from the file (never loaded whole),
 * so books of 1 GB and more work on a tablet. Each page is rendered,
 * classified (cover, coloring, solution, back), cleaned and stored one by one.
 */
import { canvasToPalettePng } from './pngpal';
import { restoreMargins, type MarginMode } from './margins';
import { store, uid } from './store';
import { MAX_SIDE } from './importer';
import type { BookMeta, Category, LegendEntry, PageRec } from './types';
import { rgbToHex } from './raster';

/* minimal typing of the parts of pdf.js we use */
interface Viewport { width: number; height: number }
interface PdfPage { getViewport(o: { scale: number }): Viewport; render(o: { canvasContext: CanvasRenderingContext2D; viewport: Viewport; background?: string }): { promise: Promise<void> }; cleanup(): void }
export interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> }
interface RangeTransport { onDataRange(begin: number, chunk: Uint8Array): void }
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string; workerPort: Worker | null };
  PDFDataRangeTransport: new (length: number, initial: Uint8Array | null) => RangeTransport & { requestDataRange(b: number, e: number): void };
  getDocument(o: object): { promise: Promise<PdfDoc> };
}

let lib: Promise<PdfJs> | null = null;
/** pdf.js is bundled with the app (works offline and needs no other site). */
function loadPdfJs(): Promise<PdfJs> {
  lib ??= (async () => {
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.js')) as unknown as PdfJs;
    // run pdf.js on the page itself: background workers can be blocked inside the claude.ai viewer,
    // and a blocked worker would leave the import waiting forever
    const w = await import('pdfjs-dist/legacy/build/pdf.worker.js');
    (globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = w;
    return pdfjs;
  })();
  lib.catch(() => { lib = null; });
  return lib;
}

/** Open a PDF File without reading it all into memory. */
export async function openPdf(file: File): Promise<PdfDoc> {
  const pdfjs = await loadPdfJs();
  const first = new Uint8Array(await file.slice(0, Math.min(file.size, 1 << 16)).arrayBuffer());
  const transport = new pdfjs.PDFDataRangeTransport(file.size, first);
  transport.requestDataRange = (begin: number, end: number) => {
    void file.slice(begin, end).arrayBuffer().then((b) => transport.onDataRange(begin, new Uint8Array(b)));
  };
  try {
    return await pdfjs.getDocument({ range: transport, length: file.size, disableAutoFetch: true, disableStream: true, rangeChunkSize: 1 << 20, isEvalSupported: false }).promise;
  } catch (e) {
    console.error(e);
    throw new Error('לא הצלחתי לפתוח את ה-PDF. אולי הוא מוגן בסיסמה או פגום.');
  }
}

/** Pictures (PNG, JPG…) of a book's pages, read like a PDF so the same wizard and import work for them.
 *  They are put in the order of their file names (page2 before page10). */
export function imagesAsDoc(files: File[]): PdfDoc {
  const list = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const bitmaps = new Map<number, Promise<ImageBitmap>>();
  const bmp = (n: number) => { let p = bitmaps.get(n); if (!p) { p = createImageBitmap(list[n - 1]); bitmaps.set(n, p); } return p; };
  return {
    numPages: list.length,
    async getPage(n: number): Promise<PdfPage> {
      const b = await bmp(n);
      return {
        getViewport: ({ scale }) => ({ width: b.width * scale, height: b.height * scale }),
        render: ({ canvasContext, viewport }) => ({ promise: (async () => { canvasContext.drawImage(b, 0, 0, viewport.width, viewport.height); })() }),
        cleanup: () => { /* kept until the book is built */ },
      };
    },
    async destroy() { for (const p of bitmaps.values()) (await p).close(); bitmaps.clear(); },
  };
}

/** Render page n (1-based) so its long side is `side` pixels. */
export async function renderPage(doc: PdfDoc, n: number, side: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(n);
  const v1 = page.getViewport({ scale: 1 });
  const scale = side / Math.max(v1.width, v1.height);
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise;
  page.cleanup();
  return c;
}

export type PdfKind = 'cover' | 'coloring' | 'solution' | 'back' | 'skip';
export const KIND_HE: Record<PdfKind, string> = { cover: 'כריכה', coloring: 'דף צביעה', solution: 'פתרון', back: 'כריכה אחורית', skip: 'דילוג' };

/** Share of strongly coloured pixels and of white paper in a thumbnail. */
function stats(c: HTMLCanvasElement): { sat: number; white: number } {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let sat = 0, white = 0;
  for (let i = 0; i < d.length; i += 4) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (mx - mn > 55) sat++;
    if (mn > 215) white++;
  }
  const n = d.length / 4;
  return { sat: sat / n, white: white / n };
}

/** First guess at what each page is; the person confirms it on screen. */
export function guessKind(i: number, count: number, thumb: HTMLCanvasElement): PdfKind {
  if (i === 0) return 'cover';
  if (i === count - 1 && count > 2) return 'back';
  const s = stats(thumb);
  if (s.white > 0.55 && s.sat < 0.08) return 'coloring';
  if (s.sat > 0.18 && s.white < 0.55) return 'solution';
  return s.white > 0.5 ? 'coloring' : 'skip';
}

const LEGEND_ORDER = '1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Find the colour key printed on the page: a row of similar coloured squares,
 * usually at the bottom. Returns the legend (read in printed order 1…9, 0, A, B…)
 * and the top of the key so it can be trimmed from the drawing.
 */
export function findLegend(c: HTMLCanvasElement): { legend: LegendEntry[]; top: number } {
  const W = 600, s = W / c.width, H = Math.round(c.height * s);
  const t = document.createElement('canvas'); t.width = W; t.height = H;
  const tctx = t.getContext('2d', { willReadFrequently: true })!;
  tctx.drawImage(c, 0, 0, W, H);
  const d = tctx.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    // coloured, or a dark/grey ink square (black and grey are legend colours too)
    mask[p] = mx - mn > 40 || mx < 170 ? 1 : 0;
  }
  // connected blobs
  const lab = new Int32Array(W * H);
  const blobs: { x0: number; y0: number; x1: number; y1: number; n: number; r: number; g: number; b: number }[] = [];
  const stack: number[] = [];
  for (let p = 0; p < W * H; p++) {
    if (!mask[p] || lab[p]) continue;
    const id = blobs.length + 1;
    const bl = { x0: W, y0: H, x1: 0, y1: 0, n: 0, r: 0, g: 0, b: 0 };
    lab[p] = id; stack.push(p);
    while (stack.length) {
      const q = stack.pop()!, x = q % W, y = (q / W) | 0;
      bl.n++; bl.r += d[q * 4]; bl.g += d[q * 4 + 1]; bl.b += d[q * 4 + 2];
      if (x < bl.x0) bl.x0 = x; if (x > bl.x1) bl.x1 = x; if (y < bl.y0) bl.y0 = y; if (y > bl.y1) bl.y1 = y;
      for (const nq of [q - 1, q + 1, q - W, q + W]) {
        if (nq < 0 || nq >= W * H || lab[nq] || !mask[nq]) continue;
        if (Math.abs((nq % W) - x) > 1) continue;
        lab[nq] = id; stack.push(nq);
      }
    }
    blobs.push(bl);
  }
  // solid, roughly square blobs of a similar size
  const sq = blobs.filter((b) => {
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    return bw >= 8 && bh >= 8 && bw < W / 6 && bw / bh > 0.6 && bw / bh < 1.7 && b.n / (bw * bh) > 0.75 && b.y0 > H * 0.6;
  });
  if (sq.length < 3) return { legend: [], top: c.height };
  const sizes = sq.map((b) => b.x1 - b.x0).sort((a, b) => a - b);
  const med = sizes[sizes.length >> 1];
  const keys = sq.filter((b) => Math.abs((b.x1 - b.x0) - med) < med * 0.35);
  if (keys.length < 3) return { legend: [], top: c.height };
  // printed order: rows top to bottom, then left to right
  keys.sort((a, b) => (Math.abs(a.y0 - b.y0) > med ? a.y0 - b.y0 : a.x0 - b.x0));
  const legend = keys.slice(0, LEGEND_ORDER.length).map((b, i) => ({
    label: LEGEND_ORDER[i], color: rgbToHex(Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)),
  }));
  const top = Math.min(...keys.map((b) => b.y0));
  return { legend, top: Math.max(0, Math.round((top - med * 0.8) / s)) };
}

const toBlob = (c: HTMLCanvasElement, type = 'image/png', q?: number) =>
  new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('לא הצלחתי לשמור את הדף'))), type, q));

/**
 * Printed books have faint, dotted (halftone) lines. Blur merges the dots,
 * the paper is estimated and removed, the threshold adapts to how dark this
 * page's ink is, and the lines are thickened to a bold, even stroke.
 */
export function cleanScan(c: HTMLCanvasElement): void {
  const w = c.width, h = c.height;
  const blur = document.createElement('canvas'); blur.width = w; blur.height = h;
  const bx = blur.getContext('2d', { willReadFrequently: true })!;
  bx.filter = `blur(${Math.max(1, w / 1500).toFixed(2)}px) grayscale(1)`;
  bx.drawImage(c, 0, 0);
  // paper estimate: a max filter on a small copy, blown back up
  const sw = Math.max(8, Math.round(w / 24)), sh = Math.max(8, Math.round(h / 24));
  const small = document.createElement('canvas'); small.width = sw; small.height = sh;
  const sx = small.getContext('2d')!;
  sx.drawImage(blur, 0, 0, sw, sh);
  sx.globalCompositeOperation = 'lighten';
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) sx.drawImage(small, dx, dy);
  const bg = document.createElement('canvas'); bg.width = w; bg.height = h;
  const gx = bg.getContext('2d', { willReadFrequently: true })!;
  gx.filter = 'blur(6px)'; gx.imageSmoothingQuality = 'high';
  gx.drawImage(small, 0, 0, w, h);
  const d = bx.getImageData(0, 0, w, h);
  const b = gx.getImageData(0, 0, w, h).data;
  const px = d.data;
  const dark = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const v = Math.max(0, Math.min(255, Math.round(b[i] - px[i])));
    dark[p] = v; if (v > 6) hist[v]++;
  }
  // the ink level of this page: 75th percentile of the darker pixels
  let total = 0; for (let v = 7; v < 256; v++) total += hist[v];
  let acc = 0, p75 = 30;
  for (let v = 7; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.75) { p75 = v; break; } }
  const lo = 0.35 * p75, span = Math.max(4, 0.5 * p75);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const t = Math.max(0, Math.min(1, (dark[p] - lo) / span));
    const v = Math.round(255 * (1 - t));
    px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
  }
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.putImageData(d, 0, 0);
  // thicken: a 3×3 min filter
  blur.width = w;
  bx.filter = 'none'; bx.drawImage(c, 0, 0);
  ctx.globalCompositeOperation = 'darken';
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) ctx.drawImage(blur, dx, dy);
  ctx.globalCompositeOperation = 'source-over';
}

/** A scanned coloring page → clean black lines on white, with its colour key kept under it. */
async function coloringFromPdf(bookId: string, src: HTMLCanvasElement, margins: MarginMode = 'white', signal?: AbortSignal): Promise<PageRec> {
  const { legend, top } = findLegend(src);
  const h = legend.length ? top : src.height;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  cleanScan(c);
  const keyBelow = legend.length > 0 && h < src.height;
  const { canvas: art, dx } = await restoreMargins(c, margins, keyBelow ? ['bottom'] : [], signal);
  let out = art;
  if (keyBelow) {
    // the colour squares stay on the page, on clean white paper
    out = document.createElement('canvas');
    out.width = art.width; out.height = art.height + (src.height - h);
    const o = out.getContext('2d', { willReadFrequently: true })!;
    o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
    o.drawImage(src, 0, h, src.width, src.height - h, dx, art.height, src.width, src.height - h);
    const strip = o.getImageData(0, art.height, out.width, out.height - art.height);
    const d = strip.data;
    for (let i = 0; i < d.length; i += 4) if (Math.min(d[i], d[i + 1], d[i + 2]) > 200) { d[i] = d[i + 1] = d[i + 2] = 255; }
    o.putImageData(strip, 0, art.height);
    o.drawImage(art, 0, 0);
  }
  return { id: uid('p'), bookId, kind: 'coloring', width: out.width, height: out.height, image: canvasToPalettePng(out), labels: [], legend, numbersInImage: true };
}

async function coverFromPdf(bookId: string, src: HTMLCanvasElement, kind: 'cover' | 'back'): Promise<PageRec> {
  return { id: uid('p'), bookId, kind, width: src.width, height: src.height, image: await toBlob(src, 'image/jpeg', 0.9), labels: [], legend: [], numbersInImage: true };
}

/** Average colour of the cover's edge, used for the spine on the shelf. */
function edgeColor(c: HTMLCanvasElement): string {
  const t = document.createElement('canvas'); t.width = 16; t.height = 24;
  const ctx = t.getContext('2d')!; ctx.drawImage(c, 0, 0, 16, 24);
  const d = ctx.getImageData(0, 0, 2, 24).data;
  let r = 0, g = 0, b = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  return rgbToHex(Math.round(r / n * 0.8), Math.round(g / n * 0.8), Math.round(b / n * 0.8));
}

export interface PdfBookPlan { title: string; category: Category; direction: 'rtl' | 'ltr'; kinds: PdfKind[]; margins?: MarginMode }

/** Build and store the book page by page. */
export async function importPdfBook(doc: PdfDoc, plan: PdfBookPlan, progress: (m: string, frac: number) => void, signal?: AbortSignal): Promise<BookMeta> {
  const bookId = uid('b');
  const pages: PageRec[] = [];
  let cover = '#7a3f22';
  const todo = plan.kinds.map((k, i) => [k, i] as const).filter(([k]) => k !== 'skip' && k !== 'solution');
  for (let j = 0; j < todo.length; j++) {
    if (signal?.aborted) throw new Error('הייבוא בוטל');
    const [kind, i] = todo[j];
    progress(`מעבדת עמוד ${j + 1} מתוך ${todo.length}…`, j / todo.length);
    if (kind === 'cover' || kind === 'back') {
      const c = await renderPage(doc, i + 1, 1600);
      if (kind === 'cover') cover = edgeColor(c);
      pages.push(await coverFromPdf(bookId, c, kind));
      c.width = 0;
    } else {
      const c = await renderPage(doc, i + 1, MAX_SIDE);
      pages.push(await coloringFromPdf(bookId, c, plan.margins ?? 'off', signal));
      c.width = 0;
    }
    await store.putPage(pages[pages.length - 1]);
  }
  if (!pages.some((p) => p.kind === 'coloring')) throw new Error('לא סומנו דפי צביעה');
  pages.sort((a, b) => (a.kind === 'cover' ? -1 : a.kind === 'back' ? 1 : 0) - (b.kind === 'cover' ? -1 : b.kind === 'back' ? 1 : 0));
  const book: BookMeta = {
    id: bookId, categoryId: plan.category.id, title: plan.title, coverColor: cover, direction: plan.direction,
    madeWithClaude: plan.category.role === 'claude', pageIds: pages.map((p) => p.id), createdAt: Date.now(),
  };
  await store.putBook(book);
  progress('החוברת מוכנה', 1);
  return book;
}
