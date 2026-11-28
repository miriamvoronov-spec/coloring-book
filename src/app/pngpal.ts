/**
 * A small palette PNG writer. Coloring pages are black lines on white plus a
 * strip of colour squares, so 256 colours are plenty and the file is a
 * fraction of the size of the browser's full-colour PNG.
 */
import { zlibSync } from 'fflate';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encode RGBA pixels (alpha ignored) as an 8-bit palette PNG. */
export function encodePalettePng(px: Uint8ClampedArray, w: number, h: number): Blob {
  // 1. count colours on a 15-bit grid
  const hist = new Uint32Array(32768);
  const key = (i: number) => ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
  for (let i = 0; i < px.length; i += 4) hist[key(i)]++;
  const used: number[] = [];
  for (let k = 0; k < 32768; k++) if (hist[k]) used.push(k);
  used.sort((a, b) => hist[b] - hist[a]);
  // 2. palette: the most common cells, always with pure white and black
  const pal: number[][] = [[255, 255, 255], [0, 0, 0]];
  const cell = (k: number) => [((k >> 10) << 3) | 4, (((k >> 5) & 31) << 3) | 4, ((k & 31) << 3) | 4];
  for (const k of used) {
    if (pal.length >= 256) break;
    const c = cell(k);
    if (pal.some((p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) < 12)) continue;
    pal.push(c);
  }
  // 3. map each used cell to its nearest palette entry once
  const map = new Uint8Array(32768);
  for (const k of used) {
    const c = cell(k); let best = 0, bd = Infinity;
    for (let j = 0; j < pal.length; j++) {
      const d = (pal[j][0] - c[0]) ** 2 + (pal[j][1] - c[1]) ** 2 + (pal[j][2] - c[2]) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    map[k] = best;
  }
  // 4. rows with filter byte 0
  const raw = new Uint8Array((w + 1) * h);
  for (let y = 0, o = 0, i = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w; x++, i += 4) raw[o++] = map[key(i)]; }
  const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 3;
  const plte = new Uint8Array(pal.length * 3); pal.forEach((p, j) => plte.set(p, j * 3));
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', zlibSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))];
  return new Blob(parts as BlobPart[], { type: 'image/png' });
}

/** A canvas as a palette PNG. */
export function canvasToPalettePng(c: HTMLCanvasElement): Blob {
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
  return encodePalettePng(d.data, c.width, c.height);
}
