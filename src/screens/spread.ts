/**
 * Browsing a book like a real one: two pages side by side on an old leather
 * binding, parchment pages, a page block whose thickness follows where you
 * are, and a 3D leaf that turns over the spine. Tapping a colouring page
 * opens it for colouring (the reader does that part).
 */
import { h, reducedMotion } from '../ui/dom';
import { paperFlip } from '../ui/sound';

export interface Leaf { key: string; entry: number; tappable: boolean }
/** first = the side you read first (right in a Hebrew book), second = the other side. */
interface Spread { first: number | null; second: number | null }

export interface SpreadHooks {
  render(leaf: Leaf): Promise<HTMLElement>;
  onOpen(leaf: Leaf): void;
  onChange(): void;
}

export class SpreadView {
  readonly el: HTMLElement;
  private tome: HTMLElement;
  private sides: { first: HTMLElement; second: HTMLElement };
  private edges: { first: HTMLElement; second: HTMLElement };
  private spreads: Spread[] = [];
  private cache = new Map<number, Promise<HTMLElement>>();
  index = 0;
  busy = false;

  constructor(private leaves: Leaf[], private rtl: boolean, private aspect: number, coverColor: string, private hooks: SpreadHooks) {
    // spread 0: the closed front cover; then pairs; last: the back cover
    const inner = leaves.map((_, i) => i).slice(1, -1);
    this.spreads.push({ first: null, second: 0 });
    for (let i = 0; i < inner.length; i += 2) this.spreads.push({ first: inner[i], second: inner[i + 1] ?? null });
    this.spreads.push({ first: leaves.length - 1, second: null });

    const mk = (cls: string) => h('div', { class: 'tome__side ' + cls });
    this.sides = { first: mk('tome__side--first'), second: mk('tome__side--second') };
    this.edges = { first: h('div', { class: 'tome__edge tome__edge--first', 'aria-hidden': 'true' }), second: h('div', { class: 'tome__edge tome__edge--second', 'aria-hidden': 'true' }) };
    this.tome = h('div', { class: 'tome' + (rtl ? ' tome--rtl' : '') },
      h('div', { class: 'tome__board', 'aria-hidden': 'true' }),
      this.edges.first, this.edges.second,
      this.sides.first, this.sides.second,
      h('div', { class: 'tome__spine', 'aria-hidden': 'true' }),
      h('div', { class: 'tome__ribbon', 'aria-hidden': 'true' }));
    this.tome.style.setProperty('--cover', coverColor);
    this.el = h('div', { class: 'spreadview' }, this.tome);

    // swipe to turn, tap a page to colour it
    let sx = 0, sy = 0, st = 0;
    this.el.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; st = Date.now(); });
    this.el.addEventListener('pointerup', (e) => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - st < 700) {
        // a swipe toward the spine from the side you read next moves forward
        const forward = this.rtl ? dx > 0 : dx < 0;
        void this.flip(forward ? 1 : -1);
        return;
      }
      if (Math.hypot(dx, dy) > 12) return;
      const side = (e.target as HTMLElement).closest('.tome__side');
      if (!side || this.busy) return;
      const s = this.spreads[this.index];
      const li = side === this.sides.first ? s.first : s.second;
      if (li != null && this.leaves[li].tappable) this.hooks.onOpen(this.leaves[li]);
    });
  }

  get count(): number { return this.spreads.length; }
  get atEnd(): boolean { return this.index === this.spreads.length - 1; }
  /** The entries shown now, in reading order. */
  current(): Leaf[] { const s = this.spreads[this.index]; return [s.first, s.second].filter((x): x is number => x != null).map((i) => this.leaves[i]); }

  spreadOfEntry(entry: number): number {
    const li = this.leaves.findIndex((l) => l.entry === entry);
    const i = this.spreads.findIndex((s) => s.first === li || s.second === li);
    return Math.max(0, i);
  }

  private leafEl(i: number | null): Promise<HTMLElement | null> {
    if (i == null) return Promise.resolve(null);
    if (!this.cache.has(i)) this.cache.set(i, this.hooks.render(this.leaves[i]).then((el) => { el.classList.add('tpage'); return el; }));
    return this.cache.get(i)!;
  }

  /** Forget a page's picture (after colouring it), so it is drawn again. */
  refresh(entry: number): void {
    this.leaves.forEach((l, i) => { if (l.entry === entry) this.cache.delete(i); });
  }

  layout(maxW: number, maxH: number): void {
    // two pages plus the binding around them
    const ratio = (this.aspect * 2 * 1.0) / 1.0;
    let ph = maxH * 0.94, pw = ph * this.aspect;
    if (pw * 2 > maxW * 0.94) { pw = (maxW * 0.94) / 2; ph = pw / this.aspect; }
    void ratio;
    this.tome.style.setProperty('--pw', pw + 'px');
    this.tome.style.setProperty('--ph', ph + 'px');
  }

  private setEdges(i: number) {
    // the page block: more paper on the side still to read
    const total = Math.max(1, this.spreads.length - 1);
    const done = i / total;
    const max = 16;
    this.edges.first.style.setProperty('--thick', (i === 0 ? 0 : Math.max(2, done * max)) + 'px');
    this.edges.second.style.setProperty('--thick', (i === this.spreads.length - 1 ? 0 : Math.max(2, (1 - done) * max)) + 'px');
    this.tome.classList.toggle('tome--closed', i === 0 || i === this.spreads.length - 1);
    this.tome.classList.toggle('tome--front', i === 0);
    this.tome.classList.toggle('tome--back', i === this.spreads.length - 1);
  }

  private async fill(side: HTMLElement, i: number | null) {
    const el = await this.leafEl(i);
    side.replaceChildren(...(el ? [el] : []));
    side.classList.toggle('is-empty', !el);
    side.classList.toggle('is-tappable', i != null && this.leaves[i].tappable);
  }

  async show(i: number): Promise<void> {
    this.index = Math.max(0, Math.min(this.spreads.length - 1, i));
    const s = this.spreads[this.index];
    await Promise.all([this.fill(this.sides.first, s.first), this.fill(this.sides.second, s.second)]);
    this.setEdges(this.index);
    this.hooks.onChange();
  }

  /** Turn one leaf. Returns 'end' or 'start' when there is nothing more that way. */
  async flip(d: 1 | -1): Promise<'ok' | 'end' | 'start' | 'busy'> {
    if (this.busy) return 'busy';
    const n = this.index + d;
    if (n < 0) return 'start';
    if (n >= this.spreads.length) return 'end';
    this.busy = true;
    const old = this.spreads[this.index], nu = this.spreads[n];
    // the leaf lifts from one side and lands on the other
    const fromSide = d === 1 ? 'second' : 'first';
    const toSide = d === 1 ? 'first' : 'second';
    const frontIdx = d === 1 ? old.second : old.first;
    const backIdx = d === 1 ? nu.first : nu.second;
    const [front, back] = await Promise.all([this.leafEl(frontIdx), this.leafEl(backIdx)]);
    // underneath: the new page appears where the leaf lifted; the landing side keeps the old page until covered
    await this.fill(this.sides[fromSide], d === 1 ? nu.second : nu.first);
    if (reducedMotion()) { await this.show(n); this.busy = false; return 'ok'; }
    paperFlip();
    const leaf = h('div', { class: `tleaf tleaf--${fromSide}` },
      h('div', { class: 'tleaf__face tleaf__front' }, front ? front.cloneNode(true) : h('div', { class: 'tleaf__blank' })),
      h('div', { class: 'tleaf__face tleaf__back' }, back ? back.cloneNode(true) : h('div', { class: 'tleaf__blank' })),
      h('div', { class: 'tleaf__light', 'aria-hidden': 'true' }));
    if (frontIdx == null) leaf.querySelector('.tleaf__front')!.classList.add('is-empty');
    if (backIdx == null) leaf.querySelector('.tleaf__back')!.classList.add('is-empty');
    this.tome.append(leaf);
    // which way round the spine depends on the side and the book's direction
    const firstIsRight = this.rtl;
    const leafOnRight = (fromSide === 'first') === firstIsRight;
    const sign = leafOnRight ? -1 : 1;
    const shade = h('div', { class: `tome__shade tome__shade--${toSide}` });
    this.tome.append(shade);
    const dur = 1050, ease = 'cubic-bezier(.3,.05,.25,1)';
    shade.animate([{ opacity: 0 }, { opacity: 0.35, offset: 0.55 }, { opacity: 0 }], { duration: dur, easing: ease });
    leaf.querySelector<HTMLElement>('.tleaf__light')!.animate([{ opacity: 0 }, { opacity: 0.5, offset: 0.45 }, { opacity: 0 }], { duration: dur, easing: ease });
    await leaf.animate([
      { transform: 'rotateY(0deg)' },
      { transform: `rotateY(${90 * sign}deg) translateZ(6px)`, offset: 0.5 },
      { transform: `rotateY(${180 * sign}deg)` }], { duration: dur, easing: ease, fill: 'forwards' }).finished;
    await this.fill(this.sides[toSide], d === 1 ? nu.first : nu.second);
    leaf.remove(); shade.remove();
    this.index = n;
    this.setEdges(n);
    this.busy = false;
    this.hooks.onChange();
    return 'ok';
  }
}
