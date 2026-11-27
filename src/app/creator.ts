/**
 * Create coloring pages and whole books from her ideas, with Claude
 * (the Artifact's `sample` capability). Claude draws an SVG of flat coloured
 * shapes; the app turns it into black outlines, closed regions, a number in
 * each region, a colour key and the coloured solution.
 */
import { useCap } from './runtime';
import { store, uid, prefs } from './store';
import { binarize, hexToRgb, labelRegions, opticalCenter } from './raster';
import type { BookMeta, Label, LegendEntry, PageRec } from './types';

interface Sample {
  (input: string, opts?: { onText?: (e: { text: string }) => void; signal?: AbortSignal; modelTier?: string; cache?: boolean }): Promise<{ text: string }>;
  json?: (input: string, opts?: object) => Promise<unknown>;
}

export const W = 1600, H = 2240;

export type Level = 1 | 2 | 3;
export const LEVEL_HE: Record<Level, string> = { 1: 'קל: מעט אזורים גדולים', 2: 'בינוני', 3: 'מאתגר: הרבה אזורים קטנים' };
const LEVEL_SHAPES: Record<Level, string> = { 1: 'about 25 to 40 shapes, all fairly large', 2: 'about 50 to 80 shapes', 3: 'about 100 to 160 shapes, many of them small' };

/** Drawing styles she can pick when creating. */
export type ArtStyle = 'elegant' | 'adult' | 'storybook' | 'kids' | 'botanical' | 'mandala' | 'artnouveau' | 'vintage' | 'stainedglass' | 'folk';
export const ART_STYLES: { id: ArtStyle; he: string; prompt: string }[] = [
  { id: 'elegant', he: 'אלגנטי', prompt: 'Elegant and refined: graceful flowing curves, delicate ornamental details, balanced symmetry, a sophisticated muted-jewel palette.' },
  { id: 'adult', he: 'מבוגר ומפורט', prompt: 'A detailed coloring page for adults: realistic proportions, intricate patterns filling the background, many fine sections, calm sophisticated mood.' },
  { id: 'storybook', he: 'אגדה קסומה', prompt: 'Whimsical fairy-tale storybook illustration, magical and warm.' },
  { id: 'kids', he: 'ילדותי', prompt: 'Cute and playful for children: big round friendly shapes, smiling characters, bright cheerful colours.' },
  { id: 'botanical', he: 'בוטני', prompt: 'Botanical illustration: leaves, flowers and vines drawn with natural detail, like a vintage botanical print.' },
  { id: 'mandala', he: 'מנדלה', prompt: 'A mandala-like radial composition with repeating symmetric patterns around the subject.' },
  { id: 'artnouveau', he: 'ארט נובו', prompt: 'Art Nouveau style: sinuous organic lines, decorative arched frame, flowing hair and floral ornaments, like a Mucha poster.' },
  { id: 'vintage', he: 'וינטג׳', prompt: 'Vintage nineteen-fifties storybook style with soft retro colours and simple elegant shapes.' },
  { id: 'stainedglass', he: 'ויטראז׳', prompt: 'Stained-glass window style: the picture divided into many angular glass pieces inside a gothic arch.' },
  { id: 'folk', he: 'אמנות עממית', prompt: 'Folk-art style: decorative flat motifs, birds and flowers, like Scandinavian or Eastern European folk painting.' },
];
export const styleOf = (id?: string) => ART_STYLES.find((x) => x.id === id) ?? ART_STYLES[0];

export interface IdeaRec { id: string; text: string; kind: 'page' | 'theme'; at: number }

export const history = {
  all(): IdeaRec[] { return prefs.get<IdeaRec[]>('ideaHistory', []); },
  add(text: string, kind: IdeaRec['kind']): void {
    const list = history.all().filter((x) => x.text !== text);
    list.unshift({ id: uid('i'), text, kind, at: Date.now() });
    prefs.set('ideaHistory', list.slice(0, 60));
  },
  remove(id: string): void { prefs.set('ideaHistory', history.all().filter((x) => x.id !== id)); },
};

