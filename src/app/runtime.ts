/**
 * Optional claude.ai Artifact runtime capabilities (downloads, sample).
 * Outside an Artifact viewer they are absent and the app falls back to
 * plain browser behaviour.
 */
declare global {
  interface Window { claude?: { use(name: string): Promise<unknown> } }
}

const cache = new Map<string, Promise<unknown>>();

export function useCap<T>(name: string): Promise<T | null> {
  if (!window.claude?.use) return Promise.resolve(null);
  if (!cache.has(name)) cache.set(name, window.claude.use(name).catch(() => null));
  return cache.get(name) as Promise<T | null>;
}

interface Downloads { save(o: { filename: string; data: Blob }): Promise<unknown> }

/** Hand a generated file to the viewer. Returns a short Hebrew status. */
export async function saveFile(filename: string, blob: Blob): Promise<string> {
  const dl = await useCap<Downloads>('downloads');
  if (dl) {
    try { await dl.save({ filename, data: blob }); return 'הקובץ נשמר. אפשר לשלוח אותו בוואטסאפ, במייל או ב-Drive'; }
    catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'declined') return 'השמירה בוטלה';
      if (code === 'host_unavailable') return 'האפליקציה של Claude כאן לא שומרת קבצים. פתחי את הקישור בדפדפן ונסי שוב';
      if (code === 'rate_limited') return 'רגע, יש כבר חלון שמירה פתוח';
      return 'לא הצלחתי לשמור את הקובץ כאן';
    }
  }
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: filename }); return 'נשלח'; } catch { /* fall through to download */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'הקובץ ירד למכשיר';
}
