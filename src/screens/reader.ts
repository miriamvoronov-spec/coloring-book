import { sizes } from '../app/sizes';
/** Inside a book: page flipping, coloring mode, legend, lamp, solution, closing. */
import { BLEND_HE, type Blend } from '../coloring/layers';
import { openPalette, closePalette } from '../ui/palette';
import { go } from '../app/app';
import { prefs, store } from '../app/store';
import type { BookMeta, Category, PageRec } from '../app/types';
import { PageEngine, type ToolState } from '../coloring/engine';
import { Toolbar, enabledTools } from '../coloring/toolbar';
import { colorPicker } from '../coloring/picker';
import { h, sheet, toast, reducedMotion } from '../ui/dom';
import { coverFace, coverTone, coverUrl, shade } from '../ui/cover';
import { icons } from '../ui/icons';
import { confetti, sparkle } from '../ui/sparkles';
import { paperFlip } from '../ui/sound';
import { logoMark } from '../ui/logo';
import { closeBookAnimation } from './book3d';
import { endBookTheme, playBookTheme } from '../ui/music';
import { shareBook, sharePage } from '../app/share';
import { shelfScreen } from './shelf';
import { SpreadView, type Leaf } from './spread';
import { openReference, closeReference, setRefPicking, refOpen } from '../ui/reference';

type Entry = { kind: 'cover' } | { kind: 'title' } | { kind: 'page'; id: string } | { kind: 'congrats' } | { kind: 'back' };

interface Surface { el: HTMLElement; aspect: number; engine?: PageEngine; page?: PageRec; snapshot(): Node; destroy(): Promise<void> }