/** A friendly Hebrew message for each way `sample` can fail. */
export function creatorError(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === 'not_granted') return 'צריך לאשר לקלוד לצייר בשבילך. אפשר לאשר בתפריט ההרשאות של הדף.';
  if (code === 'rate_limited') return 'ציירנו הרבה ברצף. נחכה דקה ונסה שוב.';
  if (code === 'refused' || code === 'policy') return 'את הרעיון הזה קלוד לא יכול לצייר. ננסה רעיון אחר?';
  if (code === 'aborted' || (e as Error)?.name === 'AbortError') return 'היצירה בוטלה';
  if (!navigator.onLine) return 'אין חיבור לאינטרנט כרגע. היצירה צריכה רשת.';
  return (e as Error)?.message && /[א-ת]/.test((e as Error).message) ? (e as Error).message : 'משהו השתבש ביצירה. ננסה שוב?';
}

export async function creatorAvailable(): Promise<boolean> { return !!(await useCap<Sample>('sample')); }

async function sampler(): Promise<Sample> {
  const s = await useCap<Sample>('sample');
  if (!s) throw new Error('היצירה עם קלוד עובדת כשהאפליקציה פתוחה בתוך claude.ai');
  return s;
}

/** Page titles for a themed book, for her to approve or edit first. */
export async function themeTitles(theme: string, count: number, signal?: AbortSignal): Promise<string[]> {
  const s = await sampler();
  const prompt = `You plan a coloring book. Theme (in Hebrew): "${theme}".
Invent ${count} page ideas. Each page is a playful variation on the theme, with a short magical Hebrew title of 2 to 5 words
(for example, for "פירות הדר בתפקיד שוליית המכשף": "תפוז הקריסטלים", "לימון המטאטא המכושף").
Answer with JSON only: an array of ${count} Hebrew strings. No other text.`;
  const { text } = await s(prompt, { signal, modelTier: 'quick' });
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('לא קיבלתי רשימת שמות. ננסה שוב?');
  const arr = (JSON.parse(m[0]) as unknown[]).map((x) => String(x).trim()).filter(Boolean);
  return arr.slice(0, count);
}

/** Ask Claude for a flat-colour SVG of the idea. */
async function drawSvg(idea: string, level: Level, colors: number, onProgress: (n: number) => void, signal?: AbortSignal, style?: ArtStyle): Promise<string> {
  const s = await sampler();
  const prompt = `Draw an original color-by-number coloring page as SVG. Subject (may be Hebrew): "${idea}".
Rules:
- Output ONLY the SVG, starting with <svg and ending with </svg>. No explanations, no markdown.
- viewBox="0 0 1000 1400". The first element is <rect x="0" y="0" width="1000" height="1400"> filling the background.
- Use only <rect>, <circle>, <ellipse>, <polygon> and <path> with a solid fill="#rrggbb". No stroke, no text, no gradients, no filters, no opacity, no transform, no clipPath, no <use>.
- Use exactly ${colors} different fill colours in total: a harmonious palette that suits the style. Neighbouring shapes should usually differ in colour.
- ${LEVEL_SHAPES[level]}. Later shapes are painted over earlier ones. Every shape must be big enough to hold a small number (at least 18 units across).
- A clear, charming composition that fills the page: a main subject in the middle, a decorative background (sky, stars, patterns, plants) around it.
- Style: ${styleOf(style).prompt} Do not copy any existing character or brand.`;
  let last = 0;
  const { text } = await s(prompt, {
    signal, modelTier: 'complex', cache: false,
    onText: (e) => { if (e.text.length - last > 400) { last = e.text.length; onProgress(e.text.length); } },
  });
  const m = text.match(/<svg[\s\S]*<\/svg>/i);
  if (!m) throw new Error('קלוד לא החזיר ציור. ננסה שוב?');
  return m[0];
}

