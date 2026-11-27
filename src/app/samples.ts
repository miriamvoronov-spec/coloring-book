/**
 * Her own books, preloaded as sample books. The pages live in this Artifact's
 * private asset store (never in the code repository) and are copied into the
 * device's library once, the first time the app opens.
 */
import { store } from './store';
import { fromEntries, type Manifest } from './importer';
import { toast } from '../ui/dom';

/**
 * Asset URLs of the sample books' manifests. They are given at build time
 * (VITE_SAMPLES, a JSON list) only for her private copy, so the copy she
 * shares with friends never points at the books she bought.
 */
export const SAMPLE_MANIFESTS: { key: string; url: string; categoryId: string }[] = (() => {
  try { return JSON.parse((import.meta.env.VITE_SAMPLES as string | undefined) || '[]'); } catch { return []; }
})();

export async function loadSampleBooks(): Promise<void> {
  for (const s of SAMPLE_MANIFESTS) {
    if (await store.kv<boolean>('sample-' + s.key)) continue;
    try {
      const r = await fetch(s.url);
      if (!r.ok) continue;
      const manifest = (await r.json()) as Manifest & { files?: Record<string, string> };
      const cat = (await store.categories()).find((c) => c.id === s.categoryId);
      if (!cat) continue;
      toast(`מכינה את "${manifest.title}" על המדף…`, 4000);
      const entries: { name: string; blob: Blob }[] = [];
      for (const p of manifest.pages) {
        const path = p.lines ?? p.image;
        if (!path || p.kind === 'solution') continue;
        const url = manifest.files?.[path] ?? path;
        const b = await (await fetch(url)).blob();
        entries.push({ name: path, blob: b });
      }
      await fromEntries(entries, new Map(), manifest, cat, manifest.title ?? 'חוברת', () => {}, false);
      await store.setKv('sample-' + s.key, true);
      toast(`"${manifest.title}" מוכנה על המדף ✨`);
    } catch (e) { console.error('sample book', e); }
  }
}
