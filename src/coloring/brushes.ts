/** Brush rendering: marker, coloured pencil, crayon, soft brush, fine pen, highlighter, eraser. */

export type ToolName = 'pencil' | 'marker' | 'eraser' | 'picker' | 'crayon' | 'brush' | 'pen' | 'highlighter';

/** Every tool, in menu order. Which ones show in the menu is her choice in Settings. */
export const ALL_TOOLS: { id: ToolName; name: string; hint: string }[] = [
  { id: 'marker', name: 'טוש', hint: 'כיסוי אחיד, רגיש ללחץ' },
  { id: 'eraser', name: 'מחק', hint: 'מוחק בשכבה הנוכחית' },
  { id: 'picker', name: 'דוגם צבע', hint: 'לוקח צבע מהדף' },
  { id: 'pencil', name: 'עיפרון צבעוני', hint: 'מרקם גרעיני, רגיש ללחץ ולהטיה' },
  { id: 'crayon', name: 'פסטל שעוונים', hint: 'מרקם גס ועשיר' },
  { id: 'brush', name: 'מברשת רכה', hint: 'קצוות רכים, נבנה בהדרגה' },
  { id: 'pen', name: 'עט דק', hint: 'קו דק ואחיד לפרטים' },
  { id: 'highlighter', name: 'מדגש שקוף', hint: 'צבע שקוף שמראה את מה שמתחת' },
];
export const DEFAULT_TOOLS: ToolName[] = ['marker', 'eraser', 'picker'];

export interface StrokePoint { x: number; y: number; p: number; tilt: number }

let grain: HTMLCanvasElement | null = null;
const patterns = new Map<string, CanvasPattern>();

/** Paper-tooth alpha mask: value noise at two scales, thresholded softly. */
function grainMask(): HTMLCanvasElement {
  if (grain) return grain;
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const rnd = (n: number) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = Math.random(); return a; };
  const g1 = rnd(32), g2 = rnd(128);
  const sample = (g: Float32Array, n: number, x: number, y: number) => {
    const fx = (x / N) * n, fy = (y / N) * n;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const at = (xx: number, yy: number) => g[((yy + n) % n) * n + ((xx + n) % n)];
    const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = 0.45 * sample(g1, 32, x, y) + 0.35 * sample(g2, 128, x, y) + 0.2 * Math.random();
    const a = Math.max(0, Math.min(1, (v - 0.28) / 0.42));
    img.data[(y * N + x) * 4 + 3] = Math.round(Math.pow(a, 1.3) * 255);
  }
  ctx.putImageData(img, 0, 0);
  grain = c;
  return c;
}

let coarse: HTMLCanvasElement | null = null;
/** A rougher, bigger paper tooth for crayons. */
function coarseMask(): HTMLCanvasElement {
  if (coarse) return coarse;
  const m = grainMask();
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = true;
  x.drawImage(m, 0, 0, 128, 128, 0, 0, 256, 256);
  const img = x.getImageData(0, 0, 256, 256);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 70 ? 255 : img.data[i] * 2;
  x.putImageData(img, 0, 0);
  coarse = c;
  return c;
}

function pencilPattern(ctx: CanvasRenderingContext2D, color: string, rough = false): CanvasPattern {
  const key = (rough ? 'r' : 'p') + color;
  const hit = patterns.get(key);
  if (hit) return hit;
  const m = rough ? coarseMask() : grainMask();
  const c = document.createElement('canvas');
  c.width = m.width; c.height = m.height;
  const x = c.getContext('2d')!;
  x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(m, 0, 0);
  const p = ctx.createPattern(c, 'repeat')!;
  if (patterns.size > 40) patterns.clear();
  patterns.set(key, p);
  return p;
}

export interface BrushOpts { tool: ToolName; color: string; diameter: number }

/** Draw one segment a→b on the stroke canvas. Returns the dirty rect. */
export function drawSegment(ctx: CanvasRenderingContext2D, o: BrushOpts, a: StrokePoint, b: StrokePoint, first: boolean):
  { x: number; y: number; w: number; h: number } {
  const D = o.diameter;
  if (o.tool === 'brush') {
    // soft round dabs that build up
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const r = (D / 2) * (0.6 + 0.6 * b.p);
    const step = Math.max(1, r * 0.25);
    const n = first ? 1 : Math.max(1, Math.ceil(dist / step));
    for (let i = first ? 0 : 1; i <= n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, hexA(o.color, 0.16 + 0.14 * b.p)); g.addColorStop(0.55, hexA(o.color, 0.08)); g.addColorStop(1, hexA(o.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    return box(a, b, r + 2);
  }
  if (o.tool === 'pencil' || o.tool === 'crayon') {
    const crayon = o.tool === 'crayon';
    ctx.fillStyle = pencilPattern(ctx, o.color, crayon);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    let maxR = 0;
    const rOf = (pt: StrokePoint) => (D / 2) * (crayon ? 0.7 + 0.5 * pt.p : (0.35 + 0.65 * pt.p) * (1 + 1.3 * pt.tilt));
    const step = Math.max(1, rOf(b) * 0.22);
    const n = first ? 1 : Math.max(1, Math.ceil(dist / step));
    for (let i = first ? 0 : 1; i <= n; i++) {
      const t = n ? i / n : 1;
      const pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: a.p + (b.p - a.p) * t, tilt: a.tilt + (b.tilt - a.tilt) * t };
      const r = rOf(pt);
      maxR = Math.max(maxR, r);
      ctx.globalAlpha = crayon ? Math.min(1, 0.45 + 0.4 * pt.p) : Math.min(1, (0.1 + 0.42 * pt.p) * (1 - 0.45 * pt.tilt));
      ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return box(a, b, maxR + 2);
  }
  // marker, pen, highlighter and eraser: solid round segments
  const w = o.tool === 'eraser' ? D : o.tool === 'pen' ? Math.max(1.5, D * 0.22) : o.tool === 'highlighter' ? D * 1.1 : D * (0.45 + 0.55 * b.p);
  ctx.strokeStyle = o.tool === 'eraser' ? '#fffdf8' : o.color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineCap = o.tool === 'highlighter' ? 'square' : 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = w;
  if (first) { ctx.beginPath(); ctx.arc(b.x, b.y, w / 2, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  return box(a, b, w / 2 + 2);
}

function box(a: StrokePoint, b: StrokePoint, r: number) {
  const x = Math.min(a.x, b.x) - r, y = Math.min(a.y, b.y) - r;
  return { x, y, w: Math.abs(a.x - b.x) + 2 * r, h: Math.abs(a.y - b.y) + 2 * r };
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
