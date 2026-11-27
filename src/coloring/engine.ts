/**
 * One coloring page on screen: paper, colour layer, live stroke layer, line
 * art (multiply) and numbers, with pinch zoom up to 8×, pen pressure/tilt,
 * palm rejection, "inside the lines" clipping, lamp highlight and undo.
 */
import { History, type Patch } from '../app/history';
import { binarize, labelRegions, legendLabelFor, regionAt, regionMask, regionsForLabel, autoSolution, rgbToHex, type RegionMap, type Rect } from '../app/raster';
import { store } from '../app/store';
import type { PageRec } from '../app/types';
import { drawSegment, type StrokePoint, type ToolName } from './brushes';
import { activeAfterRemove, compositeOp, cssBlend, layerId, moveIn, nextName, type Blend, type LayerProps } from './layers';

interface Layer extends LayerProps { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
/** A picture of the layer list, for undoing layer actions. */
interface StructSnap { kind: 'struct'; list: LayerProps[]; active: number }
type Snap = ImageData | StructSnap;
const STRUCT = '__struct__';

export interface ToolState {
  tool: ToolName;
  color: string;
  size: number;
  eraserSize: number;
  opacity: number;
  inside: boolean;
}

export interface EngineEvents {
  onHistory?: () => void;
  onSwipe?: (dir: 1 | -1) => void;
  /** A pen touched the page while coloring is off. Return true to start coloring. */
  onPenWhileReading?: () => boolean;
  onPick?: (hex: string | null) => void;
  onZoom?: (zoom: number) => void;
  /** The layer list or the active layer changed. */
  onLayers?: () => void;
  /** She tried to colour on a locked layer. */
  onLocked?: () => void;
}

/** Optional look for special pages, e.g. the free "well done" page in the cover colour. */
export interface EngineLook {
  paper?: string;
  overlay?: HTMLElement;
  decorate?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

interface Ptr { id: number; type: string; x: number; y: number; sx: number; sy: number; t0: number }

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_ZOOM = 8;

export class PageEngine {
  readonly el: HTMLDivElement;
  private stage: HTMLDivElement;
  private layerBox: HTMLDivElement;
  private layers: Layer[] = [];
  private all = new Map<string, Layer>();
  private activeIdx = 0;
  private get cctx(): CanvasRenderingContext2D { return this.layers[this.activeIdx].ctx; }
  private stroke: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private lines: HTMLImageElement;
  private numbers: SVGSVGElement;
  private lamp: HTMLCanvasElement;
  private linesUrl: string;
  readonly W: number;
  readonly H: number;
  readonly history: History<Snap>;
  map: RegionMap | null = null;
  ready: Promise<void>;
  drawEnabled = false;
  private penSeen = false;
  private ptrs = new Map<number, Ptr>();
  private mode: 'idle' | 'draw' | 'gesture' | 'pan' | 'swipe' = 'idle';
  private drawPtr = -1;
  private last: StrokePoint | null = null;
  private strokeBox: Rect | null = null;
  private strokeTool: ToolName = 'pencil';
  private clip: { canvas: HTMLCanvasElement; rect: Rect } | null = null;
  private maskCache = new Map<number, { canvas: HTMLCanvasElement; rect: Rect }>();
  private gesture = { s0: 1, tx0: 0, ty0: 0, cx: 0, cy: 0, d: 1, t0: 0, moved: 0, count: 0 };
  private s = 1; private tx = 0; private ty = 0; private fit = 1;
  private saveTimer = 0;
  private dirty = false;
  private ro: ResizeObserver;
  lampValue: string | null = null;
  private mapActive = -1;

