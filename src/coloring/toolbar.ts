/** The single tool bar: vertical on the right by default, draggable to any edge. */
import { prefs } from '../app/store';
import { h } from '../ui/dom';
import { icons } from '../ui/icons';
import type { ToolName } from './brushes';
import type { ToolState } from './engine';

export type Side = 'right' | 'left' | 'top' | 'bottom';

export interface ToolbarHooks {
  state: ToolState;
  changed: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  lamp: () => boolean;
  lampOn: () => boolean;
  fit: () => void;
  colorPanel: () => HTMLElement;
  layersPanel: () => HTMLElement;
}

const TOOL_LABEL: Record<ToolName, string> = { pencil: 'עיפרון צבעוני', marker: 'טוש', eraser: 'מחק', picker: 'דוגם צבע' };
const TOOL_ICON: Record<ToolName, string> = { pencil: icons.pencil, marker: icons.marker, eraser: icons.eraser, picker: icons.picker };

export class Toolbar {
  el: HTMLElement;
  private pop: HTMLElement | null = null;
  private popFor: HTMLElement | null = null;
  side: Side = prefs.get<Side>('toolbarSide', 'right');
  private b: Record<string, HTMLButtonElement> = {};

  constructor(private k: ToolbarHooks) {
    const btn = (key: string, label: string, icon: string, onClick: (b: HTMLButtonElement) => void) => {
      const b = h('button', { class: 'tb__btn', type: 'button', 'aria-label': label, title: label, html: icon }) as HTMLButtonElement;
      b.addEventListener('click', () => onClick(b));
      this.b[key] = b;
      return b;
    };
    const grip = h('div', { class: 'tb__grip', 'aria-label': 'גרירת סרגל הכלים', title: 'גררי לכל צד של המסך', html: icons.grip });
    const color = h('button', { class: 'tb__btn tb__color', type: 'button', 'aria-label': 'בחירת צבע', title: 'צבע' }, h('span', { class: 'tb__swatch' })) as HTMLButtonElement;
    color.addEventListener('click', () => this.toggle(color, () => k.colorPanel()));
    this.b.color = color;
    this.el = h('nav', { class: 'tb', 'aria-label': 'כלי צביעה' },
      grip,
      btn('tool', 'כלי', icons.pencil, (b) => this.toggle(b, () => this.toolMenu())),
      color,
      btn('size', 'גודל ושקיפות', icons.size, (b) => this.toggle(b, () => this.sizeMenu())),
      btn('lamp', 'מנורה: הדגשת המספר של הצבע', icons.bulb, () => { k.lamp(); this.update(); }),
      btn('inside', 'צביעה בתוך הקווים', icons.inside, () => { k.state.inside = !k.state.inside; k.changed(); this.update(); }),
      h('div', { class: 'tb__sep' }),
      btn('undo', 'ביטול', icons.undo, () => { k.undo(); this.update(); }),
      btn('redo', 'חזרה', icons.redo, () => { k.redo(); this.update(); }),
      h('div', { class: 'tb__sep' }),
      btn('layers', 'שכבות', icons.layers, (b) => this.toggle(b, () => k.layersPanel())),
      btn('fit', 'התאמה למסך', icons.fit, () => k.fit()));
    this.dragging(grip);
    this.applySide();
    this.update();
    document.addEventListener('pointerdown', this.outside, true);
  }

  private outside = (e: PointerEvent) => {
    if (!this.pop) return;
    const t = e.target as Node;
    if (this.pop.contains(t) || this.popFor?.contains(t)) return;
    this.closePop();
  };

  update(): void {
    const s = this.k.state;
    this.b.tool.innerHTML = TOOL_ICON[s.tool];
    this.b.tool.setAttribute('aria-label', 'כלי: ' + TOOL_LABEL[s.tool]);
    (this.b.color.firstElementChild as HTMLElement).style.background = s.color;
    this.b.inside.classList.toggle('is-on', s.inside);
    this.b.inside.setAttribute('aria-pressed', String(s.inside));
    const lamp = this.k.lampOn();
    this.b.lamp.classList.toggle('is-on', lamp);
    this.b.lamp.setAttribute('aria-pressed', String(lamp));
    this.b.undo.disabled = !this.k.canUndo();
    this.b.redo.disabled = !this.k.canRedo();
  }

  closePop(): void { this.pop?.remove(); this.pop = null; this.popFor = null; }

  private toggle(anchor: HTMLElement, make: () => HTMLElement) {
    if (this.popFor === anchor) { this.closePop(); return; }
    this.closePop();
    const pop = h('div', { class: 'pop pop--' + this.side }, make());
    document.body.append(pop);
    this.pop = pop; this.popFor = anchor;
    this.placePop();
  }

