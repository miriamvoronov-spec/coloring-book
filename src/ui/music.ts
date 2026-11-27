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

// more voices
const piano = (m: number, t: number, v = 0.09, len = 1.6) => { voice('triangle', m, t, 0.006, v, len, 0.55, 0, 2600); voice('sine', m + 12, t, 0.006, v * 0.25, len * 0.6, 0.55); };
const marimba = (m: number, t: number, v = 0.1) => { voice('sine', m, t, 0.003, v, 0.45, 0.3); voice('sine', m + 24, t, 0.003, v * 0.15, 0.12, 0.3); };
function flute(m: number, t: number, len: number, v = 0.06) {
  const c = ctx!;
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = hz(m);
  const lfo = c.createOscillator(); lfo.frequency.value = 5.2; const lg = c.createGain(); lg.gain.value = hz(m) * 0.006;
  lfo.connect(lg); lg.connect(o.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.09);
  g.gain.setValueAtTime(v, t + Math.max(0.1, len - 0.12)); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
  o.connect(g); const s1 = c.createGain(); s1.gain.value = 0.7; g.connect(s1); s1.connect(dry); const s2 = c.createGain(); s2.gain.value = 0.6; g.connect(s2); s2.connect(wet);
  o.start(t); lfo.start(t); o.stop(t + len + 0.3); lfo.stop(t + len + 0.3);
}

// ---------------- composition ----------------
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
/** Eight-bar progressions (scale degrees, 0 = I). */
const PROGS8 = [
  [0, 5, 3, 4, 0, 5, 1, 4], [0, 3, 0, 4, 5, 3, 1, 4], [0, 2, 3, 0, 3, 4, 0, 4], [5, 3, 0, 4, 5, 3, 1, 4],
  [0, 4, 5, 2, 3, 0, 1, 4], [0, 3, 5, 4, 0, 3, 4, 4], [0, 5, 1, 4, 2, 5, 1, 4], [3, 4, 2, 5, 1, 4, 0, 0],
];
const RHYTHMS: Record<number, number[][]> = {
  4: [[1, 1, 1, 1], [2, 1, 1], [1.5, 0.5, 2], [1, 0.5, 0.5, 2], [3, 1], [0.5, 0.5, 1, 2], [1, 1, 2], [2, 2]],
  3: [[1, 1, 1], [2, 1], [1.5, 0.5, 1], [3], [1, 2], [0.5, 0.5, 2]],
};
type Note = { at: number; dur: number; deg: number };
type Lead = 'piano' | 'flute' | 'bell' | 'harp' | 'marimba' | 'pluck';
type Accomp = 'arpeggio' | 'waltz' | 'pad' | 'bounce' | 'alberti';
interface Piece { root: number; scale: number[]; prog: number[]; bpm: number; beats: number; lead: Lead; accomp: Accomp; melody: Note[][]; r: () => number }

const deg = (p: Piece, d: number, oct = 0) => p.root + oct * 12 + p.scale[((d % 7) + 7) % 7] + Math.floor(d / 7) * 12;

/** An original 16-bar tune in AA'BA form over the progression. */
function compose(r: () => number, prog: number[], beats: number): Note[][] {
  const phrase = (bars: number[], start: number): Note[][] => {
    let cur = start;
    return bars.map((chord, bi) => {
      const rh = RHYTHMS[beats][Math.floor(r() * RHYTHMS[beats].length)];
      const last = bi === bars.length - 1;
      const pattern = last ? [beats] : rh;
      let at = 0;
      return pattern.map((dur, k) => {
        const tones = [chord, chord + 2, chord + 4];
        if (k === 0) cur = tones.reduce((a, t) => (Math.abs(t - cur) < Math.abs(a - cur) ? t : a), tones[0]);
        else { const step = r() < 0.7 ? (r() < 0.5 ? 1 : -1) : (r() < 0.5 ? 2 : -2); cur = Math.max(-2, Math.min(9, cur + step)); }
        const n = { at, dur, deg: cur }; at += dur; return n;
      });
    });
  };
  const A = phrase(prog.slice(0, 4), 4);
  const A2 = A.slice(0, 3).concat(phrase(prog.slice(7, 8), A[3][0].deg));
  const B = phrase(prog.slice(4, 8), 7);
  return [...A, ...A2.map((bar, i) => (i < 3 ? bar : bar)), ...B, ...A];
}