export function readerScreen(el: HTMLElement, book: BookMeta, cat: Category) {
  const rtl = book.direction === 'rtl';
  const sign = rtl ? -1 : 1;
  const entries: Entry[] = [];
  let backId: string | null = null;
  let coverId: string | null = null;
  const ready = (async () => {
    const pages = await Promise.all(book.pageIds.map((id) => store.page(id)));
    entries.push({ kind: 'cover' }, { kind: 'title' });
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
    tool: ((t) => (enabledTools().includes(t) && t !== 'picker' ? t : enabledTools().find((x) => x !== 'eraser' && x !== 'picker') ?? 'marker'))(prefs.get<ToolState['tool']>('tool.v2', 'marker')), color: prefs.get('color', '#ef476f'),
    size: prefs.get('size', 14), eraserSize: prefs.get('eraserSize', 30), opacity: prefs.get('opacity', 1), inside: (prefs.get('inside.v2', false) as boolean),
  };
  if (state.tool === 'picker') state.tool = 'marker';
  let coloring = false;
  let lampOn = false;
  let index = 0;
  let surface: Surface | null = null;
  let busy = false;
  let toolbar: Toolbar | null = null;
  let toolBeforePicker: ToolState['tool'] = 'marker';
  const startPicker = () => {
    toolBeforePicker = state.tool === 'picker' ? 'marker' : state.tool; state.tool = 'picker'; toolbar?.closePop(); toolbar?.update();
    setRefPicking((hex) => finishPick(hex));
    toast(refOpen() ? 'געי בדף או בחלונית הרפרנס כדי לדגום צבע' : 'געי בדף כדי לדגום צבע');
  };

  // ----- DOM -----
  const title = h('h1', { class: 'reader__title', dir: 'auto' }, book.title);
  const counter = h('span', { class: 'reader__count', 'aria-live': 'polite' });
  const solutionBtn = h('button', { class: 'pill', type: 'button', html: icons.solution }, h('span', {}, 'הצג פתרון'));
  const refBtn = h('button', { class: 'pill', type: 'button', html: icons.grid, title: 'חלונית רפרנס צפה: הפתרון או תמונה משלך, עם זום' }, h('span', {}, 'חלונית רפרנס'));
  const palBtn = h('button', { class: 'pill', type: 'button', title: 'צבעי הדף מקוביות הצבע', 'aria-label': 'צבעי הדף' }, h('b', { class: 'pill__emoji', 'aria-hidden': 'true' }, '🎨'), h('span', {}, 'צבעי הדף'));
  const shareBtn = h('button', { class: 'pill', type: 'button', html: icons.share }, h('span', {}, 'שיתוף'));
  const gridBtn = h('button', { class: 'pill', type: 'button', html: icons.grid, title: 'כל הדפים' }, h('span', {}, 'כל הדפים'));
  const modeBtn = h('button', { class: 'pill pill--gold', type: 'button' });
  const back = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'חזרה למדף', html: icons.back });
  const homeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'לספרייה', title: 'לספרייה', html: icons.home });
  const host = h('div', { class: 'book__page' });
  const frame = h('div', { class: 'book' + (rtl ? ' book--rtl' : '') }, h('div', { class: 'book__edges', 'aria-hidden': 'true' }), host, h('div', { class: 'book__gutter', 'aria-hidden': 'true' }));
  frame.style.setProperty('--cover', book.coverColor);
  /** The binding's colour: taken from the cover picture when there is one. */
  let bindColor = book.coverColor;
  const prevBtn = h('button', { class: 'arrow arrow--prev', type: 'button', 'aria-label': 'העמוד הקודם', html: rtl ? icons.next : icons.prev });
  const nextBtn = h('button', { class: 'arrow arrow--next', type: 'button', 'aria-label': 'העמוד הבא', html: rtl ? icons.prev : icons.next });
  if (rtl) { prevBtn.classList.add('arrow--right'); nextBtn.classList.add('arrow--left'); } else { prevBtn.classList.add('arrow--left'); nextBtn.classList.add('arrow--right'); }
  const legend = h('div', { class: 'legend', role: 'group', 'aria-label': 'מקרא צבעים' });
  const main = h('div', { class: 'reader__main' }, frame, prevBtn, nextBtn);
  const root = h('main', { class: 'reader reader--browse' },
    h('header', { class: 'reader__top' }, back, h('div', { class: 'reader__heading' }, title, counter), h('div', { class: 'reader__actions' }, gridBtn, shareBtn, palBtn, refBtn, solutionBtn, modeBtn, homeBtn)),
    main, legend);
  // under the page: only the page's own number→colour legend; every other colour is in the tool bar
  el.append(root);

  let browsing = true;
  let spread: SpreadView | null = null;
  const leafUrls: string[] = [];
  const blobUrl = (b: Blob) => { const u = URL.createObjectURL(b); leafUrls.push(u); return u; };
  let congratsBlob: Promise<Blob> | null = null;

  /** One page of the open book, as a still picture (colouring happens full screen). */
  async function renderLeaf(leaf: Leaf): Promise<HTMLElement> {
    const e = entries[leaf.entry];
    if (leaf.key === 'cover' || leaf.key === 'back') {
      const which = leaf.key as 'cover' | 'back';
      return coverFace(book, await coverUrl(book, which), which);
    }
    if (leaf.key === 'plate') {
      // the inside of the cover: a plain starry endpaper
      const el = h('div', { class: 'tpage--plate' });
      el.style.setProperty('--cover', bindColor);
      return el;
    }
    if (leaf.key === 'titlepage') {
      return h('div', {},
        h('div', { class: 'book3d__frame', 'aria-hidden': 'true' }),
        h('div', { class: 'book3d__titlepage' },
          h('div', { class: 'book3d__mark', html: logoMark(120) }),
          h('div', { class: 'book3d__ttl', dir: 'auto' }, book.title),
          h('div', { class: 'book3d__rule', 'aria-hidden': 'true' }, h('span', {}, '✦')),
          h('div', { class: 'book3d__sub', dir: 'ltr' }, "Miriam's Coloring Books")));
    }
    const art = h('div', { class: 'tpage__art' });
    const el = h('div', {}, art);
    if (e.kind === 'page') {
      const [pg, paint] = await Promise.all([store.page(e.id), store.paint(e.id)]);
      if (pg) {
        art.append(h('img', { class: 'tpage__lines', src: blobUrl(pg.image), alt: '', decoding: 'async' }));
        if (paint?.color) art.append(h('img', { class: 'tpage__paint', src: blobUrl(paint.color), alt: '', decoding: 'async' }));
      }
      const no = entries.slice(0, leaf.entry + 1).filter((x) => x.kind === 'page').length;
      el.append(h('div', { class: 'tpage__no' }, String(no)));
    } else if (e.kind === 'congrats') {
      congratsBlob ??= congratsArt(1600, 2240, book.style);
      const [img, paint] = await Promise.all([congratsBlob, store.paint('congrats-' + book.id)]);
      art.append(h('img', { class: 'tpage__lines', src: blobUrl(img), alt: '', decoding: 'async' }));
      if (paint?.color) art.append(h('img', { class: 'tpage__paint', src: blobUrl(paint.color), alt: '', decoding: 'async' }));
    }
    return el;
  }

  /** Tap a page in the book: it opens on its own, as large as the screen allows, ready to colour. */
  async function openForColoring(entry: number) {
    if (busy) return;
    browsing = false;
    root.classList.remove('reader--browse');
    await show(entry, 0);
    setColoring(true);
    updateChrome();
  }

  /** Done colouring: back to the open book, on the spread with this page. */
  async function backToBook() {
    const entry = index;
    hideSolution(); closeReference(); closePalette();
    setColoring(false);
    const s = surface; surface = null;
    await s?.destroy();
    host.replaceChildren();
    spread?.refresh(entry);
    browsing = true;
    root.classList.add('reader--browse');
    layout();
    await spread?.show(spread.spreadOfEntry(entry));
  }

  // ----- layout -----
  const layout = () => {
    const r = main.getBoundingClientRect();
    const cs = getComputedStyle(main);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const arrowRoom = coloring || r.width < 640 ? 0 : 128;
    const aw = r.width - padX - arrowRoom - 24, ah = r.height - padY - 20;
    if (browsing) { spread?.layout(r.width - padX - (r.width < 640 ? 24 : 170), r.height - padY - 24); return; }
    const aspect = surface?.aspect ?? 1 / 1.4;
    let w = aw, hgt = aw / aspect;
    if (hgt > ah) { hgt = ah; w = ah * aspect; }
    if (sizes().fit === 'width') { w = aw; hgt = ah; }   // fill the screen's width; scroll down the page
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
  /** The first spread after the cover: the endpaper inside the cover, and the title page beside it. */
  const titleSurface = async (): Promise<Surface> => {
    const inside = h('div', { class: 'spread__in' });
    inside.style.setProperty('--endpaper', shade(bindColor, -0.06));
    const titlePage = h('div', { class: 'spread__page' },
      h('div', { class: 'book3d__frame', 'aria-hidden': 'true' }),
      h('div', { class: 'book3d__titlepage' },
        h('div', { class: 'book3d__mark', html: logoMark(120) }),
        h('div', { class: 'book3d__ttl', dir: 'auto' }, book.title),
        h('div', { class: 'book3d__rule', 'aria-hidden': 'true' }, h('span', {}, '✦')),
        h('div', { class: 'book3d__sub', dir: 'ltr' }, "Miriam's Coloring Books")));
    // in a right-to-left book the cover opens to the right, so its inside is on the right
    const el = h('div', { class: 'spread' + (rtl ? ' spread--rtl' : '') }, inside, titlePage);
    return { el, aspect: 2 / 1.4, snapshot: () => el.cloneNode(true), destroy: async () => el.remove() };
  };
  /** "Well done" page in the cover colour: free colouring, no numbers. */
  const congratsSurface = async (): Promise<Surface> => {
    const W = 1600, H = 2240;
    const image = await congratsArt(W, H, book.style);
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
      finishPick(hex);
    },
    onLayers: () => renderLayers(),
    onLocked: () => toast('השכבה הזאת נעולה או מוסתרת. בחרי שכבה אחרת או פתחי את המנעול 🔓'),
  });
  const pageSurface = async (id: string): Promise<Surface> => {
    const page = await store.page(id);
    if (!page) throw new Error('page missing');
    const engine = new PageEngine(page, () => state, engineEvents());
    engine.drawEnabled = coloring;
    engine.linesVisible = linesShown; engine.linesOpacity = linesOpacity; engine.numbersVisible = numbersShown;
    return { el: engine.el, aspect: page.width / page.height, engine, page, snapshot: () => engine.snapshot(1200), destroy: () => engine.destroy() };
  };
  const makeSurface = (e: Entry) => e.kind === 'cover' ? coverSurface() : e.kind === 'title' ? titleSurface() : e.kind === 'back' ? backSurface() : e.kind === 'congrats' ? congratsSurface() : pageSurface(e.id);

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
    if (browsing) {
      if (!spread) return;
      const r = await spread.flip(d);
      if (r === 'end') await closeBook();
      return;
    }
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
    // put the shelf behind the animation, so the book can fly back to its place
    go((r) => shelfScreen(r, cat), 'none');
    await closeBookAnimation(book, browsing ? !!spread?.atEnd : entries[index]?.kind === 'back', () => {
      const el = document.querySelector<HTMLElement>(`.shelf-book[data-id="${book.id}"] .shelf-book__body`);
      if (!el) return null;
      el.closest('.shelf-book')?.scrollIntoView({ block: 'nearest' });
      return el.getBoundingClientRect();
    });
  }

  // ----- chrome -----
  function updateChrome() {
    if (browsing) {
      const shown = spread?.current() ?? [];
      const nos = shown.filter((l) => entries[l.entry]?.kind === 'page').map((l) => entries.slice(0, l.entry + 1).filter((x) => x.kind === 'page').length);
      const total = entries.filter((x) => x.kind === 'page').length;
      const k = shown[0] ? entries[shown[0].entry]?.kind : undefined;
      counter.textContent = nos.length ? `עמוד ${nos.join('–')} מתוך ${total}` : k === 'cover' ? 'כריכה' : k === 'back' ? 'כריכה אחורית' : k === 'title' ? 'פתיחה' : k === 'congrats' ? 'סוף החוברת' : '';
      solutionBtn.hidden = true; refBtn.hidden = true; modeBtn.hidden = true; palBtn.hidden = true; pal?.close();
      prevBtn.disabled = !spread || spread.index === 0;
      nextBtn.setAttribute('aria-label', spread?.atEnd ? 'סגירת החוברת' : 'העמוד הבא');
      return;
    }
    const e = entries[index];
    const pageNo = entries.slice(0, index + 1).filter((x) => x.kind === 'page').length;
    const total = entries.filter((x) => x.kind === 'page').length;
    counter.textContent = e.kind === 'cover' ? 'כריכה' : e.kind === 'title' ? 'פתיחה' : e.kind === 'back' ? 'כריכה אחורית' : e.kind === 'congrats' ? 'סוף החוברת' : `עמוד ${pageNo} מתוך ${total}`;
    const isPage = e.kind === 'page';
    solutionBtn.hidden = !isPage; refBtn.hidden = !isPage;
    palBtn.hidden = !isPage || !surface?.page?.legend.length;
    if (palBtn.hidden) pal?.close();
    else if (pal) openPal();
    modeBtn.hidden = !isPage && e.kind !== 'congrats';
    if (modeBtn.hidden && coloring) setColoring(false);
    prevBtn.disabled = index === 0;
    nextBtn.setAttribute('aria-label', index === entries.length - 1 ? 'סגירת החוברת' : 'העמוד הבא');
    renderLegend();
    toolbar?.update();
  }

  // ----- her own palette row under the page -----
  // One slot per number/letter/sign of the page. A slot fills only with a colour she sampled herself
  // (from the colour squares printed on the page), so nothing gives away which colour goes where.
  type MyPal = { slots: Record<string, string>; extra: string[] };
  let myPal: MyPal = { slots: {}, extra: [] };
  let myPalPage = '';
  let pickInto: string | null = null;   // a slot waiting for the eyedropper
  const palKey = (id: string) => 'mypal-' + id;
  async function loadMyPal() {
    const page = surface?.page;
    if (!page || page.id === myPalPage) return;
    myPalPage = page.id;
    myPal = (await store.kv<MyPal>(palKey(page.id))) ?? { slots: {}, extra: [] };
    renderLegend();
  }
  const saveMyPal = () => { if (myPalPage) void store.setKv(palKey(myPalPage), myPal); };
  /** A sampled colour goes to the slot of the square it came from (the nearest printed colour), or to the extras. */
  function keepSample(hex: string): string | null {
    const page = surface?.page;
    if (!page) return null;
    const label = pickInto;
    pickInto = null;
    if (!label) return null;
    myPal.slots[label] = hex;
    saveMyPal(); refreshPal();
    return label;
  }
  function editSlot(label: string | null, hex: string) {
    let cur = hex;
    const close = sheet(label ? `הצבע של ${label}` : 'צבע בפלטה', h('div', {},
      colorPicker({ color: hex, palette: [], recent: prefs.get<string[]>('recent', []), legend: [],
        onChange: (c) => { cur = c; }, onAddToPalette: () => undefined, onEyedropper: () => { close(); pickInto = label; startPicker(); } }),
      h('div', { class: 'sheet__actions' },
        h('button', { class: 'btn btn--gold', type: 'button', onclick: () => {
          if (label) myPal.slots[label] = cur; else myPal.extra = myPal.extra.map((c) => (c === hex ? cur : c));
          saveMyPal(); setColor(cur); refreshPal(); close();
        } }, 'שמירה'),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => {
          if (label) delete myPal.slots[label]; else myPal.extra = myPal.extra.filter((c) => c !== hex);
          saveMyPal(); refreshPal(); close();
        } }, 'לצבע המקורי'))));
  }
  function renderLegend() {
    legend.replaceChildren();
    const page = surface?.page;
    // no colour row under the page: the page's colours live in "🎨 צבעי הדף"
    legend.hidden = true;
    if (page && page.id !== myPalPage) void loadMyPal();
  }
  const markLegend = () => legend.querySelectorAll<HTMLElement>('.legend__chip').forEach((c) => c.classList.toggle('is-on', !!c.dataset.c && c.dataset.c === state.color.toLowerCase()));

  let recentTimer = 0;
  function setColor(hex: string) {
    state.color = hex;
    prefs.set('color', hex);
    markLegend();
    pal?.mark(hex);
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
        state, onEyedropper: startPicker, changed: () => { prefs.set('tool.v2', state.tool === 'picker' ? 'marker' : state.tool); prefs.set('size', state.size); prefs.set('eraserSize', state.eraserSize); prefs.set('opacity', state.opacity); prefs.set('inside.v2', state.inside); },
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

  const triedFind = new Set<string>();
  function toggleLamp(): boolean {
    const eng = surface?.engine;
    if (!eng) return false;
    if (lampOn) { eng.setLamp(null); lampOn = false; return false; }
    const r = eng.setLamp(state.color);
    if (r.ok) { lampOn = true; toast(`מודגשים כל האזורים של ${r.value}`); return true; }
    if (r.reason === 'no-legend') {
      const pg = eng.page;
      if (pg.numbersInImage && pg.legend.length && !pg.labels.length && !triedFind.has(pg.id)) {
        // a page added before the lamp could read printed numbers: look for them now
        triedFind.add(pg.id);
        toast('מחפשת את המספרים בדף… ✨');
        void (async () => {
          try {
            const { detectLabels } = await import('../app/labels');
            const bmp = await createImageBitmap(pg.image);
            const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
            c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
            const found = detectLabels(c, pg.legend.map((l) => l.label));
            if (!found.length) { toast('לא מצאתי מספרים בדף הזה, אז המנורה לא יכולה להדגיש. הצביעה עובדת כרגיל 🙂'); return; }
            pg.labels.push(...found);
            await store.putPage(pg);
            if (!lampOn && toggleLamp()) toolbar?.update();
          } catch (e) { console.warn(e); toast('לא מצאתי מספרים בדף הזה'); }
        })();
      } else toast(pg.legend.length ? 'לא מצאתי מספרים בדף הזה, אז המנורה לא יכולה להדגיש. הצביעה עובדת כרגיל 🙂' : 'בדף הזה אין מקרא צבעים, אז אין מה להדגיש');
    }
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
      legend: pageColours(),
      onChange: setColor,
      onAddToPalette: (hex) => {
        const pal = prefs.get<string[]>(key, []).filter((c) => c !== hex);
        pal.push(hex); prefs.set(key, pal.slice(-24));
        toolbar?.closePop(); toast('נוסף לפלטה של הדף');
      },
      onEyedropper: startPicker,
    });
  }

  let numbersShown = true;
  let linesShown = true;
  let linesOpacity = 1;
  const applyLines = () => { if (surface?.engine) { surface.engine.linesVisible = linesShown; surface.engine.linesOpacity = linesOpacity; } };
  /** Up to three main colours of a layer, from a tiny copy. */
  function layerColours(c: HTMLCanvasElement): string[] {
    const t = document.createElement('canvas'); t.width = 96; t.height = 96;
    const x = t.getContext('2d', { willReadFrequently: true })!; x.drawImage(c, 0, 0, 96, 96);
    const d = x.getImageData(0, 0, 96, 96).data;
    const count = new Map<string, number>();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 50) continue;
      const k = '#' + [d[i], d[i + 1], d[i + 2]].map((v) => Math.min(255, Math.round(v / 32) * 32).toString(16).padStart(2, '0')).join('');
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  }

  let layersHost: HTMLElement | null = null;
  function layersPanel(): HTMLElement {
    layersHost = h('div', { class: 'layers' });
    renderLayers(true);
    return layersHost;
  }

  /** Colour layers, top layer first: pick, hide, lock, move up and down, rename, and more. */
  function renderLayers(first = false) {
    const host = layersHost;
    if (!host || (!first && !host.isConnected)) return;
    const eng = surface?.engine;
    const nums = h('input', { type: 'checkbox', id: 'layer-numbers', checked: numbersShown });
    nums.addEventListener('change', () => { numbersShown = nums.checked; if (surface?.engine) surface.engine.numbersVisible = numbersShown; });
    const lines = h('input', { type: 'checkbox', id: 'layer-lines', checked: linesShown });
    lines.addEventListener('change', () => { linesShown = lines.checked; applyLines(); });
    const linesOp = h('input', { type: 'range', class: 'slider', id: 'layer-lines-op', min: 10, max: 100, value: Math.round(linesOpacity * 100), 'aria-label': 'כהות הקווים' });
    linesOp.addEventListener('input', () => { linesOpacity = Number(linesOp.value) / 100; applyLines(); });
    const kids: (HTMLElement | null)[] = [];
    if (eng) {
      const list = eng.layerList;
      const rows = h('ol', { class: 'lyr__list', 'aria-label': 'שכבות צבע' });
      list.slice().reverse().forEach((l) => {
        const i = list.indexOf(l);
        const thumb = h('canvas', { class: 'lyr__thumb', width: 48, height: Math.round(48 * eng.H / eng.W) }) as HTMLCanvasElement;
        const tx = thumb.getContext('2d')!; tx.fillStyle = '#fffdf8'; tx.fillRect(0, 0, thumb.width, thumb.height); tx.drawImage(l.thumb, 0, 0, thumb.width, thumb.height);
        const eye = h('button', { class: 'lyr__btn' + (l.visible ? '' : ' is-off'), type: 'button', 'aria-label': l.visible ? 'הסתרת השכבה' : 'הצגת השכבה', 'aria-pressed': String(!l.visible) }, l.visible ? '👁' : '🚫');
        eye.addEventListener('click', (ev) => { ev.stopPropagation(); eng.setLayer(l.id, { visible: !l.visible }); });
        const lock = h('button', { class: 'lyr__btn' + (l.locked ? ' is-on' : ''), type: 'button', 'aria-label': l.locked ? 'פתיחת המנעול' : 'נעילת השכבה', 'aria-pressed': String(l.locked) }, l.locked ? '🔒' : '🔓');
        lock.addEventListener('click', (ev) => { ev.stopPropagation(); eng.setLayer(l.id, { locked: !l.locked }); if (!l.locked) toast('השכבה ננעלה: אי אפשר לצבוע עליה, והצבע שלה הוא גבול לשכבות האחרות'); });
        const up = h('button', { class: 'lyr__btn', type: 'button', 'aria-label': 'להעלות שכבה', disabled: i === list.length - 1 }, '▲');
        up.addEventListener('click', (ev) => { ev.stopPropagation(); eng.moveLayer(l.id, 1); });
        const down = h('button', { class: 'lyr__btn', type: 'button', 'aria-label': 'להוריד שכבה', disabled: i === 0 }, '▼');
        down.addEventListener('click', (ev) => { ev.stopPropagation(); eng.moveLayer(l.id, -1); });
        const name = h('span', { class: 'lyr__name', dir: 'auto' }, l.name);
        // the colours painted on this layer
        const dots = h('span', { class: 'lyr__dots', 'aria-hidden': 'true' });
        for (const c of layerColours(l.thumb)) { const d = h('span', { class: 'lyr__dot' }); d.style.background = c; dots.append(d); }
        const row = h('li', { class: 'lyr__row' + (l.active ? ' is-active' : ''), tabindex: 0, role: 'button', 'aria-label': `שכבה ${l.name}${l.active ? ' (פעילה)' : ''}` }, thumb, name, dots, eye, lock, up, down);
        row.addEventListener('click', () => eng.selectLayer(l.id));
        row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') eng.selectLayer(l.id); });
        rows.append(row);
      });
      const act = eng.activeLayer;
      const add = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, '＋ שכבה חדשה');
      add.addEventListener('click', () => {
        // name it after the number of the colour in her hand, e.g. "צבע 3"
        const lbl = Object.entries(myPal.slots).find(([, c]) => c.toLowerCase() === state.color.toLowerCase())?.[0];
        eng.addLayer(lbl ? `צבע ${lbl}` : undefined);
      });
      const dup = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, '⧉ שכפול');
      dup.addEventListener('click', () => eng.duplicateLayer(act.id));
      const del = h('button', { class: 'btn btn--ghost btn--small', type: 'button' }, list.length > 1 ? '🗑 מחיקה' : '🧽 ניקוי');
      del.addEventListener('click', () => { if (list.length > 1) eng.removeLayer(act.id); else eng.clearLayer(act.id); toast('אפשר לבטל עם ↶'); });
      const rename = h('input', { class: 'field lyr__rename', id: 'layer-name', value: act.name, maxlength: 30, dir: 'auto', 'aria-label': 'שם השכבה' }) as HTMLInputElement;
      rename.addEventListener('change', () => { const v = rename.value.trim(); if (v && v !== act.name) eng.setLayer(act.id, { name: v }); });
      const op = h('input', { type: 'range', class: 'slider', id: 'layer-op', min: 5, max: 100, value: Math.round(act.opacity * 100), 'aria-label': 'שקיפות השכבה' }) as HTMLInputElement;
      op.addEventListener('change', () => eng.setLayer(act.id, { opacity: Number(op.value) / 100 }));
      const blend = h('select', { class: 'field', id: 'layer-blend', 'aria-label': 'מצב מיזוג' },
        ...(Object.keys(BLEND_HE) as Blend[]).map((b) => h('option', { value: b, selected: b === act.blend }, BLEND_HE[b]))) as HTMLSelectElement;
      blend.addEventListener('change', () => eng.setLayer(act.id, { blend: blend.value as Blend }));
      kids.push(h('div', { class: 'lyr__title' }, 'שכבות צבע'), rows,
        h('div', { class: 'lyr__actions' }, add, dup, del),
        h('label', { class: 'layers__row', for: 'layer-name' }, h('span', {}, 'שם'), rename),
        h('label', { class: 'layers__row', for: 'layer-op' }, h('span', {}, 'שקיפות'), op),
        h('label', { class: 'layers__row', for: 'layer-blend' }, h('span', {}, 'מיזוג'), blend),
        h('p', { class: 'menu__hint' }, 'שכבה נעולה מוגנת: אי אפשר לצבוע עליה, ועם "בתוך הקווים" הצבע שלה הוא גבול גם לשכבות האחרות.'));
    }
    kids.push(h('div', { class: 'lyr__title' }, 'קווים ומספרים'),
      h('label', { class: 'layers__row', for: 'layer-lines' }, h('span', {}, 'קווים'), lines),
      h('label', { class: 'layers__row', for: 'layer-lines-op' }, h('span', {}, 'כהות הקווים'), linesOp),
      h('label', { class: 'layers__row', for: 'layer-numbers' }, h('span', {}, 'מספרים'), nums));
    host.replaceChildren(...kids.filter((x): x is HTMLElement => !!x));
  }

  /** The solution picture for this page: the original from the back of the book, or one made from the numbers. */
  async function solutionSrc(): Promise<{ src: string; auto: boolean } | null> {
    const sf = surface;
    if (!sf?.engine || !sf.page) return null;
    if (sf.page.solution) return { src: blobUrl(sf.page.solution), auto: false };
    const c = await sf.engine.autoSolution(1400);
    return c ? { src: c.toDataURL('image/png'), auto: true } : null;
  }

  let solOver: HTMLElement | null = null;
  /** Show the solution laid over the page, fading in; again to hide it. */
  async function toggleSolution() {
    if (solOver) { hideSolution(); return; }
    const sol = await solutionSrc();
    if (!sol) { toast('בדף הזה אין פתרון ואין מספרים ומקרא ליצור ממנו פתרון'); return; }
    surface?.engine?.resetView();
    const img = h('img', { src: sol.src, alt: 'פתרון' });
    const op = h('input', { type: 'range', class: 'slider', min: 15, max: 100, value: 100, 'aria-label': 'שקיפות הפתרון' }) as HTMLInputElement;
    const over = h('div', { class: 'sol-over' }, img);
    const bar = h('div', { class: 'sol-bar' }, h('span', {}, sol.auto ? 'פתרון אוטומטי' : 'הפתרון מהחוברת'), op);
    op.addEventListener('input', () => { over.style.opacity = String(Number(op.value) / 100); });
    host.append(over, bar);
    solOver = over;
    (over as HTMLElement & { _bar?: HTMLElement })._bar = bar;
    requestAnimationFrame(() => over.classList.add('is-on'));
    solutionBtn.querySelector('span')!.textContent = 'הסתר פתרון';
  }
  function hideSolution() {
    const o = solOver as (HTMLElement & { _bar?: HTMLElement }) | null;
    if (!o) return;
    solOver = null;
    o._bar?.remove();
    o.style.opacity = '';
    o.classList.remove('is-on');
    setTimeout(() => o.remove(), 450);
    solutionBtn.querySelector('span')!.textContent = 'הצג פתרון';
  }
  async function openRef() {
    const sol = await solutionSrc().catch(() => null);
    openReference(sol?.src ?? '', sol ? (sol.auto ? 'פתרון אוטומטי' : 'הפתרון מהחוברת') : 'חלונית רפרנס');
  }

  let pal: ReturnType<typeof openPalette> | null = null;
  /** The page's colours, with the ones she changed. */
  const pageColours = () => (surface?.page?.legend ?? []).map((e) => ({ label: e.label, color: myPal.slots[e.label] ?? e.color }));
  function openPal() {
    const entries = pageColours();
    if (!entries.length) return;
    pal = openPalette(entries, state.color, (hex) => { setColor(hex); if (!coloring) setColoring(true); }, () => { pal = null; palBtn.classList.remove('is-on'); }, {
      onEdit: (label, hex) => editSlot(label, hex),
      onSample: (label) => { pickInto = label; if (!coloring) setColoring(true); startPicker(); toast(`געי בצבע בדף, בחלונית הרפרנס או בפתרון, והוא יישמר ל-${label}`); },
    });
    palBtn.classList.add('is-on');
  }
  function refreshPal() { if (pal) openPal(); }

  /** A colour was sampled (from the page, the reference window or the solution). */
  function finishPick(hex: string | null) {
    setRefPicking(null);
    state.tool = toolBeforePicker;
    if (hex) { setColor(hex); const l = keepSample(hex); toast(l ? `הצבע נשמר ל-${l} 🎨` : 'הצבע נדגם'); } else { pickInto = null; toast('אין כאן צבע לדגום'); }
    toolbar?.update();
  }
  // sampling from the solution laid over the page
  host.addEventListener('pointerdown', (e) => {
    if (state.tool !== 'picker' || !solOver) return;
    const img = solOver.querySelector('img'); if (!img || !img.naturalWidth) return;
    e.stopPropagation(); e.preventDefault();
    const r = img.getBoundingClientRect();
    const k = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const px = (e.clientX - (r.left + (r.width - img.naturalWidth * k) / 2)) / k, py = (e.clientY - (r.top + (r.height - img.naturalHeight * k) / 2)) / k;
    const c = document.createElement('canvas'); c.width = 3; c.height = 3;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    try { x.drawImage(img, px - 1, py - 1, 3, 3, 0, 0, 3, 3); } catch { finishPick(null); return; }
    const d = x.getImageData(1, 1, 1, 1).data;
    finishPick(d[3] ? '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('') : null);
  }, true);

  // ----- wiring -----
  homeBtn.addEventListener('click', async () => { await surface?.destroy(); surface = null; const { categoriesScreen } = await import('./categories'); go(categoriesScreen, 'back'); });
  back.addEventListener('click', async () => {
    if (!browsing) { await backToBook(); return; }
    await surface?.destroy(); surface = null; go((r) => shelfScreen(r, cat), 'back');
  });
  prevBtn.addEventListener('click', () => void flip(-1));
  nextBtn.addEventListener('click', () => void flip(1));
  modeBtn.addEventListener('click', () => { if (coloring) void backToBook(); else setColoring(true); });
  solutionBtn.addEventListener('click', () => void toggleSolution());
  refBtn.addEventListener('click', () => void openRef());
  palBtn.addEventListener('click', () => { if (pal) pal.close(); else openPal(); });
  gridBtn.addEventListener('click', () => void openGrid());

  /** Every page of the book at a glance; tap one to jump straight to it. */
  async function openGrid() {
    if (busy) return;
    if (coloring) setColoring(false);
    const urls: string[] = [];
    const url = (b: Blob) => { const u = URL.createObjectURL(b); urls.push(u); return u; };
    const grid = h('div', { class: 'pgrid', role: 'list' });
    let pageNo = 0;
    const cur = browsing ? new Set((spread?.current() ?? []).map((l) => l.entry)) : new Set([index]);
    const tiles = entries.map((e, i) => {
      const art = h('div', { class: 'pgrid__art' });
      let label = '';
      if (e.kind === 'cover' || e.kind === 'back') {
        label = e.kind === 'cover' ? 'כריכה' : 'כריכה אחורית';
        void coverUrl(book, e.kind).then((u) => art.append(coverFace(book, u, e.kind as 'cover' | 'back')));
      } else if (e.kind === 'title') {
        label = 'פתיחה';
        art.append(h('div', { class: 'pgrid__word' }, '📖'));
      } else if (e.kind === 'congrats') {
        label = 'כל הכבוד';
        art.append(h('div', { class: 'pgrid__word' }, '✨'));
      } else {
        label = `עמוד ${++pageNo}`;
        void (async () => {
          const [pg, paint] = await Promise.all([store.page(e.id), store.paint(e.id)]);
          if (!pg) return;
          art.style.aspectRatio = `${pg.width} / ${pg.height}`;
          art.append(h('img', { class: 'pgrid__lines', src: url(pg.image), alt: '', loading: 'lazy', decoding: 'async' }));
          if (paint?.color) art.append(h('img', { class: 'pgrid__paint', src: url(paint.color), alt: '', loading: 'lazy', decoding: 'async' }));
        })();
      }
      const tile = h('button', { class: 'pgrid__tile' + (cur.has(i) ? ' is-current' : ''), type: 'button', role: 'listitem', 'aria-label': label },
        art, h('span', { class: 'pgrid__label' }, label));
      tile.addEventListener('click', async () => {
        close();
        if (!browsing) await backToBook();
        await spread?.show(spread.spreadOfEntry(i));
      });
      return tile;
    });
    grid.append(...tiles);
    const close = sheet('כל הדפים', grid, () => setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 400));
    grid.closest('.sheet')?.classList.add('sheet--wide');
    requestAnimationFrame(() => tiles.find((t) => t.classList.contains('is-current'))?.scrollIntoView({ block: 'center' }));
  }
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
  addEventListener('resize', layout);
  const onHide = () => { void surface?.engine?.save(); };
  addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', onHide);

  setColoring(false);
  void ready.then(async () => {
    // browse it like a real book: two pages at a time; it opens on the endpaper and the title page
    const leaves: Leaf[] = [];
    entries.forEach((e, i) => {
      if (e.kind === 'title') { leaves.push({ key: 'plate', entry: i, tappable: false }, { key: 'titlepage', entry: i, tappable: false }); return; }
      leaves.push({ key: e.kind, entry: i, tappable: e.kind === 'page' || e.kind === 'congrats' });
    });
    const firstPage = entries.find((e) => e.kind === 'page') as { id: string } | undefined;
    const fp = firstPage ? await store.page(firstPage.id) : undefined;
    // the book's shape follows its front cover when it has one, so pages and cover are the same size
    // the book takes the shape of its own pages, so a page fills its leaf like in the printed book
    const cu = await coverUrl(book);
    const cov = !!cu;
    const aspect = fp ? fp.width / fp.height : 1 / 1.4;
    // the binding is the book's own cover colour (the one chosen in its edit sheet); only a book without one takes it from the cover picture
    bindColor = book.coverColor || (await coverTone(cu)) || '#6b3a1f';
    frame.style.setProperty('--cover', bindColor);
    root.style.setProperty('--cover', bindColor);
    spread = new SpreadView(leaves, rtl, aspect, bindColor, {
      render: renderLeaf,
      onOpen: (leaf) => void openForColoring(leaf.entry),
      onChange: () => updateChrome(),
    });
    if (cov) spread.el.classList.add('spreadview--scan');
    main.prepend(spread.el);
    layout();
    await spread.show(1);
  });

  if (book.madeWithClaude && book.music !== false) void playBookTheme(book.id, book.style, book.title);

  return () => {
    void endBookTheme();
    ro.disconnect();
    removeEventListener('toolbar-moved', layout);
    removeEventListener('keydown', onKey); removeEventListener('resize', layout);
    removeEventListener('pagehide', onHide);
    document.removeEventListener('visibilitychange', onHide);
    toolbar?.destroy();
    void surface?.destroy();
    closeReference(); closePalette();
    setTimeout(() => leafUrls.forEach((u) => URL.revokeObjectURL(u)), 2000);
  };
}

