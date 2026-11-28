/**
 * Find the printed numbers and letters on a cleaned coloring page, so the lamp
 * can light up every area of one colour in books she imports herself.
 *
 * Small isolated ink shapes are compared with the label characters drawn in a
 * few common fonts. The best matches then teach the page's own font: their
 * average becomes the template, and the page is read again (a few rounds).
 * Every label found is marked uncertain, since the reading is automatic.
 */
import type { Label } from './types';

const TW = 12, TH = 16;
type Patch = Float32Array;
interface Cand { q: Patch; ar: number; x: number; y: number; h: number }
interface Tpl { v: string; t: Patch; ar: number }

function norm(a: Float32Array): Float32Array {
  let m = 0; for (const v of a) m += v; m /= a.length;
  let s = 0; for (let i = 0; i < a.length; i++) { a[i] -= m; s += a[i] * a[i]; }
  s = Math.sqrt(s) || 1; for (let i = 0; i < a.length; i++) a[i] /= s;
  return a;
}

/** Area-average a w×h ink grid (1 = ink) down to TW×TH. */
function shrink(ink: Float32Array, w: number, h: number): Patch {
  const out = new Float32Array(TW * TH);
  for (let ty = 0; ty < TH; ty++) {
    const y0 = ty * h / TH, y1 = (ty + 1) * h / TH;
    for (let tx = 0; tx < TW; tx++) {
      const x0 = tx * w / TW, x1 = (tx + 1) * w / TW;
      let s = 0, n = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          s += ink[y * w + x] * wx * wy; n += wx * wy;
        }
      }
      out[ty * TW + tx] = n ? s / n : 0;
    }
  }
  return norm(out);
}

let fontTpl: Tpl[] | null = null; let fontKey = '';
function fontTemplates(values: string[]): Tpl[] {
  const key = values.join('');
  if (fontTpl && fontKey === key) return fontTpl;
  const c = document.createElement('canvas'); c.width = 120; c.height = 120;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const out: Tpl[] = [];
  for (const f of ['bold 72px Arial, Helvetica, sans-serif', '72px Arial, Helvetica, sans-serif', 'bold 72px Verdana, sans-serif', '72px "Trebuchet MS", sans-serif']) {
    for (const v of values) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 120, 120);
      ctx.fillStyle = '#fff'; ctx.font = f; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.fillText(v, 60, 60);
      const d = ctx.getImageData(0, 0, 120, 120).data;
      let x0 = 120, y0 = 120, x1 = -1, y1 = -1;
      for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) if (d[(y * 120 + x) * 4] > 100) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) continue;
      const w = x1 - x0 + 1, h = y1 - y0 + 1, ink = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ink[y * w + x] = d[((y + y0) * 120 + x + x0) * 4] / 255;
      out.push({ v, t: shrink(ink, w, h), ar: w / h });
    }
  }
  fontTpl = out; fontKey = key;
  return out;
}

