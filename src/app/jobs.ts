/**
 * Books being added in the background. The PDF wizard hands its plan here and
 * returns at once, so she can keep colouring while the pages are prepared.
 */
import type { BookMeta } from './types';
import { importPdfBook, type PdfBookPlan, type PdfDoc } from './pdfimport';

export interface Job {
  id: string; title: string; categoryId: string;
  msg: string; frac: number; state: 'run' | 'done' | 'error';
  book?: BookMeta; ctl: AbortController;
}

const jobs: Job[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

export const allJobs = (): Job[] => jobs.slice();
export function onJobs(fn: () => void): () => void { subs.add(fn); return () => subs.delete(fn); }
export function dismissJob(id: string): void { const i = jobs.findIndex((j) => j.id === id); if (i >= 0) { jobs.splice(i, 1); emit(); } }

/** Fired after a background import saves a book, so open screens can refresh. */
export const BOOKS_CHANGED = 'mcb:books-changed';

export function startPdfJob(doc: PdfDoc, plan: PdfBookPlan): Job {
  const job: Job = { id: 'j' + Date.now().toString(36), title: plan.title, categoryId: plan.category.id, msg: 'מתחילה…', frac: 0, state: 'run', ctl: new AbortController() };
  jobs.push(job); emit();
  let last = 0;
  void importPdfBook(doc, plan, (m, f) => {
    job.msg = m; job.frac = f;
    const now = performance.now();
    if (now - last > 250) { last = now; emit(); }
  }, job.ctl.signal).then((book) => {
    job.state = 'done'; job.book = book; job.frac = 1; job.msg = 'נוספה למדף ✨';
    dispatchEvent(new CustomEvent(BOOKS_CHANGED));
  }).catch((e) => {
    console.error(e);
    job.state = 'error'; job.msg = job.ctl.signal.aborted ? 'ההוספה בוטלה' : e instanceof Error ? e.message : 'ההוספה נכשלה';
  }).finally(() => { void doc.destroy(); emit(); });
  return job;
}