function piece(ch: Channel, i: number): Piece {
  const r = rng(ch.charCodeAt(0) * 7919 + i * 104729 + 17);
  const keys = [0, 5, 7, 2, 10, 3, 8, 1, 4, 9];
  const root = 53 + keys[i % 10];
  let beats = 4, bpm = 72, lead: Lead = 'piano', accomp: Accomp = 'arpeggio', minor = false;
  if (ch === 'fairy') {
    beats = [4, 3, 4, 3, 4, 4, 3, 4, 3, 4][i]; bpm = beats === 3 ? 96 + (i % 3) * 8 : 66 + (i % 4) * 5;
    lead = (['piano', 'flute', 'piano', 'harp', 'flute', 'piano', 'bell', 'flute', 'piano', 'harp'] as Lead[])[i];
    accomp = beats === 3 ? 'waltz' : (['arpeggio', 'alberti'] as Accomp[])[i % 2]; minor = i === 7;
  } else if (ch === 'focus') {
    beats = 4; bpm = 54 + (i % 5) * 4; lead = (['piano', 'bell', 'flute', 'piano', 'harp'] as Lead[])[i % 5]; accomp = i % 2 ? 'pad' : 'arpeggio'; minor = i % 3 === 1;
  } else {
    beats = i % 4 === 3 ? 3 : 4; bpm = beats === 3 ? 140 : 108 + (i % 5) * 7; lead = (['marimba', 'pluck', 'bell', 'marimba', 'flute'] as Lead[])[i % 5]; accomp = beats === 3 ? 'waltz' : 'bounce';
  }
  const prog = PROGS8[(i * 3 + ch.length) % PROGS8.length];
  return { root, scale: minor ? MINOR : MAJOR, prog, bpm, beats, lead, accomp, melody: compose(r, prog, beats), r };
}

/** Schedule one bar of the current piece. */
function bar(ch: Channel, p: Piece, n: number, t: number) {
  const spb = 60 / p.bpm, barLen = spb * p.beats;
  const form = n % 16, round = Math.floor(n / 16);
  const chord = p.prog[form % 8];
  const triad = [deg(p, chord), deg(p, chord + 2), deg(p, chord + 4)];
  const soft = ch === 'focus' ? 0.6 : 1;
  // accompaniment
  if (p.accomp === 'pad' || ch !== 'playful') for (const m of triad) (ch === 'focus' ? pad : strings)(m, t, barLen * 1.05, ch === 'focus' ? 0.035 : 0.022);
  bass(deg(p, chord, -1), t, barLen * 0.9, 0.1 * soft);
  if (p.accomp === 'arpeggio') {
    const arp = [triad[0], triad[1], triad[2], triad[0] + 12, triad[2], triad[1], triad[2], triad[0] + 12];
    for (let k = 0; k < p.beats * 2; k++) piano(arp[k % arp.length], t + k * spb / 2, 0.035 * soft, 1.2);
  } else if (p.accomp === 'alberti') {
    const al = [triad[0], triad[2], triad[1], triad[2]];
    for (let k = 0; k < p.beats * 2; k++) piano(al[k % 4], t + k * spb / 2, 0.03, 1);
  } else if (p.accomp === 'waltz') {
    for (let k = 1; k < 3; k++) { piano(triad[1], t + k * spb, 0.035, 0.6); piano(triad[2], t + k * spb, 0.03, 0.6); }
  } else if (p.accomp === 'bounce') {
    for (let k = 0; k < p.beats; k++) { bass(deg(p, chord + (k % 2 ? 4 : 0), -1), t + k * spb, spb * 0.5, 0.1); marimba(triad[(k + 1) % 3], t + k * spb + spb / 2, 0.045); }
  }
  // melody: first time through a little softer, the second fuller and an octave up for the B part
  const up = round % 2 === 1 && form >= 8 && form < 12 ? 12 : 0;
  for (const note of p.melody[form]) {
    const m = deg(p, note.deg, 1) + up, at = t + note.at * spb, len = note.dur * spb;
    const v = (round === 0 ? 0.8 : 1) * soft;
    if (p.lead === 'piano') piano(m, at, 0.09 * v, Math.max(1, len * 1.4));
    else if (p.lead === 'flute') flute(m, at, len * 0.95, 0.055 * v);
    else if (p.lead === 'bell') bell(m, at, 0.07 * v);
    else if (p.lead === 'harp') harp(m, at, 0.08 * v);
    else if (p.lead === 'marimba') marimba(m, at, 0.1 * v);
    else pluck(m, at, 0.09 * v);
  }
  if (form === 15 && ch !== 'playful') bell(deg(p, 0, 2), t + barLen - spb / 2, 0.035);
}

let current: Piece | null = null;
let curCh: Channel = 'fairy';
const PIECE_BARS = 32; // the tune twice, about 1.5 to 3 minutes

function tick() {
  if (!ctx || !current) return;
  const barLen = (60 / current.bpm) * current.beats;
  while (nextTime < ctx.currentTime + 0.8) {
    if (step >= PIECE_BARS) { clearInterval(timer); timer = 0; setTimeout(() => void next(), Math.max(0, (nextTime - ctx.currentTime) * 1000 + 1500)); return; }
    bar(curCh, current, step, nextTime);
    nextTime += barLen; step++;
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
