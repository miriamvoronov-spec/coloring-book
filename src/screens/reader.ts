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
import { shelfScreen } from './shelf';

type Entry = { kind: 'cover' } | { kind: 'page'; id: string } | { kind: 'congrats' };

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
  const modeBtn = h('button', { class: 'pill pill--gold', type: 'button' });
  const back = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'חזרה למדף', html: icons.back });
  const host = h('div', { class: 'book__page' });
  const frame = h('div', { class: 'book' + (rtl ? ' book--rtl' : '') }, h('div', { class: 'book__edges', 'aria-hidden': 'true' }), host, h('div', { class: 'book__gutter', 'aria-hidden': 'true' }));
  frame.style.setProperty('--cover', book.coverColor);
  const prevBtn = h('button', { class: 'arrow arrow--prev', type: 'button', 'aria-label': 'העמוד הקודם', html: rtl ? icons.next : icons.prev });
  const nextBtn = h('button', { class: 'arrow arrow--next', type: 'button', 'aria-label': 'העמוד הבא', html: rtl ? icons.prev : icons.next });
  if (rtl) { prevBtn.classList.add('arrow--right'); nextBtn.classList.add('arrow--left'); } else { prevBtn.classList.add('arrow--left'); nextBtn.classList.add('arrow--right'); }
  const legend = h('div', { class: 'legend', role: 'group', 'aria-label': 'מקרא צבעים' });
  const main = h('div', { class: 'reader__main' }, frame, prevBtn, nextBtn);
  const root = h('main', { class: 'reader' },
    h('header', { class: 'reader__top' }, back, h('div', { class: 'reader__heading' }, title, counter), h('div', { class: 'reader__actions' }, solutionBtn, modeBtn)),
    main, legend);
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
  const congratsSurface = (): Surface => {
    const text = 'כל הכבוד! ✨';
    const letters = h('div', { class: 'congrats__text', dir: 'rtl' });
    [...text].forEach((ch, i) => { const s = h('span', {}, ch === ' ' ? ' ' : ch); s.style.animationDelay = i * 0.08 + 's'; letters.append(s); });
    const c = h('div', { class: 'congrats' }, h('div', { class: 'cover__frame' }), letters, h('p', { class: 'congrats__sub' }, 'סיימת את כל הדפים בחוברת'));
    c.style.setProperty('--cover', book.coverColor);
    return { el: c, aspect: 1 / 1.4, snapshot: () => c.cloneNode(true), destroy: async () => c.remove() };
  };
  const pageSurface = async (id: string): Promise<Surface> => {
    const page = await store.page(id);
    if (!page) throw new Error('page missing');
    const engine = new PageEngine(page, () => state, {
      onHistory: () => toolbar?.update(),
      onSwipe: (d) => void flip(d),
      onPenWhileReading: () => { setColoring(true); return true; },
      onPick: (hex) => {
        state.tool = toolBeforePicker;
        if (hex) { setColor(hex); toast('הצבע נדגם'); } else toast('אין כאן צבע לדגום');
        toolbar?.update();
      },
    });
    engine.drawEnabled = coloring;
    return { el: engine.el, aspect: page.width / page.height, engine, page, snapshot: () => engine.snapshot(1200), destroy: () => engine.destroy() };
  };
  const makeSurface = (e: Entry) => e.kind === 'cover' ? coverSurface() : e.kind === 'congrats' ? Promise.resolve(congratsSurface()) : pageSurface(e.id);

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
    if (old) await old.destroy();
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
    const dur = 720;
    if (dir === 1) {
      leaf.append(leafFace(oldSnap!.cloneNode(true), 'leaf__front'), leafFace(h('div', { class: 'leaf__paper' }), 'leaf__back'));
      cover.remove();
      host.append(shade, leaf);
      shade.animate([{ opacity: 0.5 }, { opacity: 0 }], { duration: dur, easing: 'ease-in' });
      await leaf.animate([{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${-180 * sign}deg)` }], { duration: dur, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'forwards' }).finished;
    } else {
      leaf.append(leafFace(next.snapshot(), 'leaf__front'), leafFace(h('div', { class: 'leaf__paper' }), 'leaf__back'));
      host.append(shade, leaf);
      shade.animate([{ opacity: 0 }, { opacity: 0.5 }], { duration: dur, easing: 'ease-out' });
      await leaf.animate([{ transform: `rotateY(${-180 * sign}deg)` }, { transform: 'rotateY(0deg)' }], { duration: dur, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'forwards' }).finished;
      cover.remove();
    }
    leaf.remove(); shade.remove();
    busy = false;
    afterShow();
  }

  function afterShow() {
    prefs.set('lastPage.' + book.id, index);
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
    await closeBookAnimation(book);
    go((r) => shelfScreen(r, cat), 'fade');
  }

  // ----- chrome -----
  function updateChrome() {
    const e = entries[index];
    const pageNo = entries.slice(0, index + 1).filter((x) => x.kind === 'page').length;
    const total = entries.filter((x) => x.kind === 'page').length;
    counter.textContent = e.kind === 'cover' ? 'כריכה' : e.kind === 'congrats' ? 'סוף החוברת' : `עמוד ${pageNo} מתוך ${total}`;
    const isPage = e.kind === 'page';
    solutionBtn.hidden = !isPage;
    modeBtn.hidden = !isPage;
    if (!isPage && coloring) setColoring(false);
    prevBtn.disabled = index === 0;
    nextBtn.setAttribute('aria-label', index === entries.length - 1 ? 'סגירת החוברת' : 'העמוד הבא');
    renderLegend();
    toolbar?.update();
  }

  function renderLegend() {
    legend.replaceChildren();
    const page = surface?.page;
    legend.hidden = !page || !page.legend.length;
    if (!page) return;
    for (const e of page.legend) {
      const b = h('button', { class: 'legend__chip', type: 'button', 'aria-label': `צבע מספר ${e.label}`, 'data-c': e.color.toLowerCase() },
        h('span', { class: 'legend__dot' }), h('span', { class: 'legend__num' }, e.label));
      (b.firstElementChild as HTMLElement).style.background = e.color;
      b.addEventListener('click', () => { setColor(e.color); if (!coloring) setColoring(true); });
      legend.append(b);
    }
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
  function layersPanel(): HTMLElement {
    const nums = h('input', { type: 'checkbox', id: 'layer-numbers', checked: numbersShown });
    nums.addEventListener('change', () => { numbersShown = nums.checked; if (surface?.engine) surface.engine.numbersVisible = numbersShown; });
    return h('div', { class: 'layers' },
      h('div', { class: 'layers__row is-locked' }, h('span', {}, '🔒 קווים'), h('span', { class: 'muted' }, 'נעולה, תמיד למעלה')),
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
  back.addEventListener('click', async () => { await surface?.destroy(); surface = null; go((r) => shelfScreen(r, cat), 'back'); });
  prevBtn.addEventListener('click', () => void flip(-1));
  nextBtn.addEventListener('click', () => void flip(1));
  modeBtn.addEventListener('click', () => setColoring(!coloring));
  solutionBtn.addEventListener('click', () => void openSolution());
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
    const saved = prefs.get<number>('lastPage.' + book.id, -1);
    const start = saved > 0 && saved < entries.length ? saved : Math.min(1, entries.length - 1);
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
