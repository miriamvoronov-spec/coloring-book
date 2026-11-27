/**
 * Background music. Three channels of ten pieces each, composed live in the
 * browser (Web Audio), so there are no royalties and nothing to download.
 * Her own audio files can be added to any channel in settings; then the
 * channel plays those instead. Music starts only after a first tap and
 * remembers the last channel, piece, volume and whether it was playing.
 */
import { prefs, store } from '../app/store';

export type Channel = 'focus' | 'fairy' | 'playful';
export const CHANNELS: { id: Channel; name: string; icon: string }[] = [
  { id: 'focus', name: 'ריכוז', icon: '🌙' },
  { id: 'fairy', name: 'אגדה קסומה', icon: '🏰' },
  { id: 'playful', name: 'חוברת צביעה', icon: '🖍️' },
];

const TITLES: Record<Channel, string[]> = {
  focus: ['אגם של ערב', 'נשימה רכה', 'ערפל כסוף', 'אור מנורה', 'גשם על החלון', 'ענן איטי', 'שקט כחול', 'חוף רחוק', 'נוצה באוויר', 'לילה ארוך'],
  fairy: ['ואלס בארמון', 'הכרכרה יוצאת', 'יער הפיות', 'נשף חצות', 'שביל הכוכבים', 'מגדל הפעמונים', 'גן הוורדים', 'שיר הערש של הירח', 'מסע על ענן', 'הכתר האבוד'],
  playful: ['עפרונות קופצים', 'בלונים בחצר', 'מסיבת צבעים', 'קשת בענן', 'ריקוד הטושים', 'פיקניק', 'גומי לעיסה', 'חתול על מרפסת', 'סוכריות', 'יום הולדת'],
};

export function trackTitle(ch: Channel, i: number): string { return TITLES[ch][i % 10]; }

// ---------------- state ----------------
let ctx: AudioContext | null = null;
let master: GainNode, wet: GainNode, dry: GainNode;
let timer = 0;
let nextTime = 0, step = 0;
let audioEl: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();

export const music = {
  get on() { return prefs.get('music.on', false); },
  get channel() { return prefs.get<Channel>('music.channel', 'fairy'); },
  get track() { return prefs.get('music.track', 0); },
  get volume() { return prefs.get('music.volume', 0.5); },
  get playing() { return !!timer || !!(audioEl && !audioEl.paused); },
  subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
};
const emit = () => listeners.forEach((f) => f());

function ensureCtx(): AudioContext {
  if (ctx) return ctx;
  ctx = new AudioContext();
  master = ctx.createGain(); master.gain.value = music.volume * 0.6;
  master.connect(ctx.destination);
  dry = ctx.createGain(); dry.gain.value = 0.75; dry.connect(master);
  const verb = ctx.createConvolver();
  const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  verb.buffer = ir;
  wet = ctx.createGain(); wet.gain.value = 0.5; wet.connect(verb); verb.connect(master);
  return ctx;
}

// ---------------- instruments ----------------
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function voice(type: OscillatorType, midi: number, t: number, a: number, peak: number, d: number, reverb = 0.5, detune = 0, filter = 0) {
  const c = ctx!;
  const o = c.createOscillator(); o.type = type; o.frequency.value = hz(midi); o.detune.value = detune;
  const g = c.createGain(); env(g, t, a, peak, d);
  let node: AudioNode = o;
  if (filter) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; f.Q.value = 0.4; o.connect(f); node = f; }
  node.connect(g);
  const s1 = c.createGain(); s1.gain.value = 1 - reverb * 0.5; g.connect(s1); s1.connect(dry);
  const s2 = c.createGain(); s2.gain.value = reverb; g.connect(s2); s2.connect(wet);
  o.start(t); o.stop(t + a + d + 0.1);
}

