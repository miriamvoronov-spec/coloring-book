/** 3D book: pulled from the shelf, spun, flashed with magic, and opened. Also the closing animation. */
import type { BookMeta } from '../app/types';
import { h, reducedMotion, wait } from '../ui/dom';
import { coverFace, coverUrl, shade, spineFace } from '../ui/cover';
import { sparkle } from '../ui/sparkles';
import { chime, paperFlip } from '../ui/sound';
import { logoMark } from '../ui/logo';
import { settings } from '../app/settings';

function size() {
  const H = Math.min(innerHeight * 0.74, (innerWidth * 0.62) * 1.4);
  return { W: H / 1.4, H, T: Math.max(18, H * 0.05) };
}

function build(book: BookMeta, front: string | null, back: string | null) {
  const { W, H, T } = size();
  const rtl = book.direction === 'rtl';
  const stage = h('div', { class: 'book3d-stage', 'aria-hidden': 'true' });
  const b = h('div', { class: 'book3d' + (rtl ? ' book3d--rtl' : '') });
  b.style.cssText = `width:${W}px;height:${H}px;margin-left:${-W / 2}px;margin-top:${-H / 2}px;--T:${T}px;--W:${W}px;--H:${H}px;--endpaper:${shade(book.coverColor, -0.06)};--cover:${book.coverColor}`;
  const owner = settings().name.trim();
  const hinge = h('div', { class: 'book3d__front' },
    h('div', { class: 'book3d__out' }, coverFace(book, front)),
    h('div', { class: 'book3d__in' },
      h('div', { class: 'bookplate' },
        h('div', { class: 'bookplate__star', 'aria-hidden': 'true' }, '✦'),
        h('div', { class: 'bookplate__k' }, 'ספר זה שייך ל'),
        h('div', { class: 'bookplate__name', dir: 'auto' }, owner || '✨'))));
  const page = h('div', { class: 'book3d__page' },
    h('div', { class: 'book3d__frame', 'aria-hidden': 'true' }),
    h('div', { class: 'book3d__titlepage' },
      h('div', { class: 'book3d__mark', html: logoMark(120) }),
      h('div', { class: 'book3d__ttl', dir: 'auto' }, book.title),
      h('div', { class: 'book3d__rule', 'aria-hidden': 'true' }, h('span', {}, '✦')),
      h('div', { class: 'book3d__sub', dir: 'ltr' }, 'Miriam Coloring Books')),
    h('div', { class: 'book3d__page-sheen' }));
  const backFace = h('div', { class: 'book3d__back' }, coverFace(book, back, 'back'));
  const spine = h('div', { class: 'book3d__spine' }, spineFace(book));
  const edge = h('div', { class: 'book3d__edge' });
  const top = h('div', { class: 'book3d__top' });
  const bottom = h('div', { class: 'book3d__bottom' });
  b.append(backFace, page, spine, edge, top, bottom, hinge);
  const flash = h('div', { class: 'book3d-flash' });
  const glow = h('div', { class: 'book3d-glow' });
  stage.append(glow, b, flash);
  document.body.append(stage);
  return { stage, b, hinge, flash, glow, page, W, H, T, sign: rtl ? -1 : 1 };
}

const anim = (el: Element, k: Keyframe[], o: KeyframeAnimationOptions) => el.animate(k, { fill: 'forwards', ...o }).finished;

/** The mover carries position and scale; the book inside it only turns. One transform per element, so nothing jumps. */
function mover(stage: HTMLElement, b: HTMLElement): HTMLElement {
  const m = h('div', { class: 'book3d-mover' });
  stage.insertBefore(m, b); m.append(b);
  return m;
}

/** Where the open page will sit in the reader: as tall as the screen allows. */
function pageScale(H: number): number { return Math.min((innerHeight - 140) / H, (innerWidth - 40) / (H / 1.4)) ; }

/**
 * Lift the book off the shelf to the middle of the screen, a flash of magic,
 * open the cover, then glide into the first page. About two seconds.
 * `behind` mounts the reader under the animation just before it fades away.
 */
