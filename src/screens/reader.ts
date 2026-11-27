/** Inside a book: page flipping, coloring mode, legend, lamp, solution, closing. */
import { go } from '../app/app';
import { prefs, store } from '../app/store';
import type { BookMeta, Category, PageRec } from '../app/types';
import { PageEngine, type ToolState } from '../coloring/engine';
import { Toolbar } from '../coloring/toolbar';
import { colorPicker } from '../coloring/picker';
import { h, sheet, toast, reducedMotion } from '../ui/dom';
import { coverFace, coverUrl } from '../ui/cover';
import { icons } from '../ui/icons';
import { confetti, sparkle } from '../ui/sparkles';
import { paperFlip } from '../ui/sound';
import { closeBookAnimation } from './book3d';
import { shareBook, sharePage } from '../app/share';
import { shelfScreen } from './shelf';

type Entry = { kind: 'cover' } | { kind: 'page'; id: string } | { kind: 'congrats' } | { kind: 'back' };

interface Surface { el: HTMLElement; aspect: number; engine?: PageEngine; page?: PageRec; snapshot(): Node; destroy(): Promise<void> }

export function readerScreen(el: HTMLElement, book: BookMeta, cat: Category) {
  const rtl = book.direction === 'rtl';
  const sign = rtl ? -1 : 1;
  const entries: Entry[] = [];
  let backId: string | null = null;
  let coverId: string | null = null;
  const ready = (async () => {
    const pages = await Promise.all(book.pageIds.map((id) => store.page(id)));
    entries.push({ kind: 'cover' });
    for (const p of pages) {
      if (!p) continue;
      if (p.kind === 'cover') { coverId = p.id; continue; }
      if (p.kind === 'back') { backId = p.id; continue; }
      entries.push({ kind: 'page', id: p.id });
    }
    if (book.madeWithClaude) entries.push({ kind: 'congrats' });
    entries.push({ kind: 'back' });
  })();

  const state: ToolState = {
    tool: prefs.get('tool', 'pencil'), color: prefs.get('color', '#ef476f'),
    size: prefs.get('size', 14), eraserSize: prefs.get('eraserSize', 30), opacity: prefs.get('opacity', 1), inside: prefs.get('inside', false),
  };
  if (state.tool === 'picker') state.tool = 'pencil';
  let coloring = false;
  let lampOn = false;
  let index = 0;
  let surface: Surface | null = null;
  let busy = false;
  let toolbar: Toolbar | null = null;
  let toolBeforePicker: ToolState['tool'] = 'pencil';

  // ----- DOM -----
  const title = h('h1', { class: 'reader__title', dir: 'auto' }, book.title);
  const counter = h('span', { class: 'reader__count', 'aria-live': 'polite' });
  const solutionBtn = h('button', { class: 'pill', type: 'button', html: icons.solution }, h('span', {}, 'הצג פתרון'));
  const shareBtn = h('button', { class: 'pill', type: 'button', html: icons.share }, h('span', {}, 'שיתוף'));
  const modeBtn = h('button', { class: 'pill pill--gold', type: 'button' });
  const back = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'חזרה למדף', html: icons.back });
  const homeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'לספרייה', title: 'לספרייה', html: icons.home });
  const host = h('div', { class: 'book__page' });
  const frame = h('div', { class: 'book' + (rtl ? ' book--rtl' : '') }, h('div', { class: 'book__edges', 'aria-hidden': 'true' }), host, h('div', { class: 'book__gutter', 'aria-hidden': 'true' }));
  frame.style.setProperty('--cover', book.coverColor);
  const prevBtn = h('button', { class: 'arrow arrow--prev', type: 'button', 'aria-label': 'העמוד הקודם', html: rtl ? icons.next : icons.prev });
  const nextBtn = h('button', { class: 'arrow arrow--next', type: 'button', 'aria-label': 'העמוד הבא', html: rtl ? icons.prev : icons.next });
  if (rtl) { prevBtn.classList.add('arrow--right'); nextBtn.classList.add('arrow--left'); } else { prevBtn.classList.add('arrow--left'); nextBtn.classList.add('arrow--right'); }
  const legend = h('div', { class: 'legend', role: 'group', 'aria-label': 'מקרא צבעים' });
  const main = h('div', { class: 'reader__main' }, frame, prevBtn, nextBtn);
  const root = h('main', { class: 'reader' },
    h('header', { class: 'reader__top' }, back, h('div', { class: 'reader__heading' }, title, counter), h('div', { class: 'reader__actions' }, shareBtn, solutionBtn, modeBtn, homeBtn)),
    main);
  // colours are chosen from the colour button in the tool bar (legend, wheel, recent); no strip under the page
  el.append(root);

  // ----- layout -----
  const layout = () => {
    const r = main.getBoundingClientRect();
    const cs = getComputedStyle(main);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const arrowRoom = coloring || r.width < 640 ? 0 : 128;
    const aw = r.width - padX - arrowRoom - 24, ah = r.height - padY - 20;
    const aspect = surface?.aspect ?? 1 / 1.4;
    let w = aw, hgt = aw / aspect;
    if (hgt > ah) { hgt = ah; w = ah * aspect; }
    frame.style.width = Math.max(100, w) + 'px';
    frame.style.height = Math.max(140, hgt) + 'px';
    surface?.engine?.layout();
    toolbar?.placePop();
  };
  const ro = new ResizeObserver(layout);
  ro.observe(main);
  addEventListener('toolbar-moved', layout);

  // ----- surfaces -----
  const coverSurface = async (): Promise<Surface> => {
    const url = coverId ? await coverUrl(book) : null;
    const face = coverFace(book, url);
    const p = coverId ? await store.page(coverId) : undefined;
    return { el: face, aspect: p ? p.width / p.height : 1 / 1.4, snapshot: () => face.cloneNode(true), destroy: async () => face.remove() };
  };
  const backSurface = async (): Promise<Surface> => {
    const url = backId ? await coverUrl(book, 'back') : null;
    const face = coverFace(book, url, 'back');
    const p = backId ? await store.page(backId) : undefined;
    return { el: face, aspect: p ? p.width / p.height : 1 / 1.4, snapshot: () => face.cloneNode(true), destroy: async () => face.remove() };
  };
  /** "Well done" page in the cover colour: free colouring, no numbers. */
  const congratsSurface = async (): Promise<Surface> => {
    const W = 1600, H = 2240;
    const image = await congratsArt(W, H);
    const page: PageRec = { id: 'congrats-' + book.id, bookId: book.id, kind: 'coloring', width: W, height: H, image, labels: [], legend: [], numbersInImage: false };
    const engine = new PageEngine(page, () => state, engineEvents());
    engine.drawEnabled = coloring;
    return { el: engine.el, aspect: W / H, engine, page, snapshot: () => engine.snapshot(1200), destroy: () => engine.destroy() };
  };
  const engineEvents = () => ({
    onHistory: () => toolbar?.update(),
    onSwipe: (d: 1 | -1) => void flip(d),
    onPenWhileReading: () => { setColoring(true); return true; },
    onPick: (hex: string | null) => {
      state.tool = toolBeforePicker;
      if (hex) { setColor(hex); toast('הצבע נדגם'); } else toast('אין כאן צבע לדגום');
      toolbar?.update();
    },
  });
  const pageSurface = async (id: string): Promise<Surface> => {
    const page = await store.page(id);
    if (!page) throw new Error('page missing');
    const engine = new PageEngine(page, () => state, engineEvents());
    engine.drawEnabled = coloring;
    engine.linesVisible = linesShown; engine.linesOpacity = linesOpacity; engine.numbersVisible = numbersShown;
    return { el: engine.el, aspect: page.width / page.height, engine, page, snapshot: () => engine.snapshot(1200), destroy: () => engine.destroy() };
  };
  const makeSurface = (e: Entry) => e.kind === 'cover' ? coverSurface() : e.kind === 'back' ? backSurface() : e.kind === 'congrats' ? congratsSurface() : pageSurface(e.id);

  const leafFace = (content: Node, cls: string) => {
    const f = h('div', { class: 'leaf__face ' + cls });
    f.append(content);
    return f;
  };

  // ----- navigation -----
  async function show(i: number, dir: 0 | 1 | -1) {
    busy = true;
    lampOn = false;
    const old = surface;
    const oldSnap = old?.snapshot();
    let cover: HTMLElement | null = null;
    if (oldSnap) { cover = h('div', { class: 'leaf-static' }); cover.append(oldSnap); host.append(cover); }
    if (old) void old.destroy();
    index = i;
    const next = await makeSurface(entries[i]);
    surface = next;
    host.prepend(next.el);
    layout();
    await next.engine?.ready;
    updateChrome();
    if (dir === 0 || !cover || reducedMotion()) { cover?.remove(); busy = false; afterShow(); return; }
    paperFlip();
    const leaf = h('div', { class: 'leaf' + (rtl ? ' leaf--rtl' : '') });
    const shade = h('div', { class: 'leaf-shade' });
    const dur = 900;
    const ease = 'cubic-bezier(.25,.1,.25,1)';
    if (dir === 1) {
      leaf.append(leafFace(oldSnap!, 'leaf__front'), leafFace(h('div', { class: 'leaf__paper' }), 'leaf__back'));
      cover.remove();
      host.append(shade, leaf);
      shade.animate([{ opacity: 0.45 }, { opacity: 0.25, offset: 0.5 }, { opacity: 0 }], { duration: dur, easing: ease });
      lightOn(leaf, dur, false);
      await leaf.animate([
        { transform: 'rotateY(0deg)' },
        { transform: `rotateY(${-90 * sign}deg) translateZ(8px)`, offset: 0.5 },
        { transform: `rotateY(${-180 * sign}deg)` }], { duration: dur, easing: ease, fill: 'forwards' }).finished;
    } else {
      leaf.append(leafFace(next.snapshot(), 'leaf__front'), leafFace(h('div', { class: 'leaf__paper' }), 'leaf__back'));
      host.append(shade, leaf);
      shade.animate([{ opacity: 0 }, { opacity: 0.25, offset: 0.5 }, { opacity: 0.45 }], { duration: dur, easing: ease });
      lightOn(leaf, dur, true);
      await leaf.animate([
        { transform: `rotateY(${-180 * sign}deg)` },
        { transform: `rotateY(${-90 * sign}deg) translateZ(8px)`, offset: 0.5 },
        { transform: 'rotateY(0deg)' }], { duration: dur, easing: ease, fill: 'forwards' }).finished;
      cover.remove();
    }
    leaf.remove(); shade.remove();
    busy = false;
    afterShow();
  }

  /** Light sweeping across the turning page, so it reads as curved paper. */
  function lightOn(leaf: HTMLElement, dur: number, reverse: boolean) {
    leaf.querySelectorAll<HTMLElement>('.leaf__face').forEach((f) => {
      const g = h('div', { class: 'leaf__light' });
      f.append(g);
      const k = [{ opacity: 0 }, { opacity: 0.55, offset: 0.45 }, { opacity: 0 }];
      g.animate(reverse ? k.reverse() : k, { duration: dur });
    });
  }

  function afterShow() {
    setTimeout(() => surface?.engine?.prepare(), 120);
    if (entries[index].kind === 'congrats') {
      confetti(160);
      const r = host.getBoundingClientRect();
      sparkle(r.left + r.width / 2, r.top + r.height * 0.4, 60, 7);
    }
  }

  async function flip(d: 1 | -1) {
    if (busy || coloring) return;
    const n = index + d;
    if (n < 0) return;
    if (n >= entries.length) { await closeBook(); return; }
    await show(n, d);
  }

  async function closeBook() {
    busy = true;
    await surface?.destroy();
    surface = null;
    root.classList.add('reader--closing');
    void backId;
    await closeBookAnimation(book, entries[index]?.kind === 'back');
    go((r) => shelfScreen(r, cat), 'fade');
  }

  // ----- chrome -----
  function updateChrome() {
    const e = entries[index];
    const pageNo = entries.slice(0, index + 1).filter((x) => x.kind === 'page').length;
    const total = entries.filter((x) => x.kind === 'page').length;
    counter.textContent = e.kind === 'cover' ? 'כריכה' : e.kind === 'back' ? 'כריכה אחורית' : e.kind === 'congrats' ? 'סוף החוברת' : `עמוד ${pageNo} מתוך ${total}`;
    const isPage = e.kind === 'page';
    solutionBtn.hidden = !isPage;
    modeBtn.hidden = !isPage && e.kind !== 'congrats';
    if (modeBtn.hidden && coloring) setColoring(false);
    prevBtn.disabled = index === 0;
    nextBtn.setAttribute('aria-label', index === entries.length - 1 ? 'סגירת החוברת' : 'העמוד הבא');
    renderLegend();
    toolbar?.update();
  }

  /** Full palette that is always at hand, next to the page's legend. */
  const BASIC = [
    '#000000', '#4a4a4a', '#8c8c8c', '#d0d0d0', '#ffffff',
    '#7f1d1d', '#d62828', '#ef476f', '#ff8fab', '#ffc2d1',
    '#9a3412', '#f77f00', '#ff9f1c', '#fcbf49', '#ffe066',
    '#fff3b0', '#606c38', '#3a9d5d', '#80b918', '#b5e48c',
    '#2a9d8f', '#83e3d9', '#03045e', '#1d4ed8', '#4895ef',
    '#8fd3f4', '#3c096c', '#7b2cbf', '#c77dff', '#e0aaff',
    '#5a3218', '#a0522d', '#d4a373', '#f1d3b3', '#e9c46a',
  ];
  function chip(hex: string, label?: string) {
    const b = h('button', { class: 'legend__chip' + (label ? '' : ' legend__chip--plain'), type: 'button', 'aria-label': label ? `צבע מספר ${label}` : hex, title: hex, 'data-c': hex.toLowerCase() },
      h('span', { class: 'legend__dot' }), label ? h('span', { class: 'legend__num' }, label) : null);
    (b.firstElementChild as HTMLElement).style.background = hex;
    b.addEventListener('click', () => { setColor(hex); if (!coloring) setColoring(true); });
    return b;
  }
  function renderLegend() {
    legend.replaceChildren();
    const page = surface?.page;
    legend.hidden = !page;
    if (!page) return;
    for (const e of page.legend) legend.append(chip(e.color, e.label));
    const recent = prefs.get<string[]>('recent', []).filter((c) => !page.legend.some((e) => e.color.toLowerCase() === c.toLowerCase()));
    if (page.legend.length) legend.append(h('span', { class: 'legend__sep', 'aria-hidden': 'true' }));
    if (recent.length) {
      for (const c of recent.slice(0, 6)) legend.append(chip(c));
      legend.append(h('span', { class: 'legend__sep', 'aria-hidden': 'true' }));
    }
    for (const c of BASIC) legend.append(chip(c));
    markLegend();
  }
  const markLegend = () => legend.querySelectorAll<HTMLElement>('.legend__chip').forEach((c) => c.classList.toggle('is-on', c.dataset.c === state.color.toLowerCase()));

  let recentTimer = 0;
  function setColor(hex: string) {
    state.color = hex;
    prefs.set('color', hex);
    markLegend();
    toolbar?.update();
    if (lampOn && surface?.engine) { const r = surface.engine.setLamp(hex); if (!r.ok) { lampOn = false; surface.engine.setLamp(null); } toolbar?.update(); }
    clearTimeout(recentTimer);
    recentTimer = window.setTimeout(() => {
      const rec = prefs.get<string[]>('recent', []).filter((c) => c !== hex);
      rec.unshift(hex);
      prefs.set('recent', rec.slice(0, 12));
    }, 700);
  }

  function setColoring(on: boolean) {
    coloring = on;
    root.classList.toggle('reader--color', on);
    modeBtn.replaceChildren();
    modeBtn.insertAdjacentHTML('afterbegin', on ? icons.book : icons.brush);
    modeBtn.append(h('span', {}, on ? 'חזרה לדפדוף' : 'צביעה'));
    if (surface?.engine) { surface.engine.drawEnabled = on; if (!on) surface.engine.resetView(); }
    if (on && !toolbar) {
      toolbar = new Toolbar({
        state, changed: () => { prefs.set('tool', state.tool === 'picker' ? 'pencil' : state.tool); prefs.set('size', state.size); prefs.set('eraserSize', state.eraserSize); prefs.set('opacity', state.opacity); prefs.set('inside', state.inside); },
        undo: () => surface?.engine?.undo(), redo: () => surface?.engine?.redo(),
        canUndo: () => !!surface?.engine?.history.canUndo, canRedo: () => !!surface?.engine?.history.canRedo,
        lamp: toggleLamp, lampOn: () => lampOn,
        fit: () => surface?.engine?.resetView(),
        colorPanel, layersPanel,
      });
      root.append(toolbar.el);
    } else if (!on && toolbar) {
      if (lampOn) toggleLamp();
      toolbar.destroy(); toolbar = null;
    }
    requestAnimationFrame(layout);
  }

  function toggleLamp(): boolean {
    const eng = surface?.engine;
    if (!eng) return false;
    if (lampOn) { eng.setLamp(null); lampOn = false; return false; }
    const r = eng.setLamp(state.color);
    if (r.ok) { lampOn = true; toast(`מודגשים כל האזורים של ${r.value}`); return true; }
    if (r.reason === 'no-legend') toast('בדף הזה אין מספרים ומקרא להדגשה');
    else if (r.reason === 'no-match') toast('הצבע הנוכחי לא נמצא במקרא. בחרי צבע מהמקרא למטה');
    else if (r.reason === 'not-ready') { toast('רגע, הדף עוד נטען'); setTimeout(() => { if (!lampOn) { toggleLamp(); toolbar?.update(); } }, 600); }
    return false;
  }

  function colorPanel(): HTMLElement {
    const page = surface?.page;
    const key = 'palette.' + (page?.id ?? 'none');
    return colorPicker({
      color: state.color,
      palette: prefs.get<string[]>(key, []),
      recent: prefs.get<string[]>('recent', []),
      legend: page?.legend ?? [],
      onChange: setColor,
      onAddToPalette: (hex) => {
        const pal = prefs.get<string[]>(key, []).filter((c) => c !== hex);
        pal.push(hex); prefs.set(key, pal.slice(-24));
        toolbar?.closePop(); toast('נוסף לפלטה של הדף');
      },
      onEyedropper: () => { toolBeforePicker = state.tool === 'picker' ? 'pencil' : state.tool; state.tool = 'picker'; toolbar?.closePop(); toolbar?.update(); toast('געי בדף כדי לדגום צבע'); },
    });
  }

  let numbersShown = true;
  let linesShown = true;
  let linesOpacity = 1;
  const applyLines = () => { if (surface?.engine) { surface.engine.linesVisible = linesShown; surface.engine.linesOpacity = linesOpacity; } };
  function layersPanel(): HTMLElement {
    const nums = h('input', { type: 'checkbox', id: 'layer-numbers', checked: numbersShown });
    nums.addEventListener('change', () => { numbersShown = nums.checked; if (surface?.engine) surface.engine.numbersVisible = numbersShown; });
    const lines = h('input', { type: 'checkbox', id: 'layer-lines', checked: linesShown });
    lines.addEventListener('change', () => { linesShown = lines.checked; applyLines(); });
    const linesOp = h('input', { type: 'range', class: 'slider', id: 'layer-lines-op', min: 10, max: 100, value: Math.round(linesOpacity * 100), 'aria-label': 'כהות הקווים' });
    linesOp.addEventListener('input', () => { linesOpacity = Number(linesOp.value) / 100; applyLines(); });
    return h('div', { class: 'layers' },
      h('label', { class: 'layers__row', for: 'layer-lines' }, h('span', {}, 'קווים'), lines),
      h('label', { class: 'layers__row', for: 'layer-lines-op' }, h('span', {}, 'כהות הקווים'), linesOp),
      h('label', { class: 'layers__row', for: 'layer-numbers' }, h('span', {}, 'מספרים'), nums),
      h('div', { class: 'layers__row' }, h('span', {}, 'צבע'), h('span', { class: 'muted' }, 'שכבה 1')),
      h('p', { class: 'menu__hint' }, 'הוספה, שכפול ומצבי מיזוג של שכבות יגיעו בשלב הבא'));
  }

  async function openSolution() {
    const s = surface;
    if (!s?.engine || !s.page) return;
    let sol: HTMLCanvasElement | HTMLImageElement | null = null;
    let auto = false;
    if (s.page.solution) {
      sol = new Image(); sol.src = URL.createObjectURL(s.page.solution); sol.alt = 'פתרון';
    } else {
      sol = await s.engine.autoSolution(1400); auto = true;
    }
    if (!sol) { toast('בדף הזה אין מספרים ומקרא, אז אין ממה ליצור פתרון'); return; }
    const mine = s.engine.snapshot(1400);
    sol.classList.add('compare__img');
    mine.classList.add('compare__img');
    const top = h('div', { class: 'compare__top' }, sol);
    const range = h('input', { type: 'range', class: 'slider compare__range', id: 'solution-split', min: 0, max: 100, value: 50, 'aria-label': 'חשיפת הפתרון' });
    const handle = h('div', { class: 'compare__handle' });
    const box = h('div', { class: 'compare', dir: 'ltr' }, mine, top, handle);
    box.style.aspectRatio = `${s.page.width} / ${s.page.height}`;
    const setSplit = () => { top.style.clipPath = `inset(0 0 0 ${range.value}%)`; handle.style.left = range.value + '%'; };
    range.addEventListener('input', setSplit);
    setSplit();
    sheet(auto ? 'פתרון אוטומטי' : 'פתרון מהחוברת',
      h('div', { class: 'solution' },
        auto ? h('p', { class: 'badge' }, 'פתרון אוטומטי: נוצר מהמספרים ומהמקרא') : null,
        box, range,
        h('div', { class: 'solution__legend' }, h('span', {}, 'הדף שלי'), h('span', {}, 'הפתרון'))));
  }

  // ----- wiring -----
  homeBtn.addEventListener('click', async () => { await surface?.destroy(); surface = null; const { categoriesScreen } = await import('./categories'); go(categoriesScreen, 'back'); });
  back.addEventListener('click', async () => { await surface?.destroy(); surface = null; go((r) => shelfScreen(r, cat), 'back'); });
  prevBtn.addEventListener('click', () => void flip(-1));
  nextBtn.addEventListener('click', () => void flip(1));
  modeBtn.addEventListener('click', () => setColoring(!coloring));
  solutionBtn.addEventListener('click', () => void openSolution());
  shareBtn.addEventListener('click', () => {
    const s = surface;
    if (s?.engine && s.page && entries[index].kind === 'page') void sharePage(s.page, () => s.engine!.snapshot(3508));
    else void shareBook(book);
  });
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.matches?.('input, textarea')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) surface?.engine?.redo(); else surface?.engine?.undo(); toolbar?.update(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); surface?.engine?.redo(); toolbar?.update(); return; }
    if (coloring) return;
    if (e.key === 'ArrowRight') void flip(rtl ? -1 : 1);
    if (e.key === 'ArrowLeft') void flip(rtl ? 1 : -1);
  };
  addEventListener('keydown', onKey);
  const onHide = () => { void surface?.engine?.save(); };
  addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', onHide);

  setColoring(false);
  void ready.then(() => {
    // a book always opens on its first page, like a real one
    const start = Math.min(1, entries.length - 1);
    void show(start, 0);
  });

  return () => {
    ro.disconnect();
    removeEventListener('toolbar-moved', layout);
    removeEventListener('keydown', onKey);
    removeEventListener('pagehide', onHide);
    document.removeEventListener('visibilitychange', onHide);
    toolbar?.destroy();
    void surface?.destroy();
  };
}