/** Keep only plain shapes and solid fills: drawing must never run anything. */
function sanitize(svg: string): { svg: string; palette: string[] } {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('הציור שהתקבל פגום. ננסה שוב?');
  const ok = new Set(['svg', 'g', 'rect', 'circle', 'ellipse', 'polygon', 'path']);
  const attrs = new Set(['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'd', 'fill', 'viewBox', 'xmlns']);
  const counts = new Map<string, number>();
  const walk = (el: Element) => {
    for (const k of [...el.children]) {
      if (!ok.has(k.nodeName.toLowerCase())) { k.remove(); continue; }
      for (const a of [...k.attributes]) if (!attrs.has(a.name)) k.removeAttribute(a.name);
      const f = (k.getAttribute('fill') ?? '').trim().toLowerCase();
      if (k.nodeName !== 'g') {
        if (!/^#[0-9a-f]{6}$|^#[0-9a-f]{3}$/.test(f)) k.setAttribute('fill', '#ffffff');
        const hex = full(k.getAttribute('fill')!);
        k.setAttribute('fill', hex);
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
      }
      walk(k);
    }
  };
  for (const a of [...root.attributes]) if (!attrs.has(a.name)) root.removeAttribute(a.name);
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('viewBox', '0 0 1000 1400');
  root.setAttribute('width', String(W)); root.setAttribute('height', String(H));
  root.setAttribute('shape-rendering', 'crispEdges');
  walk(root);
  const palette = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return { svg: new XMLSerializer().serializeToString(root), palette };
}

function full(hex: string): string {
  const h = hex.toLowerCase();
  return h.length === 4 ? '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h;
}

async function svgCanvas(svg: string): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('שמירה נכשלה'))), 'image/png'));

/**
 * Coloured picture → line art + numbers + key. Each pixel is snapped to the
 * nearest palette colour; wherever neighbours differ there is a line.
 */
export async function pageFromPicture(fillCanvas: HTMLCanvasElement, palette: string[], maxColors: number) {
  const pal = palette.slice(0, Math.max(2, maxColors)).map(hexToRgb);
  const ctx = fillCanvas.getContext('2d', { willReadFrequently: true })!;
  const src = ctx.getImageData(0, 0, W, H).data;
  const idx = new Uint8Array(W * H);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    let best = 0, bd = 1e9;
    for (let k = 0; k < pal.length; k++) {
      const dr = src[i] - pal[k][0], dg = src[i + 1] - pal[k][1], db = src[i + 2] - pal[k][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; best = k; }
    }
    idx[p] = best;
  }
  // smooth the snapped colours a little so anti-aliased edges don't make specks
  const lines = new Uint8Array(W * H);
  const LW = 2; // half line width in px → about 4-5 px lines on a 1600 px page
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x;
    if (idx[p] !== idx[p + 1] || idx[p] !== idx[p + W]) {
      for (let dy = -LW; dy <= LW; dy++) for (let dx = -LW; dx <= LW; dx++) {
        if (dx * dx + dy * dy > LW * LW + 1) continue;
        const q = (y + dy) * W + (x + dx);
        if (q >= 0 && q < W * H) lines[q] = 1;
      }
    }
  }
  // page frame
  const M = 24;
  for (let y = M; y < H - M; y++) for (let t = 0; t < 5; t++) { lines[y * W + M + t] = 1; lines[y * W + W - M - 1 - t] = 1; }
  for (let x = M; x < W - M; x++) for (let t = 0; t < 5; t++) { lines[(M + t) * W + x] = 1; lines[(H - M - 1 - t) * W + x] = 1; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < M || y < M || x >= W - M || y >= H - M) lines[y * W + x] = 0;

  const art = document.createElement('canvas'); art.width = W; art.height = H;
  const actx = art.getContext('2d')!;
  const out = actx.createImageData(W, H);
  for (let p = 0; p < W * H; p++) { const v = lines[p] ? 20 : 255; out.data[p * 4] = out.data[p * 4 + 1] = out.data[p * 4 + 2] = v; out.data[p * 4 + 3] = 255; }
  actx.putImageData(out, 0, 0);

  const map = labelRegions(binarize(out.data, W, H), W, H);
  const used = new Set<number>();
  const labels: Label[] = [];
  for (let id = 1; id <= map.count; id++) {
    const b = map.boxes[id];
    if (map.areas[id] < 260 || b.x === 0 || b.y === 0) continue; // the margin outside the frame
    const oc = opticalCenter(map, id);
    if (oc.dist < 9) continue;
    const k = idx[Math.round(oc.y) * W + Math.round(oc.x)];
    used.add(k);
    labels.push({ value: String(k + 1), x: oc.x, y: oc.y, size: Math.max(22, Math.min(80, oc.dist * 1.1)), confidence: 1 });
  }
  const legend: LegendEntry[] = palette.slice(0, pal.length).map((c, k) => ({ label: String(k + 1), color: full(c) })).filter((_, k) => used.has(k));
  // the solution is the snapped picture, with the outlines on top
  const sol = document.createElement('canvas'); sol.width = W; sol.height = H;
  const sctx = sol.getContext('2d')!;
  const sd = sctx.createImageData(W, H);
  for (let p = 0; p < W * H; p++) {
    const [r, g, b] = lines[p] ? [20, 20, 20] : pal[idx[p]];
    sd.data[p * 4] = r; sd.data[p * 4 + 1] = g; sd.data[p * 4 + 2] = b; sd.data[p * 4 + 3] = 255;
  }
  sctx.putImageData(sd, 0, 0);
  return { art, labels, legend, solution: sol };
}

