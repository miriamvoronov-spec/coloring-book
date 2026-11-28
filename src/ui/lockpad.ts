/**
 * Entry pads for the account lock: a 3×3 pattern (drag through the dots, like
 * a phone), a PIN keypad, or a password field.
 */
import type { LockKind } from '../app/applock';
import { h } from './dom';

/** A pad that calls `done(value)` once the person finishes entering a code. */
export function codePad(kind: Exclude<LockKind, 'none'>, done: (value: string) => void): { el: HTMLElement; reset: (bad?: boolean) => void } {
  if (kind === 'pattern') return patternPad(done);
  if (kind === 'pin') return pinPad(done);
  return passwordPad(done);
}

function patternPad(done: (v: string) => void) {
  const N = 3, size = 260, gap = size / N;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'lockpat');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'דפוס: גוררים את האצבע דרך הנקודות');
  const line = document.createElementNS(svgNS, 'polyline');
  line.setAttribute('class', 'lockpat__line');
  const tail = document.createElementNS(svgNS, 'line');
  tail.setAttribute('class', 'lockpat__line');
  svg.append(line, tail);
  const dots: SVGCircleElement[] = [];
  const centre = (i: number) => [gap * (i % N) + gap / 2, gap * Math.floor(i / N) + gap / 2];
  for (let i = 0; i < N * N; i++) {
    const [x, y] = centre(i);
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx', String(x)); c.setAttribute('cy', String(y)); c.setAttribute('r', '13');
    c.setAttribute('class', 'lockpat__dot');
    svg.append(c); dots.push(c);
  }
  let seq: number[] = [];
  let drawing = false;
  const local = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    return [(e.clientX - r.left) * size / r.width, (e.clientY - r.top) * size / r.height];
  };
  const paint = () => {
    line.setAttribute('points', seq.map((i) => centre(i).join(',')).join(' '));
    dots.forEach((d, i) => d.classList.toggle('is-on', seq.includes(i)));
  };
  const hit = (x: number, y: number) => {
    for (let i = 0; i < N * N; i++) {
      const [cx, cy] = centre(i);
      if (Math.hypot(cx - x, cy - y) < gap * 0.32 && !seq.includes(i)) {
        // passing straight over a middle dot picks it up too, like on a phone
        const last = seq[seq.length - 1];
        if (last !== undefined) {
          const mid = (last + i) / 2;
          if (Number.isInteger(mid) && Math.abs((last % N) - (i % N)) !== 1 && Math.abs(Math.floor(last / N) - Math.floor(i / N)) !== 1 && !seq.includes(mid)) seq.push(mid);
        }
        seq.push(i);
        navigator.vibrate?.(8);
        paint();
      }
    }
  };
  svg.addEventListener('pointerdown', (e) => { e.preventDefault(); svg.setPointerCapture(e.pointerId); drawing = true; seq = []; svg.classList.remove('is-bad'); const [x, y] = local(e); hit(x, y); });
  svg.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const [x, y] = local(e); hit(x, y);
    const last = seq[seq.length - 1];
    if (last !== undefined) { const [lx, ly] = centre(last); tail.setAttribute('x1', String(lx)); tail.setAttribute('y1', String(ly)); tail.setAttribute('x2', String(x)); tail.setAttribute('y2', String(y)); }
  });
  const end = () => {
    if (!drawing) return; drawing = false;
    tail.setAttribute('x2', tail.getAttribute('x1') ?? '0'); tail.setAttribute('y2', tail.getAttribute('y1') ?? '0');
    if (seq.length) done(seq.join(''));
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  const el = h('div', { class: 'lockpad' }, svg as unknown as HTMLElement);
  el.style.touchAction = 'none';
  return { el, reset: (bad = false) => { seq = []; paint(); svg.classList.toggle('is-bad', bad); } };
}

function pinPad(done: (v: string) => void) {
  let v = '';
  const shown = h('div', { class: 'lockpin__dots', 'aria-live': 'polite' });
  const show = () => { shown.textContent = v ? '●'.repeat(v.length) : ' '; };
  const key = (label: string, act: () => void, aria = label) => h('button', { class: 'lockpin__key', type: 'button', 'aria-label': aria, onclick: () => { act(); show(); navigator.vibrate?.(5); } }, label);
  const keys = h('div', { class: 'lockpin__keys', dir: 'ltr' },
    ...'123456789'.split('').map((d) => key(d, () => { if (v.length < 12) v += d; })),
    key('⌫', () => { v = v.slice(0, -1); }, 'מחיקה'),
    key('0', () => { if (v.length < 12) v += '0'; }),
    key('✓', () => { if (v) done(v); }, 'אישור'));
  show();
  const el = h('div', { class: 'lockpad' }, shown, keys);
  return { el, reset: (bad = false) => { v = ''; show(); shown.classList.toggle('is-bad', bad); } };
}

function passwordPad(done: (v: string) => void) {
  const inp = h('input', { type: 'password', class: 'lockpass', autocomplete: 'current-password', 'aria-label': 'סיסמה', placeholder: 'סיסמה' }) as HTMLInputElement;
  const go = h('button', { class: 'btn btn--gold', type: 'button', onclick: () => { if (inp.value) done(inp.value); } }, 'אישור');
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && inp.value) done(inp.value); });
  const el = h('div', { class: 'lockpad lockpad--pass' }, inp, go);
  setTimeout(() => inp.focus(), 50);
  return { el, reset: (bad = false) => { inp.value = ''; inp.classList.toggle('is-bad', bad); inp.focus(); } };
}