  constructor(readonly page: PageRec, private tools: () => ToolState, private ev: EngineEvents = {}, private look: EngineLook = {}) {
    this.W = page.width; this.H = page.height;
    const mk = <K extends keyof HTMLElementTagNameMap>(t: K, c: string) => { const e = document.createElement(t); e.className = c; return e; };
    this.el = mk('div', 'pv') as HTMLDivElement;
    this.stage = mk('div', 'pv__stage') as HTMLDivElement;
    this.stage.style.width = this.W + 'px';
    this.stage.style.height = this.H + 'px';
    const paper = mk('div', 'pv__paper');
    this.layerBox = mk('div', 'pv__layers') as HTMLDivElement;
    this.stroke = mk('canvas', 'pv__stroke') as HTMLCanvasElement;
    this.stroke.width = this.W; this.stroke.height = this.H;
    this.sctx = this.stroke.getContext('2d')!;
    this.layers = [this.makeLayer({ id: layerId(), name: 'שכבה 1', visible: true, locked: false, opacity: 1, blend: 'normal' })];
    this.lines = mk('img', 'pv__lines') as HTMLImageElement;
    this.lines.alt = '';
    this.lines.draggable = false;
    this.linesUrl = URL.createObjectURL(page.image);
    this.lines.src = this.linesUrl;
    this.numbers = document.createElementNS(SVG_NS, 'svg');
    this.numbers.setAttribute('class', 'pv__numbers');
    this.numbers.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
    this.lamp = mk('canvas', 'pv__lamp') as HTMLCanvasElement;
    this.lamp.width = Math.round(this.W / 2); this.lamp.height = Math.round(this.H / 2);
    this.lamp.hidden = true;
    if (this.look.paper) paper.style.background = this.look.paper;
    this.stage.append(paper, this.lines, this.layerBox, this.lamp, this.numbers);
    this.restack();
    if (this.look.overlay) { this.look.overlay.classList.add('pv__overlay'); this.stage.append(this.look.overlay); }
    this.el.append(this.stage);
    this.renderNumbers();

    this.history = new History<Snap>({
      read: (x, y, w, h, layer) => (layer === STRUCT ? this.structSnap() : this.layerById(layer).ctx.getImageData(x, y, w, h)),
      write: (p: Patch<Snap>) => {
        if (p.layer === STRUCT) this.restoreStruct(p.data as StructSnap);
        else { this.layerById(p.layer).ctx.putImageData(p.data as ImageData, p.x, p.y); this.layersChanged(false); }
        this.scheduleSave();
      },
    }, 60);

    this.bindInput();
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.el);
    this.ready = this.load();
  }

  private async load() {
    await this.lines.decode().catch(() => undefined);
    const paint = await store.paint(this.page.id);
    if (!paint) return;
    const drawInto = async (l: Layer, b: Blob) => {
      try { const bmp = await createImageBitmap(b); l.ctx.drawImage(bmp, 0, 0, this.W, this.H); bmp.close(); } catch { /* blank */ }
    };
    if (paint.layers?.length) {
      this.layers = paint.layers.map((x) => this.makeLayer({ id: x.id, name: x.name, visible: x.visible, locked: x.locked, opacity: x.opacity, blend: x.blend as Blend }));
      await Promise.all(paint.layers.map((x, i) => drawInto(this.layers[i], x.blob)));
      this.activeIdx = Math.max(0, Math.min(this.layers.length - 1, paint.active ?? this.layers.length - 1));
      this.restack();
      this.ev.onLayers?.();
    } else await drawInto(this.layers[0], paint.color);
  }

  // ----- colour layers -----
  private makeLayer(p: LayerProps, from?: HTMLCanvasElement): Layer {
    const canvas = document.createElement('canvas');
    canvas.className = 'pv__color';
    canvas.width = this.W; canvas.height = this.H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    if (from) ctx.drawImage(from, 0, 0);
    const l: Layer = { ...p, canvas, ctx };
    this.all.set(l.id, l);
    return l;
  }

  private layerById(id?: string): Layer {
    return (id && this.all.get(id)) || this.layers[this.activeIdx];
  }

  /** Put the canvases in order, with the live stroke right above the active layer. */
  private restack() {
    const kids: HTMLElement[] = [];
    this.layers.forEach((l, i) => {
      l.canvas.style.display = l.visible ? '' : 'none';
      l.canvas.style.opacity = String(l.opacity);
      l.canvas.style.mixBlendMode = cssBlend(l.blend);
      kids.push(l.canvas);
      if (i === this.activeIdx) kids.push(this.stroke);
    });
    this.stroke.style.mixBlendMode = cssBlend(this.layers[this.activeIdx].blend);
    this.layerBox.replaceChildren(...kids);
  }

  private structSnap(): StructSnap {
    return { kind: 'struct', list: this.layers.map(({ id, name, visible, locked, opacity, blend }) => ({ id, name, visible, locked, opacity, blend })), active: this.activeIdx };
  }

  private restoreStruct(s: StructSnap) {
    this.layers = s.list.map((p) => Object.assign(this.all.get(p.id)!, p));
    this.activeIdx = Math.min(s.active, this.layers.length - 1);
    this.layersChanged(true);
  }