/** "כל הכבוד!" in hollow balloon letters with balloons, stars and hearts: black outlines on white, to colour freely. */
async function congratsArt(W: number, H: number): Promise<Blob> {
  const family = '"Secular One", "Suez One", sans-serif';
  try { await document.fonts.load(`400 300px ${family}`, 'כל הכבוד'); } catch { /* fall back to what is there */ }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  x.lineJoin = 'round'; x.lineCap = 'round'; x.strokeStyle = '#141414';
  const outline = (draw: () => void, lw = 9) => { x.beginPath(); draw(); x.fillStyle = '#fff'; x.fill(); x.lineWidth = lw; x.stroke(); };
  // frame
  x.lineWidth = 10; x.strokeRect(48, 48, W - 96, H - 96);
  x.lineWidth = 5; x.strokeRect(72, 72, W - 144, H - 144);
  // balloon letters: a very thick outline, hollowed out with white
  // balloon letters, one at a time from the right, each with its own black outline so they stay apart
  const bubble = (text: string, cx: number, cy: number, size: number) => {
    x.font = `${size}px ${family}`; x.textAlign = 'left'; x.textBaseline = 'middle'; x.direction = 'ltr';
    const fat = size * 0.18, gap = size * 0.13;
    const chars = [...text];
    const widths = chars.map((ch) => x.measureText(ch).width);
    const total = widths.reduce((a, w) => a + w, 0) + gap * (chars.length - 1);
    let right = cx + total / 2;
    chars.forEach((ch, i) => {
      const left = right - widths[i];
      x.lineWidth = fat + 16; x.strokeStyle = '#141414'; x.strokeText(ch, left, cy);
      x.lineWidth = fat; x.strokeStyle = '#fff'; x.strokeText(ch, left, cy);
      x.fillStyle = '#fff'; x.fillText(ch, left, cy);
      right = left - gap;
    });
    x.strokeStyle = '#141414';
  };
  bubble('כל', W * 0.5, H * 0.28, 360);
  bubble('הכבוד!', W * 0.5, H * 0.46, 300);
  // balloons with strings
  const balloon = (bx: number, by: number, r: number, tilt: number) => {
    x.save(); x.translate(bx, by); x.rotate(tilt);
    outline(() => x.ellipse(0, 0, r * 0.82, r, 0, 0, Math.PI * 2));
    outline(() => { x.moveTo(-r * 0.12, r * 0.98); x.lineTo(r * 0.12, r * 0.98); x.lineTo(0, r * 1.1); x.closePath(); }, 7);
    x.beginPath(); x.ellipse(-r * 0.35, -r * 0.4, r * 0.12, r * 0.22, -0.5, 0, Math.PI * 2); x.lineWidth = 6; x.stroke();
    x.beginPath(); x.moveTo(0, r * 1.1); x.bezierCurveTo(r * 0.4, r * 1.6, -r * 0.4, r * 2.1, r * 0.1, r * 2.7); x.lineWidth = 5; x.stroke();
    x.restore();
  };
  balloon(W * 0.2, H * 0.67, 150, -0.15);
  balloon(W * 0.5, H * 0.72, 175, 0.02);
  balloon(W * 0.8, H * 0.66, 145, 0.18);
  const star = (sx: number, sy: number, r: number) => outline(() => {
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; x.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
    x.closePath();
  }, 7);
  const heart = (hx: number, hy: number, s: number) => outline(() => {
    x.moveTo(hx, hy + s * 0.35);
    x.bezierCurveTo(hx - s, hy - s * 0.3, hx - s * 0.45, hy - s, hx, hy - s * 0.45);
    x.bezierCurveTo(hx + s * 0.45, hy - s, hx + s, hy - s * 0.3, hx, hy + s * 0.35);
  }, 7);
  star(W * 0.17, H * 0.12, 70); star(W * 0.84, H * 0.15, 85); star(W * 0.12, H * 0.42, 50); star(W * 0.9, H * 0.4, 55);
  star(W * 0.35, H * 0.9, 60); star(W * 0.68, H * 0.92, 48);
  heart(W * 0.5, H * 0.13, 80); heart(W * 0.12, H * 0.9, 60); heart(W * 0.88, H * 0.88, 70);
  for (const [dx, dy, r] of [[0.3, 0.16, 18], [0.7, 0.2, 14], [0.25, 0.56, 16], [0.75, 0.56, 20], [0.07, 0.25, 12], [0.93, 0.26, 15]] as const) outline(() => x.arc(W * dx, H * dy, r, 0, Math.PI * 2), 6);
  return new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
}