export async function openBookAnimation(book: BookMeta, front: string | null, from: DOMRect, behind?: () => void): Promise<void> {
  const back = await coverUrl(book, 'back');
  const { stage, b, hinge, flash, glow, W, H, sign } = build(book, front, back);
  if (reducedMotion()) {
    await anim(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    hinge.style.transform = `rotateY(${-165 * sign}deg)`;
    await wait(250);
    behind?.();
    await anim(stage, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 });
    stage.remove();
    return;
  }
  const m = mover(stage, b);
  const dx = from.left + from.width / 2 - innerWidth / 2;
  const dy = from.top + from.height / 2 - innerHeight / 2;
  const s0 = from.height / H;
  const ease = 'cubic-bezier(.25,.1,.25,1)';
  stage.animate([{ background: 'rgba(12,6,2,0)' }, { background: 'rgba(12,6,2,.8)' }], { duration: 600, fill: 'forwards' });
  glow.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 800, fill: 'forwards', easing: ease });
  // 1. lift out of the shelf and float to the middle, turning to face her
  b.animate([{ transform: `rotateY(${24 * sign}deg)` }, { transform: `rotateY(${-10 * sign}deg) rotateX(4deg)`, offset: 0.6 }, { transform: 'rotateY(0deg)' }], { duration: 750, easing: ease, fill: 'forwards' });
  await anim(m, [
    { transform: `translate3d(${dx}px,${dy}px,0) scale(${s0})` },
    { transform: `translate3d(${dx * 0.4}px,${dy * 0.4 - 24}px,0) scale(${0.6 + s0 * 0.3})`, offset: 0.55 },
    { transform: 'translate3d(0,0,0) scale(1)' },
  ], { duration: 750, easing: ease });
  chime();
  sparkle(innerWidth / 2, innerHeight / 2 - H * 0.1, 70, 8);
  flash.animate([{ opacity: 0 }, { opacity: 0.8, offset: 0.3 }, { opacity: 0 }], { duration: 500 });
  // 2. open the cover; the spread slides over so it stays centred
  paperFlip();
  const openEase = 'cubic-bezier(.45,.05,.3,1)';
  m.animate([{ transform: 'translate3d(0,0,0) scale(1)' }, { transform: `translate3d(${sign * W * 0.5}px,0,0) scale(1)` }], { duration: 800, easing: openEase, fill: 'forwards' });
  await anim(hinge, [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${-175 * sign}deg)` }], { duration: 800, easing: openEase });
  // 3. stay on the opening spread; the reader opens on the same spread underneath, and the animation melts into it
  await wait(500);
  behind?.();
  const k = Math.min(pageScale(H), (innerWidth - 40) / (2 * W));
  m.animate([{ transform: `translate3d(${sign * W * 0.5}px,0,0) scale(1)` }, { transform: `translate3d(${sign * W * 0.5 * k}px,0,0) scale(${k})` }], { duration: 900, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' });
  await anim(stage, [{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration: 1200, easing: 'ease-in-out' });
  stage.remove();
}

/**
 * Close the book and put it back: the cover swings shut, the book turns to
 * show its spine and flies back to its place on the shelf (or to the middle
 * of the shelf screen when the place is unknown), leaving a trail of sparkles.
 */
export async function closeBookAnimation(book: BookMeta, fromBack = false, target?: () => DOMRect | null): Promise<void> {
  const [front, back] = await Promise.all([coverUrl(book), coverUrl(book, 'back')]);
  const { stage, b, hinge, H, W, sign } = build(book, front, back);
  const m = mover(stage, b);
  stage.style.background = 'rgba(12,6,2,.8)';
  if (reducedMotion()) { await wait(200); stage.remove(); return; }
  const k = pageScale(H);
  const ease = 'cubic-bezier(.4,0,.2,1)';
  if (fromBack) {
    b.style.transform = `rotateY(${180 * sign}deg)`;
    await anim(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
  } else {
    // from the open page: shrink to the open spread, then swing the cover shut
    hinge.style.transform = `rotateY(${-175 * sign}deg)`;
    m.style.transform = `translate3d(0,0,0) scale(${k})`;
    await anim(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
    await anim(m, [{ transform: `translate3d(0,0,0) scale(${k})` }, { transform: `translate3d(${sign * W * 0.5}px,0,0) scale(1)` }], { duration: 380, easing: ease });
    paperFlip();
    m.animate([{ transform: `translate3d(${sign * W * 0.5}px,0,0) scale(1)` }, { transform: 'translate3d(0,0,0) scale(1)' }], { duration: 650, easing: ease, fill: 'forwards' });
    await anim(hinge, [{ transform: `rotateY(${-175 * sign}deg)` }, { transform: 'rotateY(0deg)' }], { duration: 650, easing: ease });
  }
  chime();
  sparkle(innerWidth / 2, innerHeight / 2, 40, 5);
  const startRot = fromBack ? 180 * sign : 0;
  // fade the backdrop so the shelf shows through, then fly home
  stage.animate([{ background: 'rgba(12,6,2,.8)' }, { background: 'rgba(12,6,2,0)' }], { duration: 700, fill: 'forwards' });
  await wait(60);
  const r = target?.() ?? null;
  const tx = r ? r.left + r.width / 2 - innerWidth / 2 : 0;
  const ty = r ? r.top + r.height / 2 - innerHeight / 2 : innerHeight * 0.2;
  const ts = r ? r.height / H : 0.3;
  b.animate([{ transform: `rotateY(${startRot}deg)` }, { transform: `rotateY(${startRot + 12 * sign}deg) rotateX(-4deg)`, offset: 0.4 }, { transform: `rotateY(${22 * sign}deg)` }], { duration: 800, easing: ease, fill: 'forwards' });
  const trail = window.setInterval(() => { const q = m.getBoundingClientRect(); sparkle(q.left + q.width / 2, q.top + q.height / 2, 6, 2); }, 90);
  await anim(m, [
    { transform: 'translate3d(0,0,0) scale(1)' },
    { transform: `translate3d(${tx * 0.5}px,${ty * 0.5 - 30}px,0) scale(${(1 + ts) / 2})`, offset: 0.5 },
    { transform: `translate3d(${tx}px,${ty}px,0) scale(${ts})`, opacity: r ? 1 : 0 },
  ], { duration: 800, easing: ease });
  clearInterval(trail);
  if (r) sparkle(r.left + r.width / 2, r.top + r.height / 2, 30, 4);
  await anim(stage, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
  stage.remove();
}