  /** Something about the layers changed: redraw the stack and, if locks may have moved, the borders. */
  private layersChanged(borders: boolean) {
    this.restack();
    if (borders) { this.map = null; this.maskCache.clear(); }
    this.ev.onLayers?.();
  }

  /** Record the layer list before a layer action, so it can be undone. */
  private structAction(fn: () => void, borders = false) {
    this.history.push({ x: 0, y: 0, w: 0, h: 0, data: this.structSnap(), layer: STRUCT });
    fn();
    this.layersChanged(borders);
    this.scheduleSave();
    this.ev.onHistory?.();
  }

  get layerList(): (LayerProps & { active: boolean; thumb: HTMLCanvasElement })[] {
    return this.layers.map((l, i) => ({ id: l.id, name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity, blend: l.blend, active: i === this.activeIdx, thumb: l.canvas }));
  }
  get activeLayer(): LayerProps { return this.layers[this.activeIdx]; }

  selectLayer(id: string): void { const i = this.layers.findIndex((l) => l.id === id); if (i >= 0 && i !== this.activeIdx) { this.activeIdx = i; this.restack(); this.ev.onLayers?.(); } }

  addLayer(name?: string): void {
    this.structAction(() => {
      const l = this.makeLayer({ id: layerId(), name: name || nextName(this.layers), visible: true, locked: false, opacity: 1, blend: 'normal' });
      this.layers.splice(this.activeIdx + 1, 0, l);
      this.activeIdx += 1;
    });
  }

  duplicateLayer(id: string): void {
    const i = this.layers.findIndex((l) => l.id === id); if (i < 0) return;
    const src = this.layers[i];
    this.structAction(() => {
      const l = this.makeLayer({ id: layerId(), name: src.name + ' (עותק)', visible: true, locked: false, opacity: src.opacity, blend: src.blend }, src.canvas);
      this.layers.splice(i + 1, 0, l);
      this.activeIdx = i + 1;
    });
  }

  removeLayer(id: string): void {
    const i = this.layers.findIndex((l) => l.id === id); if (i < 0) return;
    if (this.layers.length === 1) { this.clearLayer(id); return; }
    const wasLocked = this.layers[i].locked;
    this.structAction(() => {
      this.activeIdx = activeAfterRemove(this.layers.length, i, this.activeIdx);
      this.layers.splice(i, 1);
    }, wasLocked);
  }

  /** Empty one layer (undoable like a stroke). */
  clearLayer(id: string): void {
    const l = this.all.get(id); if (!l) return;
    this.history.push({ x: 0, y: 0, w: this.W, h: this.H, data: l.ctx.getImageData(0, 0, this.W, this.H), layer: l.id });
    l.ctx.clearRect(0, 0, this.W, this.H);
    this.layersChanged(l.locked); this.scheduleSave(); this.ev.onHistory?.();
  }

  moveLayer(id: string, dir: 1 | -1): void {
    const i = this.layers.findIndex((l) => l.id === id); if (i < 0) return;
    if (i + dir < 0 || i + dir >= this.layers.length) return;
    this.structAction(() => {
      const activeId = this.layers[this.activeIdx].id;
      moveIn(this.layers, i, dir);
      this.activeIdx = this.layers.findIndex((l) => l.id === activeId);
    });
  }

  setLayer(id: string, patch: Partial<Pick<LayerProps, 'name' | 'visible' | 'locked' | 'opacity' | 'blend'>>): void {
    const l = this.layers.find((x) => x.id === id); if (!l) return;
    this.structAction(() => { Object.assign(l, patch); }, 'locked' in patch || ('visible' in patch && l.locked));
  }

  /** Locked, visible layers other than the active one: their colour is protected and acts as a border. */
  private guards(): Layer[] {
    return this.layers.filter((l, i) => l.locked && l.visible && i !== this.activeIdx);
  }

  /** Build the region map when the main thread is idle (after a page flip), so animations stay smooth. */
  prepare(): void {
    if (this.map) return;
    const run = () => { if (!this.map && this.stroke.width) this.buildRegions(); };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(run, { timeout: 1500 }); else setTimeout(run, 400);
  }