export interface MakeOpts { level: Level; colors: number; style?: ArtStyle; signal?: AbortSignal; progress?: (m: string) => void }

/** One finished page record (not yet saved). */
export async function makePage(bookId: string, idea: string, title: string, o: MakeOpts): Promise<PageRec> {
  const provider = prefs.get<Provider>('imgProvider', 'claude');
  let fill: HTMLCanvasElement, palette: string[];
  if (provider !== 'claude' && prefs.get('imgKey.' + provider, '')) {
    o.progress?.(provider === 'openai' ? 'OpenAI מצייר…' : 'Gemini מצייר…');
    fill = await rasterFromApi(provider, idea, o.level, o.colors, o.signal, o.style);
    o.progress?.('מסדרת קווים, אזורים ומספרים…');
    palette = quantize(fill, o.colors);
  } else {
    o.progress?.('קלוד מצייר…');
    const raw = await drawSvg(idea, o.level, o.colors, (n) => o.progress?.(`קלוד מצייר… (${Math.round(n / 100)})`), o.signal, o.style);
    o.progress?.('מסדרת קווים, אזורים ומספרים…');
    const clean = sanitize(raw);
    palette = clean.palette;
    fill = await svgCanvas(clean.svg);
  }
  const { art, labels, legend, solution } = await pageFromPicture(fill, palette, o.colors);
  if (labels.length < 4) throw new Error('הציור יצא פשוט מדי. ננסה שוב?');
  return {
    id: uid('p'), bookId, kind: 'coloring', width: W, height: H, image: await toBlob(art),
    labels, legend, numbersInImage: false, solution: await toBlob(solution), title,
  };
}

/** Add pages to an existing book or start a new one in "החוברות האישיות שלי". */
export async function savePages(target: { bookId: string } | { title: string; coverColor: string; categoryId: string; style?: string; music?: boolean }, pages: PageRec[]): Promise<BookMeta> {
  if ('bookId' in target) {
    const book = await store.book(target.bookId);
    if (!book) throw new Error('החוברת לא נמצאה');
    for (const p of pages) await store.putPage({ ...p, bookId: book.id });
    const back = book.pageIds.length && (await store.page(book.pageIds[book.pageIds.length - 1]))?.kind === 'back';
    const ids = back ? [...book.pageIds.slice(0, -1), ...pages.map((p) => p.id), book.pageIds[book.pageIds.length - 1]] : [...book.pageIds, ...pages.map((p) => p.id)];
    const next = { ...book, pageIds: ids };
    await store.putBook(next);
    return next;
  }
  const bookId = pages[0]?.bookId ?? uid('b');
  for (const p of pages) await store.putPage({ ...p, bookId });
  const book: BookMeta = {
    id: bookId, categoryId: target.categoryId, title: target.title, coverColor: target.coverColor, direction: 'rtl',
    madeWithClaude: true, pageIds: pages.map((p) => p.id), createdAt: Date.now(), style: target.style, music: target.music,
  };
  await store.putBook(book);
  return book;
}

