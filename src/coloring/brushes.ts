/** Brush rendering: grainy coloured pencil, even marker, round eraser. */

export type ToolName = 'pencil' | 'marker' | 'eraser' | 'picker';

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

function pencilPattern(ctx: CanvasRenderingContext2D, color: string): CanvasPattern {
  const hit = patterns.get(color);
  if (hit) return hit;
  const m = grainMask();
  const c = document.createElement('canvas');
  c.width = m.width; c.height = m.height;
  const x = c.getContext('2d')!;
  x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(m, 0, 0);
  const p = ctx.createPattern(c, 'repeat')!;
  if (patterns.size > 40) patterns.clear();
  patterns.set(color, p);
  return p;
}

export interface BrushOpts { tool: ToolName; color: string; diameter: number }

/** Draw one segment a→b on the stroke canvas. Returns the dirty rect. */
export function drawSegment(ctx: CanvasRenderingContext2D, o: BrushOpts, a: StrokePoint, b: StrokePoint, first: boolean):
  { x: number; y: number; w: number; h: number } {
  const D = o.diameter;
  if (o.tool === 'pencil') {
    ctx.fillStyle = pencilPattern(ctx, o.color);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    let maxR = 0;
    const rOf = (pt: StrokePoint) => (D / 2) * (0.35 + 0.65 * pt.p) * (1 + 1.3 * pt.tilt);
    const step = Math.max(1, rOf(b) * 0.22);
    const n = first ? 1 : Math.max(1, Math.ceil(dist / step));
    for (let i = first ? 0 : 1; i <= n; i++) {
      const t = n ? i / n : 1;
      const pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: a.p + (b.p - a.p) * t, tilt: a.tilt + (b.tilt - a.tilt) * t };
      const r = rOf(pt);
      maxR = Math.max(maxR, r);
      ctx.globalAlpha = Math.min(1, (0.1 + 0.42 * pt.p) * (1 - 0.45 * pt.tilt));
      ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return box(a, b, maxR + 2);
  }
  // marker and eraser: solid round segments, width by pressure
  const w = D * (o.tool === 'eraser' ? 1 : 0.45 + 0.55 * b.p);
  ctx.strokeStyle = o.tool === 'eraser' ? '#fffdf8' : o.color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = w;
  if (first) { ctx.beginPath(); ctx.arc(b.x, b.y, w / 2, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  return box(a, b, w / 2 + 2);
}

function box(a: StrokePoint, b: StrokePoint, r: number) {
  const x = Math.min(a.x, b.x) - r, y = Math.min(a.y, b.y) - r;
  return { x, y, w: Math.abs(a.x - b.x) + 2 * r, h: Math.abs(a.y - b.y) + 2 * r };
}