  private buildRegions() {
    if (!this.lines.naturalWidth) return;
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(this.lines, 0, 0, this.W, this.H);
    const d = x.getImageData(0, 0, this.W, this.H).data;
    const walls = binarize(d, this.W, this.H);
    // the colour of a locked layer is a border too, so each layer can set its own lines
    for (const g of this.guards()) {
      const a = g.ctx.getImageData(0, 0, this.W, this.H).data;
      for (let i = 0; i < walls.length; i++) if (a[i * 4 + 3] > 60) walls[i] = 1;
    }
    this.map = labelRegions(walls, this.W, this.H);
    this.mapActive = this.activeIdx;
    c.width = 0;
  }

  // ----- numbers layer -----
  renderNumbers(): void {
    this.numbers.replaceChildren();
    const lit = this.lampValue;
    for (const l of this.page.labels) {
      const show = !this.page.numbersInImage || (lit !== null && l.value === lit);
      if (!show) continue;
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(l.x)); t.setAttribute('y', String(l.y));
      const isLit = lit !== null && l.value === lit;
      const size = isLit ? l.size * 1.7 : l.size;
      t.setAttribute('font-size', String(size));
      t.setAttribute('stroke-width', String(size * 0.22));
      t.setAttribute('class', 'num' + (isLit ? ' num--lit' : '') + (l.uncertain ? ' num--unsure' : ''));
      t.style.transformOrigin = `${l.x}px ${l.y}px`;
      t.textContent = l.value;
      this.numbers.append(t);
    }
  }

  set numbersVisible(v: boolean) { this.numbers.style.visibility = v ? '' : 'hidden'; }
  set linesVisible(v: boolean) { this.lines.style.visibility = v ? '' : 'hidden'; }
  set linesOpacity(v: number) { this.lines.style.opacity = String(v); }

  // ----- view -----
  layout(): void {
    const r = this.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const prevFit = this.fit;
    this.fit = Math.min(r.width / this.W, r.height / this.H);
    if (Math.abs(this.s - prevFit) < 1e-6 || this.s < this.fit) this.s = this.fit;
    this.clampView();
    this.apply();
  }

  get zoom(): number { return this.s / this.fit; }

  resetView(): void { this.s = this.fit; this.clampView(); this.apply(); }

  zoomAt(factor: number, cx: number, cy: number): void {
    const ns = Math.max(this.fit, Math.min(this.fit * MAX_ZOOM, this.s * factor));
    const px = (cx - this.tx) / this.s, py = (cy - this.ty) / this.s;
    this.s = ns; this.tx = cx - px * ns; this.ty = cy - py * ns;
    this.clampView(); this.apply();
  }

  private clampView() {
    const r = this.el.getBoundingClientRect();
    const w = this.W * this.s, h = this.H * this.s;
    this.tx = w <= r.width ? (r.width - w) / 2 : Math.min(0, Math.max(r.width - w, this.tx));
    this.ty = h <= r.height ? (r.height - h) / 2 : Math.min(0, Math.max(r.height - h, this.ty));
  }

