/** Tiny DOM helpers. */

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids) if (kid != null && kid !== false) el.append(kid);
  return el;
}

export function toast(text: string, ms = 2600): void {
  const t = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('toast--in'));
  setTimeout(() => { t.classList.remove('toast--in'); setTimeout(() => t.remove(), 400); }, ms);
}

/** Modal sheet. Returns a close function. */
export function sheet(title: string, body: HTMLElement, onClose?: () => void): () => void {
  const close = () => { wrap.classList.remove('sheet--in'); setTimeout(() => wrap.remove(), 250); onClose?.(); };
  const panel = h('div', { class: 'sheet__panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', { class: 'sheet__head' },
      h('h2', {}, title),
      h('button', { class: 'icon-btn', 'aria-label': 'סגירה', onclick: () => close() }, '✕')),
    body);
  const wrap = h('div', { class: 'sheet' }, panel);
  wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('sheet--in'));
  return close;
}

/** Long press (and right click) helper. */
export function onLongPress(el: HTMLElement, cb: () => void, ms = 550): void {
  let timer = 0, sx = 0, sy = 0;
  el.addEventListener('pointerdown', (e) => {
    sx = e.clientX; sy = e.clientY;
    timer = window.setTimeout(() => { timer = 0; el.dataset.longpressed = '1'; cb(); }, ms);
  });
  el.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 12) { clearTimeout(timer); timer = 0; } });
  const cancel = () => { if (timer) clearTimeout(timer); timer = 0; };
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); cb(); });
  el.addEventListener('click', (e) => { if (el.dataset.longpressed) { e.stopPropagation(); e.preventDefault(); delete el.dataset.longpressed; } }, true);
}

export const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function blobUrl(b: Blob): string { return URL.createObjectURL(b); }
