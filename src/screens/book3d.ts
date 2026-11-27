/** 3D book: pulled from the shelf, spun, flashed with magic, and opened. Also the closing animation. */
import type { BookMeta } from '../app/types';
import { h, reducedMotion, wait } from '../ui/dom';
import { coverFace, coverUrl, shade, spineFace } from '../ui/cover';
import { sparkle } from '../ui/sparkles';
import { chime, paperFlip } from '../ui/sound';

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
  const hinge = h('div', { class: 'book3d__front' },
    h('div', { class: 'book3d__out' }, coverFace(book, front)),
    h('div', { class: 'book3d__in' }));
  const page = h('div', { class: 'book3d__page' },
    h('div', { class: 'book3d__titlepage' },
      h('div', { class: 'book3d__orn', 'aria-hidden': 'true' }, '❦'),
      h('div', { class: 'book3d__ttl', dir: 'auto' }, book.title),
      h('div', { class: 'book3d__rule', 'aria-hidden': 'true' }),
      h('div', { class: 'book3d__sub', dir: 'ltr' }, 'Miriam Coloring Books')),
    h('div', { class: 'book3d__page-sheen' }));
  const backFace = h('div', { class: 'book3d__back' }, coverFace(book, back, 'back'));
  const spine = h('div', { class: 'book3d__spine' }, spineFace(book));
  const edge = h('div', { class: 'book3d__edge' });
  const top = h('div', { class: 'book3d__top' });
  const bottom = h('div', { class: 'book3d__bottom' });
  b.append(backFace, page, spine, edge, top, bottom, hinge);
  const flash = h('div', { class: 'book3d-flash' });
  stage.append(b, flash);
  document.body.append(stage);
  return { stage, b, hinge, flash, W, H, T, sign: rtl ? -1 : 1 };
}

const anim = (el: Element, k: Keyframe[], o: KeyframeAnimationOptions) => el.animate(k, { fill: 'forwards', ...o }).finished;

export async function openBookAnimation(book: BookMeta, front: string | null, from: DOMRect): Promise<void> {
  const back = await coverUrl(book, 'back');
  const { stage, b, hinge, flash, H, sign } = build(book, front, back);
  if (reducedMotion()) {
    await anim(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    hinge.style.transform = `rotateY(${-165 * sign}deg)`;
    await wait(150);
    setTimeout(() => stage.remove(), 400);
    return;
  }
  const dx = from.left + from.width / 2 - innerWidth / 2;
  const dy = from.top + from.height / 2 - innerHeight / 2;
  const s0 = from.height / H;
  const t0 = `translate3d(${dx}px,${dy}px,0) scale(${s0}) rotateY(${22 * sign}deg)`;
  stage.animate([{ background: 'rgba(12,6,2,0)' }, { background: 'rgba(12,6,2,.78)' }], { duration: 900, fill: 'forwards' });
  await anim(b, [
    { transform: t0 },
    { transform: `translate3d(${dx * 0.85}px,${dy - 40}px,160px) scale(${s0 * 1.15}) rotateY(${30 * sign}deg)`, offset: 0.25 },
    { transform: `translate3d(0,0,60px) scale(0.92) rotateY(${200 * sign}deg) rotateX(8deg)`, offset: 0.7 },
    { transform: `translate3d(0,0,0) scale(1) rotateY(${360 * sign}deg)` },
  ], { duration: 1500, easing: 'cubic-bezier(.45,.05,.25,1)' });
  b.style.transform = 'none';
  b.getAnimations().forEach((a) => a.cancel());
  chime();
  sparkle(innerWidth / 2, innerHeight / 2, 90, 10);
  flash.animate([{ opacity: 0 }, { opacity: 0.95, offset: 0.25 }, { opacity: 0 }], { duration: 700 });
  await wait(300);
  paperFlip();
  // open the cover
  await anim(hinge, [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${-168 * sign}deg)` }], { duration: 1000, easing: 'cubic-bezier(.6,.05,.3,1)' });
  await anim(stage, [{ opacity: 1 }, { opacity: 0 }], { duration: 380, delay: 60 });
  stage.remove();
}

export async function closeBookAnimation(book: BookMeta, fromBack = false): Promise<void> {
  const [front, back] = await Promise.all([coverUrl(book), coverUrl(book, 'back')]);
  const { stage, b, hinge, sign } = build(book, front, back);
  stage.style.background = 'rgba(12,6,2,.78)';
  if (fromBack && !reducedMotion()) {
    // already looking at the back cover: turn it a little to show the spine, then put it back on the shelf
    b.style.transform = `rotateY(${180 * sign}deg)`;
    await anim(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    await anim(b, [{ transform: `rotateY(${180 * sign}deg)` }, { transform: `rotateY(${150 * sign}deg) rotateX(-6deg)` }], { duration: 700, easing: 'ease-in-out' });
    chime();
    sparkle(innerWidth / 2, innerHeight / 2, 50, 6);
    stage.animate([{ background: 'rgba(12,6,2,.78)' }, { background: 'rgba(12,6,2,0)' }], { duration: 700, fill: 'forwards' });
    await anim(b, [
      { transform: `rotateY(${150 * sign}deg) rotateX(-6deg)` },
      { transform: `translate3d(0,${innerHeight * 0.25}px,-300px) scale(.35) rotateY(${120 * sign}deg)`, opacity: 0 },
    ], { duration: 750, easing: 'ease-in' });
    stage.remove();
    return;
  }
  hinge.style.transform = `rotateY(${-168 * sign}deg)`;
  if (reducedMotion()) { await wait(200); stage.remove(); return; }
  await anim(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
  paperFlip();
  await anim(hinge, [{ transform: `rotateY(${-168 * sign}deg)` }, { transform: 'rotateY(0deg)' }], { duration: 800, easing: 'cubic-bezier(.5,0,.3,1)' });
  await anim(b, [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${155 * sign}deg) rotateX(-6deg)` }], { duration: 1100, easing: 'cubic-bezier(.45,.05,.25,1)' });
  await wait(700);
  stage.animate([{ background: 'rgba(12,6,2,.78)' }, { background: 'rgba(12,6,2,0)' }], { duration: 700, fill: 'forwards' });
  await anim(b, [
    { transform: `rotateY(${155 * sign}deg) rotateX(-6deg)` },
    { transform: `translate3d(0,${innerHeight * 0.25}px,-300px) scale(.35) rotateY(${175 * sign}deg)`, opacity: 0 },
  ], { duration: 700, easing: 'ease-in' });
  stage.remove();
}