const pad = (m: number, t: number, len: number, v = 0.05) => { voice('sawtooth', m, t, len * 0.4, v, len * 0.9, 0.8, -7, 900); voice('sawtooth', m, t, len * 0.4, v, len * 0.9, 0.8, 7, 900); };
const bell = (m: number, t: number, v = 0.09) => { voice('sine', m, t, 0.005, v, 1.8, 0.7); voice('sine', m + 12, t, 0.005, v * 0.35, 0.9, 0.7); voice('sine', m + 19, t, 0.005, v * 0.12, 0.5, 0.7); };
const harp = (m: number, t: number, v = 0.08) => { voice('triangle', m, t, 0.004, v, 1.2, 0.6); voice('sine', m + 12, t, 0.004, v * 0.3, 0.6, 0.6); };
const pluck = (m: number, t: number, v = 0.1) => { voice('triangle', m, t, 0.003, v, 0.32, 0.25); voice('square', m + 12, t, 0.003, v * 0.08, 0.12, 0.2, 0, 2400); };
const bass = (m: number, t: number, len: number, v = 0.12) => voice('sine', m, t, 0.02, v, len, 0.15);
const strings = (m: number, t: number, len: number, v = 0.035) => { voice('sawtooth', m, t, len * 0.3, v, len, 0.9, -5, 1600); voice('sawtooth', m, t, len * 0.3, v, len, 0.9, 6, 1600); };

// ---------------- composition ----------------
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10], PENTA = [0, 2, 4, 7, 9];
const PROGS = [[0, 5, 3, 4], [0, 3, 4, 3], [0, 4, 5, 3], [5, 3, 0, 4], [0, 2, 3, 4], [0, 5, 1, 4]];

interface Piece { root: number; scale: number[]; prog: number[]; bpm: number; beats: number; r: () => number }

function piece(ch: Channel, i: number): Piece {
  const r = rng(ch.length * 1000 + i * 77 + 13);
  const root = 50 + [0, 2, 3, 5, 7, 8, 10, 1, 4, 6][i % 10];
  const minor = ch === 'focus' ? i % 3 === 1 : ch === 'fairy' ? i % 4 === 3 : false;
  const bpm = ch === 'focus' ? 54 + (i % 4) * 4 : ch === 'fairy' ? 84 + (i % 5) * 6 : 104 + (i % 5) * 8;
  return { root, scale: minor ? MINOR : MAJOR, prog: PROGS[(i * 7) % PROGS.length], bpm, beats: ch === 'fairy' ? 3 : 4, r };
}

const deg = (p: Piece, d: number, oct = 0) => p.root + oct * 12 + p.scale[((d % 7) + 7) % 7] + Math.floor(d / 7) * 12;

/** Schedule one beat of the current piece. */
function beat(ch: Channel, p: Piece, n: number, t: number) {
  const spb = 60 / p.bpm;
  const bar = Math.floor(n / p.beats), b = n % p.beats;
  const chord = p.prog[bar % p.prog.length];
  const triad = [deg(p, chord), deg(p, chord + 2), deg(p, chord + 4)];
  if (ch === 'focus') {
    if (b === 0 && bar % 2 === 0) { for (const m of triad) pad(m, t, spb * p.beats * 2); bass(deg(p, chord, -1), t, spb * p.beats * 2, 0.07); }
    if (p.r() < 0.35) bell(deg(p, chord + [0, 2, 4, 7][Math.floor(p.r() * 4)], 1), t + spb * (p.r() < 0.5 ? 0 : 0.5), 0.05);
  } else if (ch === 'fairy') {
    if (b === 0) { strings(triad[0], t, spb * 3.2); strings(triad[1], t, spb * 3.2); strings(triad[2] + 12, t, spb * 3.2, 0.025); bass(deg(p, chord, -1), t, spb * 2.6, 0.11); }
    else { harp(triad[b % 3] + 12, t, 0.06); harp(triad[(b + 1) % 3] + 12, t + spb / 2, 0.05); }
    if (bar % 4 === 3 && b === 2) bell(deg(p, chord + 4, 2), t + spb / 2, 0.05);
    if (p.r() < 0.4) bell(deg(p, chord + [0, 2, 4][b % 3], 2), t, 0.045);
  } else {
    if (b === 0 || b === 2) bass(deg(p, chord, -1), t, spb * 0.8, 0.13);
    pluck(triad[(n * 2) % 3] + 12, t, 0.07);
    if (p.r() < 0.55) pluck(deg(p, PENTA[Math.floor(p.r() * 5)] + chord, 2), t + spb / 2, 0.06);
    if (b === 3 && bar % 2 === 1) bell(deg(p, chord + 4, 2), t + spb / 2, 0.04);
  }
}

