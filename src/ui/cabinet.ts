/**
 * Opening a category: a magic bookcase. Two carved wooden doors with gold
 * inlay close over the screen, a glow shines through the crack, and they
 * swing open onto the shelves.
 */
import { h, reducedMotion, wait } from './dom';
import { sparkle } from './sparkles';
import { chime } from './sound';

const ORN = `<svg viewBox="0 0 200 300" aria-hidden="true"><g fill="none" stroke="#e7c06a" stroke-width="3" stroke-linecap="round">
<rect x="18" y="18" width="164" height="264" rx="14"/><rect x="30" y="30" width="140" height="240" rx="10" stroke-width="1.5" opacity=".7"/>
<path d="M100 60 C70 90 70 120 100 150 C130 120 130 90 100 60Z"/><path d="M100 150 C70 180 70 210 100 240 C130 210 130 180 100 150Z"/>
<circle cx="100" cy="150" r="9" fill="#e7c06a"/><path d="M30 30 q22 6 26 26 M170 30 q-22 6 -26 26 M30 270 q22 -6 26 -26 M170 270 q-22 -6 -26 -26"/></g>
<g fill="#f3d98a"><path d="M100 96l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/><path d="M100 186l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/></g></svg>`;

export async function openCabinet(title: string, icon: string, show: () => void): Promise<void> {
  if (reducedMotion()) { show(); return; }
  const doorL = h('div', { class: 'cab__door cab__door--l', html: ORN }, h('span', { class: 'cab__knob' }));
  const doorR = h('div', { class: 'cab__door cab__door--r', html: ORN }, h('span', { class: 'cab__knob' }));
  const plate = h('div', { class: 'cab__plate' }, h('span', { class: 'cab__icon' }, icon), h('span', { class: 'cab__name', dir: 'auto' }, title));
  const glow = h('div', { class: 'cab__glow' });
  const wrap = h('div', { class: 'cab', 'aria-hidden': 'true' }, glow, doorL, doorR, plate);
  document.body.append(wrap);
  await wait(30);
  wrap.classList.add('cab--in');          // the bookcase appears, doors shut
  await wait(520);
  show();                                  // the shelves are ready behind the doors
  wrap.classList.add('cab--glow');         // light through the crack
  try { chime(); } catch { /* sound is optional */ }
  await wait(380);
  wrap.classList.add('cab--open');         // the doors swing open
  sparkle(innerWidth / 2, innerHeight / 2, 70, 10);
  await wait(650);
  sparkle(innerWidth / 2, innerHeight * 0.35, 30, 8);
  await wait(650);
  wrap.classList.add('cab--out');
  await wait(320);
  wrap.remove();
}