  private apply() {
    this.stage.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.s})`;
    this.ev.onZoom?.(this.zoom);
  }

  private toPage(e: PointerEvent): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.tx) / this.s, y: (e.clientY - r.top - this.ty) / this.s };
  }

  private local(e: { clientX: number; clientY: number }) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ----- input -----
  private bindInput() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('lostpointercapture', (e) => { if (this.ptrs.has(e.pointerId)) this.up(e, true); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = this.local(e);
      this.zoomAt(Math.exp(-e.deltaY * 0.0022), p.x, p.y);
    }, { passive: false });
  }

  private isEraserButton(e: PointerEvent) {
    return e.pointerType === 'pen' && ((e.buttons & 32) !== 0 || (e.buttons & 2) !== 0 || e.button === 5 || e.button === 2);
  }

  private canDraw(e: PointerEvent): boolean {
    if (e.pointerType === 'pen') return true;
    if (e.pointerType === 'mouse') return e.button === 0;
    // touch draws only on devices where no pen has been seen (palm rejection)
    return !this.penSeen;
  }

  private down(e: PointerEvent) {
    if (e.pointerType === 'pen') this.penSeen = true;
    const p = this.local(e);
    // a touch while the pen is drawing is a palm: ignore it
    if (e.pointerType === 'touch' && this.mode === 'draw' && this.ptrs.get(this.drawPtr)?.type === 'pen') return;
    this.ptrs.set(e.pointerId, { id: e.pointerId, type: e.pointerType, x: p.x, y: p.y, sx: p.x, sy: p.y, t0: performance.now() });
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ok */ }
    const touches = [...this.ptrs.values()].filter((q) => q.type === 'touch');

    if (e.pointerType === 'pen' && !this.drawEnabled) {
      if (!this.ev.onPenWhileReading?.()) return;
    }

    if (touches.length >= 2) {
      if (this.mode === 'draw' && this.ptrs.get(this.drawPtr)?.type === 'touch') this.cancelStroke();
      this.startGesture();
      return;
    }
    if (this.mode !== 'idle') return;

    if (this.drawEnabled && this.canDraw(e)) {
      if (this.tools().tool === 'picker') { this.pick(e); return; }
      this.startStroke(e);
      return;
    }
    if (e.pointerType === 'touch' || e.pointerType === 'mouse') {
      this.mode = this.drawEnabled || this.zoom > 1.01 ? 'pan' : 'swipe';
      this.gesture.tx0 = this.tx; this.gesture.ty0 = this.ty;
    }
  }

  private move(e: PointerEvent) {
    const ptr = this.ptrs.get(e.pointerId);
    if (!ptr) return;
    const p = this.local(e);
    ptr.x = p.x; ptr.y = p.y;
    if (this.mode === 'draw' && e.pointerId === this.drawPtr) {
      const evs = e.getCoalescedEvents?.() ?? [e];
      for (const ce of evs.length ? evs : [e]) this.extendStroke(ce);
      return;
    }
    if (this.mode === 'gesture') { this.updateGesture(); return; }
    if (this.mode === 'pan') {
      this.tx = this.gesture.tx0 + (ptr.x - ptr.sx);
      this.ty = this.gesture.ty0 + (ptr.y - ptr.sy);
      this.clampView(); this.apply();
    }
  }

  private up(e: PointerEvent, cancelled = false) {
    const ptr = this.ptrs.get(e.pointerId);
    if (!ptr) return;
    this.ptrs.delete(e.pointerId);
    if (this.mode === 'draw' && e.pointerId === this.drawPtr) {
      if (cancelled) this.cancelStroke(); else this.commitStroke();
      this.mode = 'idle';
      return;
    }
    if (this.mode === 'gesture') {
      if (this.ptrs.size === 0) {
        const quick = performance.now() - this.gesture.t0 < 300 && this.gesture.moved < 14 && this.gesture.count === 2;
        if (quick && !cancelled) { this.undo(); }
        this.mode = 'idle';
      } else if ([...this.ptrs.values()].filter((q) => q.type === 'touch').length < 2) {
        // one finger left: keep panning from where it is
        const rest = [...this.ptrs.values()][0];
        rest.sx = rest.x; rest.sy = rest.y;
        this.gesture.tx0 = this.tx; this.gesture.ty0 = this.ty;
        this.mode = 'pan';
        this.gesture.moved = 99;
      }
      return;
    }
    if (this.mode === 'swipe' && !cancelled) {
      const dx = ptr.x - ptr.sx, dy = ptr.y - ptr.sy, dt = performance.now() - ptr.t0;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4 && dt < 900) this.ev.onSwipe?.(dx < 0 ? 1 : -1);
    }
    if (this.ptrs.size === 0) this.mode = 'idle';
  }

  private startGesture() {
    const [a, b] = [...this.ptrs.values()].filter((q) => q.type === 'touch');
    const first = this.mode !== 'gesture';
    this.mode = 'gesture';
    this.gesture.s0 = this.s; this.gesture.tx0 = this.tx; this.gesture.ty0 = this.ty;
    this.gesture.cx = (a.x + b.x) / 2; this.gesture.cy = (a.y + b.y) / 2;
    this.gesture.d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    if (first) { this.gesture.t0 = performance.now(); this.gesture.moved = 0; this.gesture.count = 2; }
    else this.gesture.count = 3;
  }

  private updateGesture() {
    const ts = [...this.ptrs.values()].filter((q) => q.type === 'touch');
    if (ts.length < 2) return;
    const [a, b] = ts;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    this.gesture.moved = Math.max(this.gesture.moved, Math.hypot(cx - this.gesture.cx, cy - this.gesture.cy), Math.abs(d - this.gesture.d));
    const ns = Math.max(this.fit, Math.min(this.fit * MAX_ZOOM, this.gesture.s0 * (d / this.gesture.d)));
    const px = (this.gesture.cx - this.gesture.tx0) / this.gesture.s0, py = (this.gesture.cy - this.gesture.ty0) / this.gesture.s0;
    this.s = ns; this.tx = cx - px * ns; this.ty = cy - py * ns;
    this.clampView(); this.apply();
  }

  // ----- strokes -----
  private diameter(): number {
    const t = this.tools();
    return (this.strokeTool === 'eraser' ? t.eraserSize : t.size) * (Math.max(this.W, this.H) / 1000);
  }

  private pt(e: PointerEvent): StrokePoint {
    const { x, y } = this.toPage(e);
    const p = e.pointerType === 'pen' ? Math.max(0.05, e.pressure || 0.05) : e.pointerType === 'touch' && e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : 0.6;
    const tilt = e.pointerType === 'pen' ? Math.min(1, Math.hypot(e.tiltX || 0, e.tiltY || 0) / 70) : 0;
    return { x, y, p, tilt };
  }

  private startStroke(e: PointerEvent) {
    const t = this.tools();
    this.strokeTool = this.isEraserButton(e) ? 'eraser' : t.tool;
    const layer = this.layers[this.activeIdx];
    if (layer.locked || !layer.visible) { this.ev.onLocked?.(); this.mode = 'idle'; return; }
    // the borders depend on which layers are locked besides this one
    if (this.map && this.mapActive !== this.activeIdx && this.guards().length) { this.map = null; this.maskCache.clear(); }
    this.mode = 'draw';
    this.drawPtr = e.pointerId;
    this.stroke.style.opacity = this.strokeTool === 'eraser' ? '1' : String(t.opacity * (this.strokeTool === 'highlighter' ? 0.45 : 1));
    this.clip = null;
    if (t.inside && this.strokeTool !== 'eraser' && !this.map) this.buildRegions();
    if (t.inside && this.strokeTool !== 'eraser' && this.map) {
      const { x, y } = this.toPage(e);
      const id = regionAt(this.map, x, y, 8);
      if (id) this.clip = this.maskFor(id);
    }
    const p = this.pt(e);
    this.last = p;
    this.strokeBox = null;
    this.paint(p, p, true);
  }

  private extendStroke(e: PointerEvent) {
    if (!this.last) return;
    const p = this.pt(e);
    if (Math.hypot(p.x - this.last.x, p.y - this.last.y) < 0.6) return;
    this.paint(this.last, p, false);
    this.last = p;
  }

  private paint(a: StrokePoint, b: StrokePoint, first: boolean) {
    const t = this.tools();
    const r = drawSegment(this.sctx, { tool: this.strokeTool, color: t.color, diameter: this.diameter() }, a, b, first);
    const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
    const dirty = { x, y, w: Math.min(this.W, Math.ceil(r.x + r.w)) - x, h: Math.min(this.H, Math.ceil(r.y + r.h)) - y };
    if (dirty.w <= 0 || dirty.h <= 0) return;
    if (this.clip) {
      const c = this.sctx;
      c.save();
      c.beginPath(); c.rect(dirty.x, dirty.y, dirty.w, dirty.h); c.clip();
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(this.clip.canvas, this.clip.rect.x, this.clip.rect.y);
      c.restore();
    }
    // never colour over a locked layer
    const guards = this.strokeTool === 'eraser' ? [] : this.guards();
    if (guards.length) {
      const c = this.sctx;
      c.save();
      c.beginPath(); c.rect(dirty.x, dirty.y, dirty.w, dirty.h); c.clip();
      c.globalCompositeOperation = 'destination-out';
      for (const g of guards) c.drawImage(g.canvas, 0, 0);
      c.restore();
    }
    this.strokeBox = this.strokeBox ? union(this.strokeBox, dirty) : dirty;
  }

  private cancelStroke() {
    if (this.strokeBox) { const b = this.strokeBox; this.sctx.clearRect(b.x, b.y, b.w, b.h); }
    this.strokeBox = null; this.last = null; this.mode = 'idle'; this.drawPtr = -1;
  }

  private commitStroke() {
    const b = this.strokeBox;
    this.last = null; this.drawPtr = -1;
    if (!b) return;
    const before = this.cctx.getImageData(b.x, b.y, b.w, b.h);
    this.history.push({ x: b.x, y: b.y, w: b.w, h: b.h, data: before, layer: this.layers[this.activeIdx].id });
    const c = this.cctx;
    c.save();
    if (this.strokeTool === 'eraser') c.globalCompositeOperation = 'destination-out';
    else c.globalAlpha = this.tools().opacity * (this.strokeTool === 'highlighter' ? 0.45 : 1);
    c.drawImage(this.stroke, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
    c.restore();
    this.sctx.clearRect(b.x, b.y, b.w, b.h);
    this.strokeBox = null;
    this.scheduleSave();
    this.ev.onHistory?.();
  }

  private maskFor(id: number): { canvas: HTMLCanvasElement; rect: Rect } {
    const hit = this.maskCache.get(id);
    if (hit) return hit;
    const m = regionMask(this.map!, [id], 3);
    const canvas = maskCanvas(m.alpha, m.rect.w, m.rect.h);
    const out = { canvas, rect: m.rect };
    if (this.maskCache.size > 24) this.maskCache.clear();
    this.maskCache.set(id, out);
    return out;
  }

  // ----- eyedropper -----
  private pick(e: PointerEvent) {
    const { x, y } = this.toPage(e);
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.W || yi >= this.H) { this.ev.onPick?.(null); return; }
    const t = document.createElement('canvas'); t.width = 5; t.height = 5;
    const tx = t.getContext('2d', { willReadFrequently: true })!;
    // what she sees: the printed page (with its colour squares) under the colour layers
    const ox = Math.max(0, xi - 2), oy = Math.max(0, yi - 2);
    if (this.lines.naturalWidth) tx.drawImage(this.lines, ox * this.lines.naturalWidth / this.W, oy * this.lines.naturalHeight / this.H, 5 * this.lines.naturalWidth / this.W, 5 * this.lines.naturalHeight / this.H, 0, 0, 5, 5);
    for (const l of this.layers) if (l.visible) { tx.globalAlpha = l.opacity; tx.globalCompositeOperation = compositeOp(l.blend); tx.drawImage(l.canvas, -(Math.max(0, xi - 2)), -(Math.max(0, yi - 2))); }
    const d = tx.getImageData(0, 0, 5, 5).data;
    let r = 0, g = 0, b = 0, a = 0;
    for (let i = 0; i < d.length; i += 4) { const w = d[i + 3] / 255; r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; a += w; }
    this.ev.onPick?.(a < 0.5 ? null : rgbToHex(r / a, g / a, b / a));
  }

  // ----- undo -----
  undo(): void { if (this.history.undo()) this.ev.onHistory?.(); }
  redo(): void { if (this.history.redo()) this.ev.onHistory?.(); }

  // ----- lamp -----
  /** Highlight every region of the number that belongs to `hex`. Returns the label, or a reason it can't. */
  setLamp(hex: string | null): { ok: true; value: string } | { ok: false; reason: 'off' | 'no-legend' | 'no-match' | 'not-ready' } {
    if (!hex) { this.lampValue = null; this.lamp.hidden = true; this.el.classList.remove('pv--lamp'); this.renderNumbers(); return { ok: false, reason: 'off' }; }
    if (!this.page.legend.length || !this.page.labels.length) return { ok: false, reason: 'no-legend' };
    if (!this.map) this.buildRegions();
    if (!this.map) return { ok: false, reason: 'not-ready' };
    const value = legendLabelFor(this.page.legend, hex);
    if (value === null) return { ok: false, reason: 'no-match' };
    this.lampValue = value;
    const ids = regionsForLabel(this.map, this.page.labels, value);
    const m = regionMask(this.map, ids, 3);
    const lc = this.lamp.getContext('2d')!;
    const k = this.lamp.width / this.W;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, this.lamp.width, this.lamp.height);
    lc.fillStyle = 'rgba(28, 14, 4, 0.55)';
    lc.fillRect(0, 0, this.lamp.width, this.lamp.height);
    if (m.rect.w) {
      const mc = maskCanvas(m.alpha, m.rect.w, m.rect.h);
      const gold = document.createElement('canvas');
      gold.width = mc.width; gold.height = mc.height;
      const g = gold.getContext('2d')!;
      g.drawImage(mc, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#ffd35a'; g.fillRect(0, 0, gold.width, gold.height);
      lc.save();
      lc.scale(k, k);
      lc.filter = `blur(${Math.max(4, 14 * k)}px)`;
      for (let i = 0; i < 3; i++) lc.drawImage(gold, m.rect.x, m.rect.y);
      lc.filter = 'none';
      lc.globalCompositeOperation = 'destination-out';
      lc.drawImage(mc, m.rect.x, m.rect.y);
      lc.restore();
      mc.width = 0; gold.width = 0;
    }
    this.lamp.hidden = false;
    this.el.classList.add('pv--lamp');
    this.renderNumbers();
    return { ok: true, value };
  }

  // ----- outputs -----
  /** Flattened picture of the page (paper + colour + lines + numbers), for the page-flip and the solution slider. */
  snapshot(maxSide = 1400): HTMLCanvasElement {
    const k = Math.min(1, maxSide / Math.max(this.W, this.H));
    const c = document.createElement('canvas');
    c.width = Math.round(this.W * k); c.height = Math.round(this.H * k);
    const x = c.getContext('2d')!;
    x.fillStyle = this.look.paper ?? '#fffdf8'; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'multiply';
    if (this.lines.naturalWidth && this.lines.style.visibility !== 'hidden') { x.globalAlpha = Number(this.lines.style.opacity || 1); x.drawImage(this.lines, 0, 0, c.width, c.height); x.globalAlpha = 1; }
    this.drawLayers(x, c.width, c.height);
    if (!this.page.numbersInImage) drawNumbers(x, this.page.labels, k);
    this.look.decorate?.(x, c.width, c.height);
    return c;
  }

  /** All visible colour layers, flattened the way they look on screen. */
  private drawLayers(x: CanvasRenderingContext2D, w: number, h: number) {
    for (const l of this.layers) {
      if (!l.visible) continue;
      x.globalAlpha = l.opacity; x.globalCompositeOperation = compositeOp(l.blend);
      x.drawImage(l.canvas, 0, 0, w, h);
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }

  /** Automatic solution from the numbers and the legend. */
  async autoSolution(maxSide = 1400): Promise<HTMLCanvasElement | null> {
    if (!this.map) this.buildRegions();
    if (!this.map || !this.page.legend.length || !this.page.labels.length) return null;
    const px = autoSolution(this.map, this.page.labels, this.page.legend);
    const full = document.createElement('canvas');
    full.width = this.W; full.height = this.H;
    full.getContext('2d')!.putImageData(new ImageData(px as unknown as Uint8ClampedArray<ArrayBuffer>, this.W, this.H), 0, 0);
    const k = Math.min(1, maxSide / Math.max(this.W, this.H));
    const c = document.createElement('canvas');
    c.width = Math.round(this.W * k); c.height = Math.round(this.H * k);
    const x = c.getContext('2d')!;
    x.imageSmoothingQuality = 'high';
    x.drawImage(full, 0, 0, c.width, c.height);
    x.globalCompositeOperation = 'multiply';
    if (this.lines.naturalWidth) x.drawImage(this.lines, 0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over';
    full.width = 0;
    return c;
  }

  private scheduleSave() {
    this.dirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.save(), 1200);
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    clearTimeout(this.saveTimer);
    const toBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    // flat picture (for thumbnails and backups) plus every layer on its own
    const flat = document.createElement('canvas'); flat.width = this.W; flat.height = this.H;
    this.drawLayers(flat.getContext('2d')!, this.W, this.H);
    const color = await toBlob(flat); flat.width = 0;
    if (!color) return;
    const layers = [];
    for (const l of this.layers) {
      const blob = await toBlob(l.canvas);
      if (blob) layers.push({ id: l.id, name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity, blend: l.blend, blob });
    }
    await store.putPaint({ pageId: this.page.id, color, updatedAt: Date.now(), layers, active: this.activeIdx });
  }

  async destroy(): Promise<void> {
    this.el.remove();
    this.ro.disconnect();
    await this.save();
    URL.revokeObjectURL(this.linesUrl);
    this.maskCache.clear();
    for (const l of this.all.values()) l.canvas.width = 0;
    this.stroke.width = 0; this.lamp.width = 0;
  }
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function maskCanvas(alpha: Uint8Array, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  const x = c.getContext('2d')!;
  const img = x.createImageData(c.width, c.height);
  for (let i = 0; i < alpha.length; i++) { img.data[i * 4 + 3] = alpha[i]; }
  x.putImageData(img, 0, 0);
  return c;
}

export function drawNumbers(x: CanvasRenderingContext2D, labels: PageRec['labels'], k = 1): void {
  x.save();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round';
  for (const l of labels) {
    const fs = l.size * k;
    x.font = `700 ${fs}px Fredoka, "Varela Round", sans-serif`;
    x.lineWidth = fs * 0.22; x.strokeStyle = '#fff'; x.fillStyle = '#1b1410';
    x.strokeText(l.value, l.x * k, l.y * k);
    x.fillText(l.value, l.x * k, l.y * k);
  }
  x.restore();
}
