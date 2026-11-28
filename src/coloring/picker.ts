/** HSV colour wheel with HEX field, page palette and recent colours. */
import { hexToRgb, rgbToHex } from '../app/raster';
import { h } from '../ui/dom';

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d) {
    if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4;
    hh *= 60; if (hh < 0) hh += 360;
  }
  return [hh, mx ? d / mx : 0, mx];
}

export function hsvToHex(hh: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export interface PickerOpts {
  color: string;
  palette: string[];
  recent: string[];
  legend: { label: string; color: string }[];
  onChange: (hex: string) => void;
  onAddToPalette: (hex: string) => void;
  onEyedropper: () => void;
}

export function colorPicker(o: PickerOpts): HTMLElement {
  let [hh, s, v] = rgbToHsv(...hexToRgb(o.color));
  const SIZE = 220;
  const wheel = h('canvas', { class: 'wheel', width: SIZE * 2, height: SIZE * 2, 'aria-label': 'גלגל צבעים' });
  wheel.style.width = wheel.style.height = SIZE + 'px';
  const knob = h('div', { class: 'wheel__knob' });
  const wheelWrap = h('div', { class: 'wheel-wrap' }, wheel, knob);
  const val = h('input', { type: 'range', class: 'slider slider--value', id: 'pick-value', min: 0, max: 100, value: Math.round(v * 100), 'aria-label': 'בהירות' });
  const hex = h('input', { class: 'field field--hex', id: 'pick-hex', value: o.color, maxlength: 7, dir: 'ltr', 'aria-label': 'HEX', spellcheck: 'false' });
  const swatch = h('div', { class: 'pick-preview' });

  const draw = () => {
    const x = wheel.getContext('2d')!;
    const R = SIZE;
    const img = x.createImageData(R * 2, R * 2);
    for (let py = 0; py < R * 2; py++) for (let px = 0; px < R * 2; px++) {
      const dx = px - R, dy = py - R, d = Math.hypot(dx, dy);
      if (d > R) continue;
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      const [r, g, b] = hexToRgb(hsvToHex((ang + 360) % 360, d / R, v));
      const i = (py * R * 2 + px) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = d > R - 1.5 ? 120 : 255;
    }
    x.putImageData(img, 0, 0);
  };
  const place = () => {
    const a = (hh * Math.PI) / 180, r = (s * SIZE) / 2;
    knob.style.transform = `translate(${SIZE / 2 + Math.cos(a) * r}px, ${SIZE / 2 + Math.sin(a) * r}px)`;
    const c = hsvToHex(hh, s, v);
    knob.style.background = c;
    swatch.style.background = c;
    val.style.setProperty('--top', hsvToHex(hh, s, 1));
  };
  const emit = () => { const c = hsvToHex(hh, s, v); hex.value = c; place(); o.onChange(c); };

  const fromPointer = (e: PointerEvent) => {
    const r = wheel.getBoundingClientRect();
    const dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
    hh = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    if (v < 0.15) { v = 1; val.value = '100'; draw(); }
    emit();
  };
  wheelWrap.addEventListener('pointerdown', (e) => { wheelWrap.setPointerCapture(e.pointerId); fromPointer(e); });
  wheelWrap.addEventListener('pointermove', (e) => { if (e.buttons) fromPointer(e); });
  val.addEventListener('input', () => { v = Number(val.value) / 100; draw(); emit(); });
  hex.addEventListener('change', () => {
    const t = hex.value.trim();
    if (!/^#?[0-9a-f]{6}$/i.test(t) && !/^#?[0-9a-f]{3}$/i.test(t)) { hex.value = hsvToHex(hh, s, v); return; }
    const c = rgbToHex(...hexToRgb(t));
    [hh, s, v] = rgbToHsv(...hexToRgb(c));
    val.value = String(Math.round(v * 100));
    draw(); emit();
  });

  const chips = (list: string[], label: string) => {
    const row = h('div', { class: 'chips', role: 'group', 'aria-label': label });
    for (const c of list) {
      const b = h('button', { class: 'chip', type: 'button', 'aria-label': c, title: c });
      b.style.background = c;
      b.addEventListener('click', () => { [hh, s, v] = rgbToHsv(...hexToRgb(c)); val.value = String(Math.round(v * 100)); draw(); emit(); });
      row.append(b);
    }
    return row;
  };

  const legendRow = h('div', { class: 'chips', role: 'group', 'aria-label': 'מקרא' });
  for (const e of o.legend) {
    const b = h('button', { class: 'chip chip--num', type: 'button', 'aria-label': `צבע ${e.label}` }, e.label);
    b.style.background = e.color;
    b.addEventListener('click', () => { [hh, s, v] = rgbToHsv(...hexToRgb(e.color)); val.value = String(Math.round(v * 100)); draw(); emit(); });
    legendRow.append(b);
  }

  const add = h('button', { class: 'btn btn--small', type: 'button' }, '＋ לפלטה של הדף');
  add.addEventListener('click', () => o.onAddToPalette(hsvToHex(hh, s, v)));
  const drop = h('button', { class: 'btn btn--small', type: 'button', html: '' });
  drop.textContent = 'דגימה מהדף';
  drop.addEventListener('click', () => o.onEyedropper());

  draw(); place();
  return h('div', { class: 'picker' },
    wheelWrap,
    h('div', { class: 'picker__row' }, swatch, val),
    h('div', { class: 'picker__row' }, h('label', { for: 'pick-hex' }, 'HEX'), hex, drop),
    o.legend.length ? h('div', { class: 'picker__group' }, h('h3', {}, 'מקרא הדף'), legendRow) : null,
    h('div', { class: 'picker__group' }, h('h3', {}, 'פלטת הדף'), o.palette.length ? chips(o.palette, 'פלטת הדף') : h('p', { class: 'muted' }, 'עוד אין צבעים בפלטה'), add),
    o.recent.length ? h('div', { class: 'picker__group' }, h('h3', {}, 'אחרונים'), chips(o.recent, 'צבעים אחרונים')) : null);
}
