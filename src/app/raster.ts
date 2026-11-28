/**
 * Pure raster helpers for line art: binarise, find closed regions, build
 * "inside the lines" masks and place numbers. No DOM here, so it is testable.
 */

export interface Rect { x: number; y: number; w: number; h: number }

export interface RegionMap {
  width: number;
  height: number;
  /** 1 where there is a line pixel. */
  lines: Uint8Array;
  /** Region id per pixel, 0 on lines. Ids start at 1. */
  ids: Int32Array;
  count: number;
  /** Bounding box per region id (index 0 unused). */
  boxes: Rect[];
  areas: number[];
}

/** RGBA → 1 for dark pixels (lines). Transparent counts as white. */
export function binarize(rgba: Uint8ClampedArray, width: number, height: number, threshold = 140): Uint8Array {
  const n = width * height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const lum = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    const v = lum * a + 255 * (1 - a);
    out[i] = v < threshold ? 1 : 0;
  }
  return out;
}

/** 4-connected component labelling of the non-line pixels (scanline flood fill). */
export function labelRegions(lines: Uint8Array, width: number, height: number): RegionMap {
  const ids = new Int32Array(width * height);
  const boxes: Rect[] = [{ x: 0, y: 0, w: 0, h: 0 }];
  const areas: number[] = [0];
  const stack: number[] = [];
  let next = 1;
  for (let start = 0; start < ids.length; start++) {
    if (lines[start] || ids[start]) continue;
    const id = next++;
    let minX = width, minY = height, maxX = 0, maxY = 0, area = 0;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      if (ids[p] || lines[p]) continue;
      const y = (p / width) | 0;
      const x = p - y * width;
      let l = x;
      while (l > 0 && !lines[p - (x - l) - 1] && !ids[p - (x - l) - 1]) l--;
      let r = x;
      while (r < width - 1 && !lines[p + (r - x) + 1] && !ids[p + (r - x) + 1]) r++;
      const row = y * width;
      for (let i = l; i <= r; i++) ids[row + i] = id;
      area += r - l + 1;
      if (l < minX) minX = l;
      if (r > maxX) maxX = r;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= height) continue;
        const nrow = ny * width;
        let inRun = false;
        for (let i = l; i <= r; i++) {
          const q = nrow + i;
          const open = !lines[q] && !ids[q];
          if (open && !inRun) { stack.push(q); inRun = true; } else if (!open) inRun = false;
        }
      }
    }
    boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    areas.push(area);
  }
  return { width, height, lines, ids, count: next - 1, boxes, areas };
}

/** Region under a point. On a line pixel, look at the nearest pixels around it. */
export function regionAt(map: RegionMap, x: number, y: number, search = 6): number {
  const xi = Math.round(x), yi = Math.round(y);
  for (let r = 0; r <= search; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const px = xi + dx, py = yi + dy;
        if (px < 0 || py < 0 || px >= map.width || py >= map.height) continue;
        const id = map.ids[py * map.width + px];
        if (id) return id;
      }
    }
  }
  return 0;
}

export interface Mask { rect: Rect; alpha: Uint8Array }

/**
 * Mask for one or more regions: the region pixels plus the line pixels within
 * `grow` px of them, so colour reaches under the lines with no white seam.
 */
export function regionMask(map: RegionMap, regionIds: number[], grow = 3): Mask {
  const set = new Set(regionIds.filter((r) => r > 0));
  let x0 = map.width, y0 = map.height, x1 = 0, y1 = 0;
  for (const id of set) {
    const b = map.boxes[id];
    if (!b) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w - 1); y1 = Math.max(y1, b.y + b.h - 1);
  }
  if (!set.size || x1 < x0) return { rect: { x: 0, y: 0, w: 0, h: 0 }, alpha: new Uint8Array(0) };
  x0 = Math.max(0, x0 - grow); y0 = Math.max(0, y0 - grow);
  x1 = Math.min(map.width - 1, x1 + grow); y1 = Math.min(map.height - 1, y1 + grow);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const base = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = (y + y0) * map.width + x0;
    for (let x = 0; x < w; x++) if (set.has(map.ids[row + x])) base[y * w + x] = 1;
  }
  // separable dilation (square), then keep only the grown pixels that are lines
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = -grow; k <= grow && !v; k++) { const xx = x + k; if (xx >= 0 && xx < w && base[y * w + xx]) v = 1; }
      tmp[y * w + x] = v;
    }
  }
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (base[i]) { alpha[i] = 255; continue; }
      let v = 0;
      for (let k = -grow; k <= grow && !v; k++) { const yy = y + k; if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 1; }
      if (v && map.lines[(y + y0) * map.width + x + x0]) alpha[i] = 255;
    }
  }
  return { rect: { x: x0, y: y0, w, h }, alpha };
}

