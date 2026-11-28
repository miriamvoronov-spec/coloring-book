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
export const SAMPLE_MANIFESTS: { key: string; url: string; categoryId: string; version?: number }[] = (() => {
  try { return JSON.parse((import.meta.env.VITE_SAMPLES as string | undefined) || '[]'); } catch { return []; }
})();

export async function loadSampleBooks(): Promise<void> {
  for (const s of SAMPLE_MANIFESTS) {
    const had = await store.kv<boolean | number>('sample-' + s.key);
    const want = s.version ?? 1;
    if (had && (had === true ? 1 : had) >= want) continue;
    if (had) { await upgradeSample(s, want); continue; }
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
        for (const f of [path, p.solution].filter((x): x is string => !!x)) {
          const b = await (await fetch(manifest.files?.[f] ?? f)).blob();
          entries.push({ name: f, blob: b });
        }
      }
      await fromEntries(entries, new Map(), manifest, cat, manifest.title ?? 'חוברת', () => {}, false);
      await store.setKv('sample-' + s.key, want);
      toast(`"${manifest.title}" מוכנה על המדף ✨`);
    } catch (e) { console.error('sample book', e); }
  }
}

/**
 * A newer version of a sample book she already has: swap in the new page
 * pictures and solutions, but keep the same pages, so her colouring stays.
 */
async function upgradeSample(s: { key: string; url: string; categoryId: string }, want: number): Promise<void> {
  try {
    const r = await fetch(s.url);
    if (!r.ok) return;
    const manifest = (await r.json()) as Manifest & { files?: Record<string, string> };
    const book = (await store.books()).find((b) => b.categoryId === s.categoryId && b.title === (manifest.title ?? ''))
      ?? (await store.books()).find((b) => b.title === (manifest.title ?? ''));
    if (!book) { await store.setKv('sample-' + s.key, false); return; }
    toast(`מעדכנת את "${manifest.title}": קוביות הצבע ודפי הפתרון…`, 5000);
    const pages = await Promise.all(book.pageIds.map((id) => store.page(id)));
    const byTitle = new Map(pages.filter((p) => p?.title).map((p) => [p!.title!, p!]));
    for (const mp of manifest.pages) {
      if (!mp.lines || !mp.title) continue;
      const rec = byTitle.get(mp.title);
      if (!rec) continue;
      const get = async (f?: string) => (f ? (await fetch(manifest.files?.[f] ?? f)).blob() : undefined);
      const [img, sol] = await Promise.all([get(mp.lines), get(mp.solution)]);
      if (img) rec.image = img;
      if (sol) rec.solution = sol;
      await store.putPage(rec);
    }
    await store.setKv('sample-' + s.key, want);
    toast(`"${manifest.title}" עודכנה ✨`);
  } catch (e) { console.error('sample upgrade', e); }
}
