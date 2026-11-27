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

/**
 * Lift the book off the shelf, float it to the middle in a pool of warm light,
 * open the cover onto a gilded title page, then glide into the first page.
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
  const dx = from.left + from.width / 2 - innerWidth / 2;
  const dy = from.top + from.height / 2 - innerHeight / 2;
  const s0 = from.height / H;
  const ease = 'cubic-bezier(.33,.1,.2,1)';
  stage.animate([{ background: 'rgba(12,6,2,0)' }, { background: 'rgba(12,6,2,.82)' }], { duration: 900, fill: 'forwards' });
  glow.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 1300, fill: 'forwards', easing: ease });
  // lift out of the shelf, float to the middle and turn to face her
  await anim(b, [
    { transform: `translate3d(${dx}px,${dy}px,0) scale(${s0}) rotateY(${22 * sign}deg)` },
    { transform: `translate3d(${dx}px,${dy - 30}px,80px) scale(${s0 * 1.08}) rotateY(${26 * sign}deg)`, offset: 0.18 },
    { transform: `translate3d(${dx * 0.35}px,${dy * 0.3 - 30}px,140px) scale(.82) rotateY(${-14 * sign}deg) rotateX(6deg)`, offset: 0.65 },
    { transform: 'translate3d(0,0,0) scale(1) rotateY(0deg) rotateX(0deg)' },
  ], { duration: 1350, easing: ease });
  b.style.transform = 'none';
  b.getAnimations().forEach((a) => a.cancel());
  chime();
  sparkle(innerWidth / 2, innerHeight / 2 - H * 0.1, 80, 9);
  flash.animate([{ opacity: 0 }, { opacity: 0.85, offset: 0.3 }, { opacity: 0 }], { duration: 650 });
  b.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-8px)' }, { transform: 'translateY(0)' }], { duration: 700, easing: 'ease-in-out' });
  await wait(260);
  paperFlip();
  // open the cover; the book slides over so the open spread stays centred
  b.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${sign * W * 0.5}px)` }], { duration: 1050, easing: 'cubic-bezier(.55,.05,.3,1)', fill: 'forwards' });
  await anim(hinge, [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${-172 * sign}deg)` }], { duration: 1050, easing: 'cubic-bezier(.55,.05,.3,1)' });
  sparkle(innerWidth / 2 + sign * W * 0.5, innerHeight / 2, 40, 5);
  await wait(420);
  // glide into the page
  behind?.();
  b.animate([{ transform: `translateX(${sign * W * 0.5}px) scale(1)` }, { transform: 'translateX(0) scale(1.06)' }], { duration: 560, easing: 'ease-in-out', fill: 'forwards' });
  await anim(stage, [{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 640, easing: 'ease-in' });
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