let current: Piece | null = null;
let curCh: Channel = 'fairy';
const PIECE_BEATS = 4 * 32; // about 1.5 to 3 minutes per piece

function tick() {
  if (!ctx || !current) return;
  const spb = 60 / current.bpm;
  while (nextTime < ctx.currentTime + 0.6) {
    beat(curCh, current, step, nextTime);
    nextTime += spb; step++;
    if (step >= PIECE_BEATS) { next(); return; }
  }
}

async function userTracks(ch: Channel): Promise<Blob[]> {
  return (await store.kv<Blob[]>('music-files-' + ch)) ?? [];
}

async function start(): Promise<void> {
  stopNow();
  const ch = music.channel, i = music.track;
  const own = await userTracks(ch);
  if (own.length) {
    const blob = own[i % own.length];
    audioEl = new Audio(URL.createObjectURL(blob));
    audioEl.volume = music.volume;
    audioEl.addEventListener('ended', () => next());
    try { await audioEl.play(); } catch { /* needs a tap first */ }
    emit();
    return;
  }
  const c = ensureCtx();
  if (c.state === 'suspended') await c.resume();
  curCh = ch; current = piece(ch, i); step = 0; nextTime = c.currentTime + 0.1;
  master.gain.cancelScheduledValues(c.currentTime);
  master.gain.setValueAtTime(0.0001, c.currentTime);
  master.gain.exponentialRampToValueAtTime(Math.max(0.0002, music.volume * 0.6), c.currentTime + 2);
  timer = window.setInterval(tick, 120);
  tick();
  emit();
}

function stopNow() {
  if (timer) { clearInterval(timer); timer = 0; }
  if (audioEl) { audioEl.pause(); URL.revokeObjectURL(audioEl.src); audioEl = null; }
  if (ctx && master) { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + 0.4); }
}

export async function play(): Promise<void> { prefs.set('music.on', true); await start(); }
export function pause(): void { prefs.set('music.on', false); stopNow(); emit(); }
export async function toggle(): Promise<void> { if (music.playing) pause(); else await play(); }
export async function next(): Promise<void> {
  const own = await userTracks(music.channel);
  prefs.set('music.track', (music.track + 1) % (own.length || 10));
  if (music.on) await start(); else emit();
}
export async function setChannel(ch: Channel): Promise<void> {
  prefs.set('music.channel', ch); prefs.set('music.track', 0);
  if (music.on) await start(); else emit();
}
export function setVolume(v: number): void {
  prefs.set('music.volume', v);
  if (ctx && master) master.gain.setTargetAtTime(Math.max(0.0001, v * 0.6), ctx.currentTime, 0.1);
  if (audioEl) audioEl.volume = v;
  emit();
}
export async function nowPlaying(): Promise<string> {
  const own = await userTracks(music.channel);
  if (own.length) { const f = own[music.track % own.length] as File; return f.name?.replace(/\.[^.]+$/, '') || `שיר ${music.track + 1}`; }
  return trackTitle(music.channel, music.track);
}

/** Music begins only after a first tap, and only if it was playing last time. */
export function resumeOnFirstTap(): void {
  const go = () => { removeEventListener('pointerdown', go, true); if (music.on) void start(); };
  addEventListener('pointerdown', go, true);
}

export async function addOwnTracks(ch: Channel, files: File[]): Promise<number> {
  const list = await userTracks(ch);
  const all = [...list, ...files.filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|ogg|wav|aac|flac)$/i.test(f.name))];
  await store.setKv('music-files-' + ch, all);
  return all.length;
}
export async function ownTracks(ch: Channel): Promise<File[]> { return (await userTracks(ch)) as File[]; }
export async function removeOwnTrack(ch: Channel, i: number): Promise<void> {
  const list = await userTracks(ch); list.splice(i, 1); await store.setKv('music-files-' + ch, list);
}