function rank(c: Cand, tpl: Tpl[]): [string, number][] {
  const best = new Map<string, number>();
  for (const t of tpl) {
    let s = 0; for (let i = 0; i < t.t.length; i++) s += c.q[i] * t.t[i];
    s -= 0.5 * Math.abs(Math.log(c.ar / t.ar));
    if (s > (best.get(t.v) ?? -9)) best.set(t.v, s);
  }
  return [...best.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Read the labels on `art` (black lines on white). `values` are the labels of
 * the page's colour key. `area` limits the search to the drawing (pixels).
 */
export function detectLabels(art: HTMLCanvasElement, values: string[], area = art.height, opt: { blur?: number; ink?: number } = {}): Label[] {
  if (!values.length) return [];
  const k = Math.min(1, 3000 / Math.max(art.width, area));
  const W = Math.round(art.width * k), H = Math.round(area * k);
  const t = document.createElement('canvas'); t.width = W; t.height = H;
  const tc = t.getContext('2d', { willReadFrequently: true })!;
  tc.fillStyle = '#fff'; tc.fillRect(0, 0, W, H);
  if (opt.blur) tc.filter = `blur(${opt.blur}px)`;
  tc.drawImage(art, 0, 0, art.width, area, 0, 0, W, H);
  const px = tc.getImageData(0, 0, W, H).data;
  const dark = new Uint8Array(W * H);
  const ink3 = 3 * (opt.ink ?? 160);
  for (let i = 0, p = 0; p < dark.length; i += 4, p++) dark[p] = px[i] + px[i + 1] + px[i + 2] < ink3 ? 1 : 0;

  // connected ink shapes, keeping only small ones
  const lab = new Int32Array(W * H);
  const stack = new Int32Array(W * H);
  const minH = 0.003 * H, maxH = 0.02 * H;
  const cands: Cand[] = [];
  let id = 0;
  for (let s = 0; s < dark.length; s++) {
    if (!dark[s] || lab[s]) continue;
    id++; let sp = 0; stack[sp++] = s; lab[s] = id;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
    while (sp) {
      const p = stack[--sp]; n++;
      const x = p % W, y = (p - x) / W;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= W) continue;
          const q = yy * W + xx;
          if (dark[q] && !lab[q]) { lab[q] = id; stack[sp++] = q; }
        }
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (h < minH || h > maxH) continue;
    const ar = w / h; if (ar < 0.15 || ar > 1.1) continue;
    const fill = n / (w * h); if (fill < 0.15 || fill > 0.8) continue;
    // a label sits on its own, with paper around it
    const pad = Math.round(h * 0.5);
    let ring = 0;
    for (let y = Math.max(0, y0 - pad); y <= Math.min(H - 1, y1 + pad); y++)
      for (let x = Math.max(0, x0 - pad); x <= Math.min(W - 1, x1 + pad); x++) if (dark[y * W + x] && lab[y * W + x] !== id) ring++;
    if (ring > 0.6 * n) continue;
    const ink = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lab[(y + y0) * W + x + x0] === id) ink[y * w + x] = 1;
    cands.push({ q: shrink(ink, w, h), ar, x: (x0 + x1 + 1) / 2 / k, y: (y0 + y1 + 1) / 2 / k, h: h / k });
  }
  if (!cands.length) return [];

  const fonts = fontTemplates(values);
  let seeds = new Map<string, Cand[]>();
  for (const c of cands) {
    const r = rank(c, fonts);
    if (r[0][1] > 0.7 && (r.length < 2 || r[0][1] - r[1][1] > 0.05)) { const l = seeds.get(r[0][0]) ?? []; l.push(c); seeds.set(r[0][0], l); }
  }
  let found: Label[] = [];
  for (let round = 0; round < 4; round++) {
    const tpl: Tpl[] = [];
    for (const [v, list] of seeds) {
      if (list.length < 2) continue;
      const sum = new Float32Array(TW * TH); let la = 0;
      for (const c of list) { for (let i = 0; i < sum.length; i++) sum[i] += c.q[i]; la += Math.log(c.ar); }
      tpl.push({ v, t: norm(sum), ar: Math.exp(la / list.length) });
    }
    const have = new Set(tpl.map((t) => t.v));
    tpl.push(...fonts.filter((t) => !have.has(t.v)));
    found = []; seeds = new Map();
    for (const c of cands) {
      const r = rank(c, tpl);
      if (r[0][1] > 0.66 && (r.length < 2 || r[0][1] - r[1][1] > 0.04)) {
        found.push({ value: r[0][0], x: Math.round(c.x), y: Math.round(c.y), size: Math.round(c.h * 1.4), confidence: Math.round(r[0][1] * 100) / 100, uncertain: true });
        const l = seeds.get(r[0][0]) ?? []; l.push(c); seeds.set(r[0][0], l);
      }
    }
  }
  // a handful of shapes is more likely noise than a numbered page
  return found.length >= 4 ? found : [];
}
