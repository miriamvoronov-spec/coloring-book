/**
 * Demo book drawn in code (no purchased pages are embedded in the app):
 * line art with closed regions, numbers placed at each region's optical
 * centre, and a legend.
 */
import { binarize, labelRegions, opticalCenter, regionAt } from './raster';
import type { BookMeta, Label, LegendEntry, PageRec } from './types';
import { uid } from './store';

const W = 1600, H = 2240, LW = 8;

type Seed = [number, number, string];

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = LW; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = '#111';
  return [c, ctx];
}

function shape(ctx: CanvasRenderingContext2D, build: (ctx: CanvasRenderingContext2D) => void) {
  ctx.beginPath(); build(ctx); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
}

/** Union of circles with a single outline (clouds, tree crowns). */
function blob(ctx: CanvasRenderingContext2D, circles: [number, number, number][]) {
  ctx.fillStyle = '#111';
  for (const [x, y, r] of circles) { ctx.beginPath(); ctx.arc(x, y, r + LW / 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#fff';
  for (const [x, y, r] of circles) { ctx.beginPath(); ctx.arc(x, y, r - LW / 2, 0, Math.PI * 2); ctx.fill(); }
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot = 0) {
  shape(ctx, (c) => {
    for (let i = 0; i < 10; i++) {
      const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
  });
}

function border(ctx: CanvasRenderingContext2D) {
  ctx.lineWidth = LW * 1.4;
  ctx.strokeRect(50, 50, W - 100, H - 100);
  ctx.lineWidth = LW;
}

function balloonPage(): [HTMLCanvasElement, Seed[]] {
  const [c, ctx] = canvas();
  border(ctx);
  const seeds: Seed[] = [[200, 900, '1'], [1400, 1100, '1'], [800, 150, '1']];
  // sun
  shape(ctx, (k) => k.arc(290, 330, 130, 0, Math.PI * 2)); seeds.push([290, 330, '3']);
  // clouds
  blob(ctx, [[1150, 300, 90], [1260, 260, 110], [1370, 310, 85], [1250, 350, 80]]); seeds.push([1260, 290, '2']);
  blob(ctx, [[260, 1080, 70], [350, 1040, 90], [440, 1090, 70]]); seeds.push([350, 1070, '2']);
  // stars
  star(ctx, 620, 230, 70, 0.2); seeds.push([620, 238, '3']);
  star(ctx, 1460, 640, 60, -0.2); seeds.push([1460, 646, '3']);
  star(ctx, 160, 620, 50, 0.1); seeds.push([160, 626, '3']);
  // hills, back to front
  shape(ctx, (k) => { k.moveTo(50, 1600); k.bezierCurveTo(400, 1380, 800, 1420, 1100, 1560); k.bezierCurveTo(1300, 1640, 1450, 1500, W - 50, 1480); k.lineTo(W - 50, H - 50); k.lineTo(50, H - 50); });
  seeds.push([1350, 1620, '6']);
  shape(ctx, (k) => { k.moveTo(50, 1820); k.bezierCurveTo(450, 1650, 900, 1700, W - 50, 1860); k.lineTo(W - 50, H - 50); k.lineTo(50, H - 50); });
  seeds.push([300, 1850, '7']);
  shape(ctx, (k) => { k.moveTo(50, 2040); k.bezierCurveTo(500, 1960, 1000, 2080, W - 50, 1980); k.lineTo(W - 50, H - 50); k.lineTo(50, H - 50); });
  seeds.push([800, 2120, '6']);
  // trees on the middle hill
  for (const [tx, ty] of [[1180, 1760], [1380, 1800]]) {
    shape(ctx, (k) => k.rect(tx - 22, ty - 20, 44, 120)); seeds.push([tx, ty + 60, '8']);
    blob(ctx, [[tx, ty - 90, 70], [tx - 55, ty - 40, 50], [tx + 55, ty - 40, 50]]); seeds.push([tx, ty - 70, '7']);
  }
  // balloon envelope
  const env = (k: CanvasRenderingContext2D) => {
    k.moveTo(800, 1290);
    k.bezierCurveTo(560, 1130, 360, 900, 380, 680);
    k.bezierCurveTo(400, 420, 600, 300, 800, 300);
    k.bezierCurveTo(1000, 300, 1200, 420, 1220, 680);
    k.bezierCurveTo(1240, 900, 1040, 1130, 800, 1290);
  };
  shape(ctx, env);
  ctx.save(); ctx.beginPath(); env(ctx); ctx.closePath(); ctx.clip();
  const gores = [-0.62, -0.2, 0.2, 0.62];
  for (const g of gores) {
    ctx.beginPath(); ctx.moveTo(800, 300);
    ctx.bezierCurveTo(800 + g * 520, 520, 800 + g * 520, 940, 800, 1290);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(300, 860); ctx.bezierCurveTo(600, 960, 1000, 960, 1300, 860); ctx.stroke();
  ctx.restore();
  ctx.beginPath(); env(ctx); ctx.closePath(); ctx.stroke();
  const goreX = [470, 640, 800, 960, 1130];
  goreX.forEach((x, i) => {
    seeds.push([x, 640, i % 2 ? '5' : '4']);
    if (i > 0 && i < 4) seeds.push([x, 1040, i % 2 ? '4' : '5']);
  });
  // ropes + basket
  ctx.beginPath();
  ctx.moveTo(735, 1250); ctx.lineTo(730, 1430);
  ctx.moveTo(865, 1250); ctx.lineTo(870, 1430);
  ctx.stroke();
  shape(ctx, (k) => { k.moveTo(700, 1430); k.lineTo(900, 1430); k.lineTo(880, 1560); k.lineTo(720, 1560); });
  ctx.beginPath(); ctx.moveTo(706, 1470); ctx.lineTo(894, 1470); ctx.stroke();
  seeds.push([800, 1515, '8'], [800, 1450, '5']);
  return [c, seeds];
}

function flowerPage(): [HTMLCanvasElement, Seed[]] {
  const [c, ctx] = canvas();
  border(ctx);
  const cx = W / 2, cy = 1040;
  const seeds: Seed[] = [[140, 140, '6'], [W - 140, 140, '6'], [140, H - 140, '6'], [W - 140, H - 140, '6']];
  shape(ctx, (k) => k.arc(cx, cy, 700, 0, Math.PI * 2));
  seeds.push([cx, cy - 650, '1'], [cx, cy + 650, '1'], [cx - 650, cy, '1'], [cx + 650, cy, '1']);
  const petals = (n: number, dist: number, rx: number, ry: number, value: string, offset: number) => {
    for (let i = 0; i < n; i++) {
      const a = offset + (i * 2 * Math.PI) / n;
      const px = cx + Math.cos(a) * dist, py = cy + Math.sin(a) * dist;
      shape(ctx, (k) => k.ellipse(px, py, rx, ry, a, 0, Math.PI * 2));
      seeds.push([cx + Math.cos(a) * (dist + rx * 0.45), cy + Math.sin(a) * (dist + rx * 0.45), value]);
    }
  };
  petals(12, 420, 200, 90, '7', Math.PI / 12);
  petals(8, 280, 190, 105, '5', 0);
  petals(8, 170, 120, 70, '4', Math.PI / 8);
  shape(ctx, (k) => k.arc(cx, cy, 120, 0, Math.PI * 2));
  shape(ctx, (k) => k.arc(cx, cy, 55, 0, Math.PI * 2));
  seeds.push([cx, cy, '8'], [cx, cy - 88, '3']);
  // small stars in the corners of the frame circle
  for (const [x, y] of [[300, 300], [W - 300, 300], [300, H - 300], [W - 300, H - 300]]) {
    star(ctx, x, y, 70); seeds.push([x, y + 6, '3']);
  }
  return [c, seeds];
}

function labelsFrom(c: HTMLCanvasElement, seeds: Seed[]): Label[] {
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const map = labelRegions(binarize(img.data, c.width, c.height), c.width, c.height);
  const used = new Set<number>();
  const out: Label[] = [];
  for (const [x, y, v] of seeds) {
    const id = regionAt(map, x, y);
    if (!id || used.has(id)) continue;
    used.add(id);
    const oc = opticalCenter(map, id);
    out.push({ value: v, x: oc.x, y: oc.y, size: Math.max(30, Math.min(84, oc.dist * 1.15)), confidence: 1 });
  }
  return out;
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));

/** Midnight-blue leather with gold tooling. */
export const DEMO_COVER = '#1f2c5c';

export const DEMO_LEGEND: LegendEntry[] = [
  { label: '1', color: '#8fd3f4' },
  { label: '2', color: '#efe9ff' },
  { label: '3', color: '#ffd23f' },
  { label: '4', color: '#ef476f' },
  { label: '5', color: '#ff9f1c' },
  { label: '6', color: '#9bd770' },
  { label: '7', color: '#3a9d5d' },
  { label: '8', color: '#a0522d' },
];

export async function makeDemoBook(categoryId: string): Promise<{ book: BookMeta; pages: PageRec[] }> {
  const bookId = uid('b');
  const pages: PageRec[] = [];
  const defs: [string, () => [HTMLCanvasElement, Seed[]]][] = [['בלון קסום', balloonPage], ['פרח הכוכבים', flowerPage]];
  for (const [title, fn] of defs) {
    const [c, seeds] = fn();
    pages.push({
      id: uid('p'), bookId, kind: 'coloring', width: W, height: H, image: await toBlob(c),
      labels: labelsFrom(c, seeds), legend: DEMO_LEGEND, numbersInImage: false, title,
    });
  }
  const book: BookMeta = {
    id: bookId, categoryId, title: 'חוברת הדמו הקסומה', coverColor: DEMO_COVER, direction: 'rtl',
    madeWithClaude: true, pageIds: pages.map((p) => p.id), createdAt: Date.now(), demo: true,
  };
  return { book, pages };
}
