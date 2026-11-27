/** Progress of books being added in the background: a card on the library screen and a small pill everywhere else. */
import { allJobs, dismissJob, onJobs, type Job } from '../app/jobs';
import { h, toast } from './dom';

export function jobCard(j: Job): HTMLElement {
  const pct = Math.round(j.frac * 100);
  const actions = j.state === 'run'
    ? h('button', { class: 'btn btn--ghost job__btn', type: 'button', onclick: () => j.ctl.abort() }, 'ביטול')
    : h('button', { class: 'btn btn--ghost job__btn', type: 'button', onclick: () => dismissJob(j.id) }, 'סגירה');
  return h('div', { class: `job job--${j.state}` },
    h('div', { class: 'job__top' },
      h('span', { class: 'job__title', dir: 'auto' }, `📥 ${j.title}`),
      h('span', { class: 'job__pct' }, j.state === 'run' ? `${pct}%` : j.state === 'done' ? '✓' : '!')),
    h('div', { class: 'job__bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('span', { style: `width:${pct}%` })),
    h('div', { class: 'job__bottom' }, h('span', { class: 'job__msg' }, j.msg), actions));
}

/** The jobs list for the library screen; re-renders itself. Returns the element and an unsubscribe. */
export function jobsBox(): [HTMLElement, () => void] {
  const box = h('section', { class: 'jobs', 'aria-label': 'חוברות בהוספה' });
  const paint = () => box.replaceChildren(...allJobs().map(jobCard));
  paint();
  return [box, onJobs(paint)];
}

export function mountJobsPill(): void {
  if (document.querySelector('.job-pill')) return;
  const pill = h('div', { class: 'job-pill', role: 'status', hidden: true });
  document.body.append(pill);
  const seen = new Set<string>();
  const paint = () => {
    const js = allJobs();
    for (const j of js) if (j.state !== 'run' && !seen.has(j.id)) { seen.add(j.id); toast(j.state === 'done' ? `"${j.title}" נוספה למדף ✨` : j.msg); }
    const run = js.filter((j) => j.state === 'run');
    const last = document.getElementById('app')!.lastElementChild;
    const onLibrary = !!last?.querySelector('.categories, .splash');
    pill.hidden = !run.length || onLibrary;
    if (pill.hidden) return;
    const j = run[0];
    const pct = Math.round(j.frac * 100);
    pill.replaceChildren(h('span', { class: 'job-pill__t', dir: 'auto' }, `📥 ${j.title}${run.length > 1 ? ` (+${run.length - 1})` : ''}`), h('span', { class: 'job-pill__pct' }, `${pct}%`),
      h('span', { class: 'job-pill__bar' }, h('span', { style: `width:${pct}%` })));
  };
  onJobs(paint);
  new MutationObserver(paint).observe(document.getElementById('app')!, { childList: true });
}