/** "כל הכבוד!" in hollow balloon letters with balloons, stars and hearts: black outlines on white, to colour freely. */
/** The well-done page follows the book's drawing style: festive for playful styles, elegant for the rest. */
async function congratsArt(W: number, H: number, style?: string): Promise<Blob> {
  if (!['kids', 'storybook', 'folk'].includes(style ?? '')) return congratsElegant(W, H);
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
  // bunting across the top
  x.beginPath(); x.moveTo(110, 250); x.quadraticCurveTo(W / 2, 400, W - 110, 250); x.lineWidth = 6; x.stroke();
  const flags = 9;
  for (let i = 0; i < flags; i++) {
    const t = (i + 0.5) / flags, fx = (1 - t) * (1 - t) * 110 + 2 * (1 - t) * t * (W / 2) + t * t * (W - 110), fy = (1 - t) * (1 - t) * 250 + 2 * (1 - t) * t * 400 + t * t * 250;
    outline(() => { x.moveTo(fx - 55, fy - 4); x.lineTo(fx + 55, fy - 4); x.lineTo(fx, fy + 120); x.closePath(); }, 7);
    if (i % 2) outline(() => x.arc(fx, fy + 38, 14, 0, Math.PI * 2), 5);
  }
  // hollow balloon letters, drawn one by one from the right with a clear gap, so every letter is its own shape
  const bubble = (text: string, cx: number, cy: number, size: number) => {
    x.font = `${size}px ${family}`; x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.direction = 'ltr';
    const ink = size * 0.07, gap = size * 0.08;
    const chars = [...text];
    const widths = chars.map((ch) => x.measureText(ch).width);
    const total = widths.reduce((a, w) => a + w, 0) + gap * (chars.length - 1);
    const m = x.measureText('כ'); const base = cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    let right = cx + total / 2;
    chars.forEach((ch, i) => {
      const left = right - widths[i];
      x.lineWidth = ink + 4; x.strokeStyle = '#141414'; x.strokeText(ch, left, base);
      x.lineWidth = Math.max(2, ink - 12); x.strokeStyle = '#fff'; x.strokeText(ch, left, base);
      x.fillStyle = '#fff'; x.fillText(ch, left, base);
      right = left - gap;
    });
    x.strokeStyle = '#141414';
  };
  bubble('כל', W * 0.5, H * 0.3, 340);
  bubble('הכבוד!', W * 0.5, H * 0.47, 300);
  // a bunch of balloons tied with one bow
  const knot = { x: W * 0.5, y: H * 0.86 };
  const balloon = (bx: number, by: number, r: number, tilt: number) => {
    x.beginPath(); x.moveTo(bx + Math.sin(tilt) * -r * 1.1, by + r * 1.1); x.quadraticCurveTo((bx + knot.x) / 2 + 30, (by + knot.y) / 2, knot.x, knot.y); x.lineWidth = 5; x.stroke();
    x.save(); x.translate(bx, by); x.rotate(tilt);
    outline(() => x.ellipse(0, 0, r * 0.82, r, 0, 0, Math.PI * 2));
    outline(() => { x.moveTo(-r * 0.12, r * 0.98); x.lineTo(r * 0.12, r * 0.98); x.lineTo(0, r * 1.1); x.closePath(); }, 7);
    x.beginPath(); x.ellipse(-r * 0.35, -r * 0.4, r * 0.12, r * 0.22, -0.5, 0, Math.PI * 2); x.lineWidth = 6; x.stroke();
    x.restore();
  };
  balloon(W * 0.22, H * 0.66, 130, -0.28);
  balloon(W * 0.78, H * 0.66, 130, 0.28);
  balloon(W * 0.36, H * 0.6, 150, -0.12);
  balloon(W * 0.64, H * 0.6, 150, 0.12);
  balloon(W * 0.5, H * 0.65, 165, 0);
  // bow
  outline(() => { x.moveTo(knot.x, knot.y); x.bezierCurveTo(knot.x - 90, knot.y - 60, knot.x - 110, knot.y + 50, knot.x, knot.y); }, 7);
  outline(() => { x.moveTo(knot.x, knot.y); x.bezierCurveTo(knot.x + 90, knot.y - 60, knot.x + 110, knot.y + 50, knot.x, knot.y); }, 7);
  outline(() => x.arc(knot.x, knot.y, 16, 0, Math.PI * 2), 6);
  x.beginPath(); x.moveTo(knot.x - 6, knot.y + 14); x.quadraticCurveTo(knot.x - 40, knot.y + 80, knot.x - 20, knot.y + 130); x.moveTo(knot.x + 6, knot.y + 14); x.quadraticCurveTo(knot.x + 40, knot.y + 80, knot.x + 25, knot.y + 125); x.lineWidth = 5; x.stroke();
  const star = (sx: number, sy: number, r: number) => outline(() => {
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.45 : r; x.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
    x.closePath();
  }, 7);
  const heart = (hx: number, hy: number, s: number) => outline(() => {
    x.moveTo(hx, hy + s * 0.35);
    x.bezierCurveTo(hx - s, hy - s * 0.3, hx - s * 0.45, hy - s, hx, hy - s * 0.45);
    x.bezierCurveTo(hx + s * 0.45, hy - s, hx + s, hy - s * 0.3, hx, hy + s * 0.35);
  }, 7);
  star(W * 0.12, H * 0.34, 60); star(W * 0.88, H * 0.36, 70); star(W * 0.14, H * 0.9, 65); star(W * 0.86, H * 0.91, 55);
  heart(W * 0.11, H * 0.5, 55); heart(W * 0.89, H * 0.52, 60); heart(W * 0.3, H * 0.93, 45); heart(W * 0.7, H * 0.94, 50);
  for (const [dx, dy, r] of [[0.2, 0.22, 14], [0.8, 0.23, 16], [0.08, 0.66, 12], [0.92, 0.7, 14], [0.2, 0.8, 16], [0.8, 0.8, 13]]) outline(() => x.arc(W * dx, H * dy, r, 0, Math.PI * 2), 6);
  return new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
}