/**
 * Optical centre of a region: the pixel farthest from the region's edge
 * (chamfer distance transform on the region's bounding box).
 * Returns the point and its distance, which bounds the number's size.
 */
export function opticalCenter(map: RegionMap, id: number): { x: number; y: number; dist: number } {
  const b = map.boxes[id];
  const w = b.w + 2, h = b.h + 2;
  const d = new Float32Array(w * h);
  const INF = 1e9;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = b.x + x - 1, py = b.y + y - 1;
      const inside = px >= 0 && py >= 0 && px < map.width && py < map.height && map.ids[py * map.width + px] === id;
      d[y * w + x] = inside ? INF : 0;
    }
  }
  const D = 1, D2 = Math.SQRT2;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (!d[i]) continue;
    d[i] = Math.min(d[i], d[i - 1] + D, d[i - w] + D, d[i - w - 1] + D2, d[i - w + 1] + D2);
  }
  let best = 0, bx = 0, by = 0;
  for (let y = h - 2; y >= 1; y--) for (let x = w - 2; x >= 1; x--) {
    const i = y * w + x; if (!d[i]) continue;
    d[i] = Math.min(d[i], d[i + 1] + D, d[i + w] + D, d[i + w + 1] + D2, d[i + w - 1] + D2);
    if (d[i] > best) { best = d[i]; bx = x; by = y; }
  }
  return { x: b.x + bx - 1, y: b.y + by - 1, dist: best };
}

/** Parse #rgb / #rrggbb into [r,g,b]. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** Legend label whose colour matches `hex` (exact first, then nearest within tolerance). */
export function legendLabelFor(legend: { label: string; color: string }[], hex: string, tolerance = 40): string | null {
  const [r, g, b] = hexToRgb(hex);
  let best: string | null = null, bestD = Infinity;
  for (const e of legend) {
    const [r2, g2, b2] = hexToRgb(e.color);
    const dist = Math.hypot(r - r2, g - g2, b - b2);
    if (dist < bestD) { bestD = dist; best = e.label; }
  }
  return bestD <= tolerance ? best : null;
}

/** Regions that hold a number with this label. */
export function regionsForLabel(map: RegionMap, labels: { value: string; x: number; y: number }[], value: string, scale = 1): number[] {
  const out = new Set<number>();
  for (const l of labels) {
    if (l.value !== value) continue;
    const id = regionAt(map, l.x * scale, l.y * scale, 10);
    if (id) out.add(id);
  }
  return [...out];
}

/** Paint an automatic solution: every numbered region gets its legend colour. */
export function autoSolution(map: RegionMap, labels: { value: string; x: number; y: number }[],
  legend: { label: string; color: string }[], scale = 1): Uint8ClampedArray {
  const colorOf = new Map(legend.map((e) => [e.label, hexToRgb(e.color)]));
  const regionColor = new Map<number, [number, number, number]>();
  for (const l of labels) {
    const c = colorOf.get(l.value);
    const id = regionAt(map, l.x * scale, l.y * scale, 10);
    if (c && id) regionColor.set(id, c);
  }
  const out = new Uint8ClampedArray(map.width * map.height * 4);
  for (let i = 0; i < map.ids.length; i++) {
    let c: [number, number, number] = [255, 255, 255];
    if (map.lines[i]) c = [20, 16, 14];
    else { const rc = regionColor.get(map.ids[i]); if (rc) c = rc; }
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
  }
  return out;
}