  placePop(): void {
    if (!this.pop || !this.popFor) return;
    const a = this.popFor.getBoundingClientRect(), t = this.el.getBoundingClientRect();
    const p = this.pop.getBoundingClientRect();
    const m = 10;
    let x = 0, y = 0;
    if (this.side === 'right') { x = t.left - p.width - m; y = a.top + a.height / 2 - p.height / 2; }
    if (this.side === 'left') { x = t.right + m; y = a.top + a.height / 2 - p.height / 2; }
    if (this.side === 'top') { y = t.bottom + m; x = a.left + a.width / 2 - p.width / 2; }
    if (this.side === 'bottom') { y = t.top - p.height - m; x = a.left + a.width / 2 - p.width / 2; }
    x = Math.max(8, Math.min(innerWidth - p.width - 8, x));
    y = Math.max(8, Math.min(innerHeight - p.height - 8, y));
    this.pop.style.left = x + 'px'; this.pop.style.top = y + 'px';
  }

  private toolMenu(): HTMLElement {
    const box = h('div', { class: 'menu', role: 'menu' });
    for (const t of ['pencil', 'marker', 'eraser', 'picker'] as ToolName[]) {
      const b = h('button', { class: 'menu__item' + (this.k.state.tool === t ? ' is-on' : ''), type: 'button', role: 'menuitemradio', 'aria-checked': String(this.k.state.tool === t), html: TOOL_ICON[t] },
        h('span', {}, TOOL_LABEL[t]));
      b.addEventListener('click', () => { this.k.state.tool = t; this.k.changed(); this.update(); this.closePop(); });
      box.append(b);
    }
    box.append(h('p', { class: 'menu__hint' }, 'כפתור הצד של העט: מחק כל עוד הוא לחוץ'));
    return box;
  }

  private sizeMenu(): HTMLElement {
    const s = this.k.state;
    const dot = h('div', { class: 'size-dot' });
    const paint = () => {
      const d = Math.max(3, Math.min(64, s.size * 1.1));
      dot.style.width = dot.style.height = d + 'px';
      dot.style.background = s.color; dot.style.opacity = String(s.opacity);
    };
    const size = h('input', { type: 'range', class: 'slider', id: 'tool-size', min: 1, max: 60, value: s.size, 'aria-label': 'גודל' });
    const op = h('input', { type: 'range', class: 'slider', id: 'tool-opacity', min: 5, max: 100, value: Math.round(s.opacity * 100), 'aria-label': 'שקיפות' });
    const sv = h('output', { for: 'tool-size' }, String(s.size));
    const ov = h('output', { for: 'tool-opacity' }, Math.round(s.opacity * 100) + '%');
    size.addEventListener('input', () => { s.size = Number(size.value); sv.textContent = size.value; paint(); this.k.changed(); });
    op.addEventListener('input', () => { s.opacity = Number(op.value) / 100; ov.textContent = op.value + '%'; paint(); this.k.changed(); });
    paint();
    return h('div', { class: 'sizes' },
      h('div', { class: 'sizes__preview' }, dot),
      h('label', { for: 'tool-size' }, 'גודל ', sv), size,
      h('label', { for: 'tool-opacity' }, 'אטימות ', ov), op);
  }

  // ----- drag to any edge -----
  private dragging(grip: HTMLElement) {
    let active = false;
    grip.addEventListener('pointerdown', (e) => {
      active = true; grip.setPointerCapture(e.pointerId);
      this.closePop();
      this.el.classList.add('tb--drag');
    });
    grip.addEventListener('pointermove', (e) => {
      if (!active) return;
      const r = this.el.getBoundingClientRect();
      this.el.style.left = e.clientX - r.width / 2 + 'px';
      this.el.style.top = e.clientY - 20 + 'px';
      this.el.style.right = this.el.style.bottom = 'auto';
    });
    const end = (e: PointerEvent) => {
      if (!active) return;
      active = false;
      this.el.classList.remove('tb--drag');
      const fx = e.clientX / innerWidth, fy = e.clientY / innerHeight;
      const d = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy };
      this.side = (Object.entries(d).sort((a, b) => a[1] - b[1])[0][0]) as Side;
      prefs.set('toolbarSide', this.side);
      this.applySide();
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  applySide(): void {
    this.el.style.left = this.el.style.top = this.el.style.right = this.el.style.bottom = '';
    this.el.dataset.side = this.side;
    document.body.dataset.tb = this.side;
    window.dispatchEvent(new Event('toolbar-moved'));
  }

  destroy(): void {
    this.closePop();
    document.removeEventListener('pointerdown', this.outside, true);
    delete document.body.dataset.tb;
    this.el.remove();
  }
}