/** The grown-up "well done" page: an engraved frame, a laurel wreath and outlined serif letters, all open shapes to colour. */
async function congratsElegant(W: number, H: number): Promise<Blob> {
  const family = '"Suez One", "Frank Ruhl Libre", serif';
  try { await document.fonts.load(`400 260px ${family}`, 'כל הכבוד'); } catch { /* fall back */ }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  x.lineJoin = 'round'; x.lineCap = 'round'; x.strokeStyle = '#141414';
  const shape = (draw: () => void, lw = 6) => { x.beginPath(); draw(); x.fillStyle = '#fff'; x.fill(); x.lineWidth = lw; x.stroke(); };
  // engraved double frame with inner border band to colour
  x.lineWidth = 8; x.strokeRect(60, 60, W - 120, H - 120);
  x.lineWidth = 4; x.strokeRect(100, 100, W - 200, H - 200);
  // diamonds along the band
  for (let i = 0; i < 14; i++) { const t = (i + 0.5) / 14, px = 60 + t * (W - 120); for (const py of [80, H - 80]) shape(() => { x.moveTo(px, py - 12); x.lineTo(px + 12, py); x.lineTo(px, py + 12); x.lineTo(px - 12, py); x.closePath(); }, 3); }
  for (let i = 0; i < 20; i++) { const t = (i + 0.5) / 20, py = 60 + t * (H - 120); for (const px of [80, W - 80]) shape(() => { x.moveTo(px, py - 12); x.lineTo(px + 12, py); x.lineTo(px, py + 12); x.lineTo(px - 12, py); x.closePath(); }, 3); }
  // corner flourishes
  const flourish = (cx: number, cy: number, sx: number, sy: number) => {
    x.save(); x.translate(cx, cy); x.scale(sx, sy);
    x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(120, 0, 160, 60, 110, 110); x.bezierCurveTo(70, 150, 20, 110, 50, 75); x.bezierCurveTo(70, 55, 95, 75, 80, 90); x.lineWidth = 6; x.stroke();
    x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(0, 120, 60, 160, 110, 110); x.stroke();
    shape(() => x.ellipse(150, 30, 34, 14, 0.4, 0, Math.PI * 2), 5); shape(() => x.ellipse(30, 150, 14, 34, 0.4, 0, Math.PI * 2), 5);
    shape(() => x.arc(0, 0, 16, 0, Math.PI * 2), 5);
    x.restore();
  };
  flourish(130, 130, 1, 1); flourish(W - 130, 130, -1, 1); flourish(130, H - 130, 1, -1); flourish(W - 130, H - 130, -1, -1);
  // laurel wreath
  const cx = W / 2, cy = H * 0.47, R = 560;
  for (const side of [-1, 1]) {
    x.beginPath(); x.arc(cx, cy, R, side < 0 ? Math.PI * 0.62 : Math.PI * 0.38, side < 0 ? Math.PI * 1.32 : -Math.PI * 0.32, side > 0); x.lineWidth = 7; x.stroke();
    for (let i = 0; i < 11; i++) {
      const a = Math.PI / 2 + side * (0.22 + i * 0.105) * Math.PI * 1.0;
      const px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R;
      const tang = a + side * Math.PI / 2;
      for (const off of [-0.55, 0.55]) {
        x.save(); x.translate(px, py); x.rotate(tang + off * side);
        shape(() => { x.moveTo(0, 0); x.quadraticCurveTo(28, -34, 0, -86); x.quadraticCurveTo(-28, -34, 0, 0); }, 5);
        x.beginPath(); x.moveTo(0, -6); x.lineTo(0, -72); x.lineWidth = 2.5; x.stroke();
        x.restore();
      }
      if (i % 4 === 2) shape(() => x.arc(px - Math.cos(a) * 40, py - Math.sin(a) * 40, 14, 0, Math.PI * 2), 5);
    }
  }
  // ribbon at the bottom of the wreath
  const ry = cy + R + 10;
  shape(() => { x.moveTo(cx - 40, ry - 30); x.bezierCurveTo(cx - 160, ry - 110, cx - 190, ry + 40, cx - 40, ry); x.closePath(); }, 6);
  shape(() => { x.moveTo(cx + 40, ry - 30); x.bezierCurveTo(cx + 160, ry - 110, cx + 190, ry + 40, cx + 40, ry); x.closePath(); }, 6);
  shape(() => { x.moveTo(cx - 30, ry); x.lineTo(cx - 110, ry + 170); x.lineTo(cx - 70, ry + 150); x.lineTo(cx - 50, ry + 190); x.lineTo(cx + 5, ry + 10); x.closePath(); }, 6);
  shape(() => { x.moveTo(cx + 30, ry); x.lineTo(cx + 110, ry + 170); x.lineTo(cx + 70, ry + 150); x.lineTo(cx + 50, ry + 190); x.lineTo(cx - 5, ry + 10); x.closePath(); }, 6);
  shape(() => x.ellipse(cx, ry - 15, 38, 32, 0, 0, Math.PI * 2), 6);
  // outlined serif letters, each its own shape
  const word = (text: string, wy: number, size: number) => {
    x.font = `${size}px ${family}`; x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.direction = 'ltr';
    const gap = size * 0.06;
    const chars = [...text], widths = chars.map((ch) => x.measureText(ch).width);
    const total = widths.reduce((a, w) => a + w, 0) + gap * (chars.length - 1);
    const m = x.measureText('כ'); const base = wy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    let right = cx + total / 2;
    chars.forEach((ch, i) => {
      const left = right - widths[i];
      x.lineWidth = 14; x.strokeStyle = '#141414'; x.strokeText(ch, left, base);
      x.lineWidth = 4; x.strokeStyle = '#fff'; x.strokeText(ch, left, base);
      x.fillStyle = '#fff'; x.fillText(ch, left, base);
      right = left - gap;
    });
    x.strokeStyle = '#141414';
  };
  word('כל', cy - 150, 300);
  word('הכבוד', cy + 170, 280);
  // a crown of small stars above the wreath
  const star = (sx: number, sy: number, r: number) => shape(() => { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.42 : r; x.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); } x.closePath(); }, 5);
  star(cx, cy - R - 70, 50); star(cx - 120, cy - R - 40, 32); star(cx + 120, cy - R - 40, 32);
  return new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
}