// ---------------- optional image APIs (her own key, kept only on this device) ----------------
export type Provider = 'claude' | 'openai' | 'gemini';

function imagePrompt(idea: string, level: Level, colors: number, style?: ArtStyle): string {
  return `An original color-by-number illustration for a coloring book: ${idea}. ${styleOf(style).prompt} ` +
    `Flat solid colour areas only, exactly ${colors} distinct colours, no outlines, no gradients, no shading, no texture, no text. ` +
    `${level === 1 ? 'Few large simple shapes.' : level === 2 ? 'A moderate number of medium shapes.' : 'Many small detailed shapes.'} Portrait page, full composition.`;
}

async function rasterFromApi(provider: 'openai' | 'gemini', idea: string, level: Level, colors: number, signal?: AbortSignal, style?: ArtStyle): Promise<HTMLCanvasElement> {
  const key = prefs.get('imgKey.' + provider, '');
  let b64 = '';
  try {
    if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: 'gpt-image-1', prompt: imagePrompt(idea, level, colors, style), size: '1024x1536', n: 1 }),
      });
      const j = await r.json();
      if (!r.ok) throw apiError(r.status, j?.error?.code || j?.error?.message);
      b64 = j.data?.[0]?.b64_json ?? '';
    } else {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: imagePrompt(idea, level, colors, style) }] }], generationConfig: { responseModalities: ['IMAGE'] } }),
      });
      const j = await r.json();
      if (!r.ok) throw apiError(r.status, j?.error?.status);
      b64 = j.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data: string } }) => p.inlineData)?.inlineData?.data ?? '';
      if (!b64 && j.candidates?.[0]?.finishReason) throw apiError(400, 'content_policy');
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    if ((e as { he?: boolean }).he) throw e;
    throw new Error('אין גישה לשירות התמונות מכאן. אפשר לחזור ליצירה עם קלוד בהגדרות.');
  }
  if (!b64) throw new Error('השירות לא החזיר תמונה. ננסה שוב?');
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  x.filter = 'blur(2px)';
  x.drawImage(img, (W - img.naturalWidth * sc) / 2, (H - img.naturalHeight * sc) / 2, img.naturalWidth * sc, img.naturalHeight * sc);
  return c;
}

function apiError(status: number, code?: string): Error {
  const c = String(code ?? '').toLowerCase();
  const msg = status === 401 || status === 403 ? 'המפתח לא התקבל. בדקי אותו בהגדרות.'
    : status === 429 ? 'נגמרה המכסה או שיש עומס. ננסה שוב מאוחר יותר.'
    : c.includes('policy') || c.includes('safety') || c.includes('moderation') ? 'השירות סירב לצייר את הרעיון הזה. ננסה רעיון אחר?'
    : 'שירות התמונות החזיר שגיאה. ננסה שוב?';
  return Object.assign(new Error(msg), { he: true });
}

/** k-means on a small copy: the N main colours of a raster picture. */
function quantize(c: HTMLCanvasElement, k: number): string[] {
  const t = document.createElement('canvas'); t.width = 160; t.height = 224;
  const x = t.getContext('2d', { willReadFrequently: true })!; x.drawImage(c, 0, 0, 160, 224);
  const d = x.getImageData(0, 0, 160, 224).data;
  const px: number[][] = []; for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
  let cents = Array.from({ length: k }, (_, i) => px[Math.floor((i + 0.5) * px.length / k)].slice());
  for (let it = 0; it < 12; it++) {
    const sum = cents.map(() => [0, 0, 0, 0]);
    for (const p of px) {
      let b = 0, bd = 1e9;
      for (let j = 0; j < k; j++) { const q = cents[j]; const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (dd < bd) { bd = dd; b = j; } }
      sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2] += p[2]; sum[b][3]++;
    }
    cents = sum.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cents[j]));
  }
  return cents.map((q) => '#' + q.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
}
