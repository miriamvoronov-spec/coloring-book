/**
 * Photographed pages are often cut too tight: the drawing runs into the edge
 * of the photo. Here the page gets its missing margin back. Without a key the
 * new margin is clean white paper; with an OpenAI or Gemini key (kept on this
 * device only) the AI continues the cut lines into the new margin.
 */
import { prefs } from './store';

export type MarginMode = 'off' | 'white' | 'ai';
type Side = 'top' | 'right' | 'bottom' | 'left';

/** Which sides have ink running into the edge of the picture. */
export function cutSides(c: HTMLCanvasElement, skip: Side[] = []): Side[] {
  const { width: w, height: h } = c;
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.006));
  const dark = (x: number, y: number) => { const i = (y * w + x) * 4; return d[i] + d[i + 1] + d[i + 2] < 300; };
  // count separate strokes that cross the outer band
  const crossings = (len: number, at: (t: number, k: number) => [number, number]) => {
    let n = 0, run = false;
    for (let t = 0; t < len; t += 2) {
      let hit = 0;
      for (let k = 0; k < band; k++) { const [x, y] = at(t, k); if (dark(x, y)) hit++; }
      const on = hit >= band - 1;
      if (on && !run) n++;
      run = on;
    }
    return n;
  };
  const res: Side[] = [];
  const limit = (len: number) => Math.max(3, Math.round(len / 400));
  if (!skip.includes('top') && crossings(w, (t, k) => [t, k]) >= limit(w)) res.push('top');
  if (!skip.includes('bottom') && crossings(w, (t, k) => [t, h - 1 - k]) >= limit(w)) res.push('bottom');
  if (!skip.includes('left') && crossings(h, (t, k) => [k, t]) >= limit(h)) res.push('left');
  if (!skip.includes('right') && crossings(h, (t, k) => [w - 1 - k, t]) >= limit(h)) res.push('right');
  return res;
}

/** Add a margin on the cut sides. Returns the new canvas and where the old one sits in it. */
export async function restoreMargins(c: HTMLCanvasElement, mode: MarginMode, skip: Side[] = [], signal?: AbortSignal): Promise<{ canvas: HTMLCanvasElement; dx: number; dy: number }> {
  const sides = mode === 'off' ? [] : cutSides(c, skip);
  if (!sides.length) return { canvas: c, dx: 0, dy: 0 };
  const m = Math.round(Math.min(c.width, c.height) * 0.06);
  const dx = sides.includes('left') ? m : 0, dy = sides.includes('top') ? m : 0;
  const out = document.createElement('canvas');
  out.width = c.width + dx + (sides.includes('right') ? m : 0);
  out.height = c.height + dy + (sides.includes('bottom') ? m : 0);
  const x = out.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, out.width, out.height);
  x.drawImage(c, dx, dy);
  if (mode === 'ai') {
    try {
      const ai = await aiExtend(out, { x: dx, y: dy, w: c.width, h: c.height }, signal);
      if (ai) {
        // only the new margin comes from the AI, cleaned to black and white
        const t = document.createElement('canvas'); t.width = out.width; t.height = out.height;
        const tx = t.getContext('2d', { willReadFrequently: true })!;
        tx.drawImage(ai, 0, 0, out.width, out.height);
        const id = tx.getImageData(0, 0, out.width, out.height); const p = id.data;
        for (let i = 0; i < p.length; i += 4) { const v = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11 < 140 ? 0 : 255; p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255; }
        tx.putImageData(id, 0, 0);
        x.save();
        x.beginPath(); x.rect(0, 0, out.width, out.height); x.rect(dx, dy, c.width, c.height); x.clip('evenodd');
        x.drawImage(t, 0, 0);
        x.restore();
      }
    } catch (e) { if ((e as Error).name === 'AbortError') throw e; /* white margin is fine */ }
  }
  return { canvas: out, dx, dy };
}

const blobOf = (c: HTMLCanvasElement) => new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('png'))), 'image/png'));
const PROMPT = 'This is a black and white line drawing from a coloring book. The white border around it is empty because the photo was cut. ' +
  'Continue every cut line naturally into the empty border, in exactly the same style: clean black outlines on white, no colour, no shading, no text. Keep the existing drawing unchanged.';

/** Ask the image service to draw into the empty margin. Null when there is no key. */
async function aiExtend(full: HTMLCanvasElement, keep: { x: number; y: number; w: number; h: number }, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  const provider = prefs.get('imgProvider', 'claude') as string;
  const key = prefs.get('imgKey.' + provider, '');
  if (!key || (provider !== 'openai' && provider !== 'gemini')) return null;
  // a smaller copy for the service (portrait 1024×1536 or landscape 1536×1024)
  const portrait = full.height >= full.width;
  const W = portrait ? 1024 : 1536, H = portrait ? 1536 : 1024;
  const small = document.createElement('canvas'); small.width = W; small.height = H;
  const sx = small.getContext('2d')!; sx.fillStyle = '#fff'; sx.fillRect(0, 0, W, H); sx.drawImage(full, 0, 0, W, H);
  let b64 = '';
  if (provider === 'openai') {
    const mask = document.createElement('canvas'); mask.width = W; mask.height = H;
    const mx = mask.getContext('2d')!; mx.fillStyle = '#000';
    const kx = W / full.width, ky = H / full.height;
    mx.fillRect(keep.x * kx, keep.y * ky, keep.w * kx, keep.h * ky); // opaque = keep, transparent = draw here
    const fd = new FormData();
    fd.append('model', 'gpt-image-1'); fd.append('prompt', PROMPT); fd.append('size', `${W}x${H}`);
    fd.append('image', await blobOf(small), 'page.png'); fd.append('mask', await blobOf(mask), 'mask.png');
    const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', signal, headers: { Authorization: `Bearer ${key}` }, body: fd });
    const j = await r.json(); if (!r.ok) return null;
    b64 = j.data?.[0]?.b64_json ?? '';
  } else {
    const data = small.toDataURL('image/png').split(',')[1];
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: 'image/png', data } }] }], generationConfig: { responseModalities: ['IMAGE'] } }),
    });
    const j = await r.json(); if (!r.ok) return null;
    b64 = j.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data: string } }) => p.inlineData)?.inlineData?.data ?? '';
  }
  if (!b64) return null;
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  return img;
}

/** Is an image key set, so the AI option can be offered? */
export function aiMarginsAvailable(): boolean {
  const provider = prefs.get('imgProvider', 'claude') as string;
  return (provider === 'openai' || provider === 'gemini') && !!prefs.get('imgKey.' + provider, '');
}
