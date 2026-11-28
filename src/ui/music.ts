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

export function trackTitle(ch: Channel, i: number): string { return STYLES[ch][i % 10].title; }

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

/** Send a voice to the dry and reverb buses. */
function out(g: AudioNode, reverb: number) {
  const c = ctx!;
  const s1 = c.createGain(); s1.gain.value = 1 - reverb * 0.5; g.connect(s1); s1.connect(dry);
  const s2 = c.createGain(); s2.gain.value = reverb; g.connect(s2); s2.connect(wet);
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

/** One oscillator with a simple attack and decay. `freq` overrides the pitch (for bell partials). */
function osc(type: OscillatorType, midi: number, t: number, a: number, peak: number, d: number, reverb = 0.5, o: { detune?: number; lp?: number; freq?: number; vib?: number } = {}) {
  const c = ctx!;
  const x = c.createOscillator(); x.type = type; x.frequency.value = o.freq ?? hz(midi); x.detune.value = o.detune ?? 0;
  const g = c.createGain(); env(g, t, a, peak, d);
  let node: AudioNode = x;
  if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.5; x.connect(f); node = f; }
  if (o.vib) { const l = c.createOscillator(); l.frequency.value = 5.3; const lg = c.createGain(); lg.gain.value = 0; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib, t + 0.35); l.connect(lg); lg.connect(x.detune); l.start(t); l.stop(t + a + d + 0.1); }
  node.connect(g); out(g, reverb);
  x.start(t); x.stop(t + a + d + 0.1);
}

/** A held note (wind and bowed instruments): swell, hold, release. */
function held(type: OscillatorType, midi: number, t: number, len: number, v: number, reverb: number, o: { lp?: number; bp?: number; q?: number; vib?: number; att?: number } = {}) {
  const c = ctx!;
  const x = c.createOscillator(); x.type = type; x.frequency.value = hz(midi);
  if (o.vib) { const l = c.createOscillator(); l.frequency.value = 5 + Math.random() * 0.6; const lg = c.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib, t + Math.min(0.4, len * 0.6)); l.connect(lg); lg.connect(x.detune); l.start(t); l.stop(t + len + 0.4); }
  let node: AudioNode = x;
  if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
  if (o.bp) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.bp; f.Q.value = o.q ?? 1; node.connect(f); node = f; }
  const g = c.createGain(); const att = o.att ?? 0.06;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + att);
  g.gain.setValueAtTime(v, t + Math.max(att + 0.01, len - 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.3);
  node.connect(g); out(g, reverb);
  x.start(t); x.stop(t + len + 0.35);
}

let noiseBuf: AudioBuffer | null = null;
function noise(t: number, len: number, v: number, type: BiquadFilterType, f: number, q = 1, reverb = 0.15) {
  const c = ctx!;
  if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const src = c.createBufferSource(); src.buffer = noiseBuf;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = c.createGain(); env(g, t, 0.002, v, len);
  src.connect(fl); fl.connect(g); out(g, reverb);
  src.start(t, Math.random() * 0.5); src.stop(t + len + 0.05);
}

/** Plucked string (Karplus-Strong), cached per pitch: guitar and ukulele. */
const ks = new Map<number, AudioBuffer>();
function pluckBuf(m: number): AudioBuffer {
  const c = ctx!;
  let b = ks.get(m);
  if (b) return b;
  const sr = c.sampleRate, N = Math.max(2, Math.round(sr / hz(m))), len = Math.floor(sr * 1.8);
  b = c.createBuffer(1, len, sr); const d = b.getChannelData(0);
  for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
  const damp = m > 72 ? 0.992 : 0.996;
  for (let i = N; i < len; i++) d[i] = damp * 0.5 * (d[i - N] + d[i - N + 1 < i ? i - N + 1 : i - N]);
  ks.set(m, b); return b;
}
function guitar(m: number, t: number, v: number, reverb = 0.35) {
  const c = ctx!;
  const src = c.createBufferSource(); src.buffer = pluckBuf(m);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200;
  const g = c.createGain(); g.gain.value = v * 1.6;
  src.connect(f); f.connect(g); out(g, reverb); src.start(t); src.stop(t + 1.8);
}

type Inst = 'piano' | 'epiano' | 'harp' | 'celesta' | 'musicbox' | 'glock' | 'bell' | 'marimba' | 'kalimba' | 'pluck' | 'guitar' | 'uke'
  | 'flute' | 'clarinet' | 'oboe' | 'violin' | 'horn' | 'whistle';

/** Play one melody or accompaniment note on an instrument. */
function play1(inst: Inst, m: number, t: number, len: number, v: number) {
  switch (inst) {
    case 'piano': osc('triangle', m, t, 0.005, v, Math.max(0.9, len * 1.5), 0.5, { lp: 2600 }); osc('sine', m + 12, t, 0.005, v * 0.22, Math.max(0.5, len), 0.5); break;
    case 'epiano': osc('sine', m, t, 0.004, v, Math.max(1, len * 1.6), 0.45); osc('sine', m, t, 0.002, v * 0.35, 0.25, 0.4, { freq: hz(m) * 4.02 }); break;
    case 'harp': osc('triangle', m, t, 0.004, v, 1.4, 0.6); osc('sine', m + 12, t, 0.004, v * 0.3, 0.6, 0.6); break;
    case 'celesta': osc('sine', m, t, 0.003, v, 1.1, 0.65); osc('sine', m + 12, t, 0.003, v * 0.45, 0.5, 0.65); break;
    case 'musicbox': osc('sine', m, t, 0.002, v, 1.3, 0.6); osc('sine', m, t, 0.002, v * 0.25, 0.4, 0.6, { freq: hz(m) * 3.01 }); osc('sine', m, t, 0.002, v * 0.1, 0.15, 0.6, { freq: hz(m) * 5.4 }); break;
    case 'glock': osc('sine', m, t, 0.002, v, 1.5, 0.5); osc('sine', m, t, 0.002, v * 0.3, 0.3, 0.5, { freq: hz(m) * 2.76 }); break;
    case 'bell': osc('sine', m, t, 0.004, v, 2.2, 0.7); osc('sine', m, t, 0.004, v * 0.4, 1.2, 0.7, { freq: hz(m) * 2.0 }); osc('sine', m, t, 0.004, v * 0.2, 0.7, 0.7, { freq: hz(m) * 2.97 }); break;
    case 'marimba': osc('sine', m, t, 0.003, v, 0.5, 0.3); osc('sine', m, t, 0.003, v * 0.2, 0.08, 0.3, { freq: hz(m) * 4 }); break;
    case 'kalimba': osc('sine', m, t, 0.002, v, 0.9, 0.45); osc('sine', m, t, 0.002, v * 0.3, 0.12, 0.45, { freq: hz(m) * 5.9 }); break;
    case 'pluck': osc('triangle', m, t, 0.003, v, 0.3, 0.25); osc('square', m + 12, t, 0.003, v * 0.07, 0.1, 0.2, { lp: 2400 }); break;
    case 'guitar': guitar(m, t, v); break;
    case 'uke': guitar(m + 12, t, v * 0.9, 0.25); break;
    case 'flute': held('sine', m, t, len * 0.95, v * 0.75, 0.6, { vib: 9, att: 0.08 }); held('triangle', m + 12, t, len * 0.95, v * 0.08, 0.6, { att: 0.1 }); break;
    case 'clarinet': held('square', m, t, len * 0.95, v * 0.38, 0.45, { lp: 1500, vib: 4, att: 0.05 }); break;
    case 'oboe': held('sawtooth', m, t, len * 0.95, v * 0.5, 0.5, { bp: 1300, q: 1.6, vib: 7, att: 0.05 }); break;
    case 'violin': held('sawtooth', m, t, len, v * 0.32, 0.65, { lp: 2800, vib: 14, att: 0.12 }); held('sawtooth', m, t, len, v * 0.18, 0.65, { lp: 2000, att: 0.15 }); break;
    case 'horn': held('sawtooth', m, t, len * 0.9, v * 0.32, 0.6, { lp: 900, vib: 3, att: 0.07 }); break;
    case 'whistle': held('sine', m + 12, t, len * 0.85, v * 0.55, 0.4, { vib: 18, att: 0.03 }); break;
  }
}

type Pad = 'strings' | 'choir' | 'warm' | 'organ';
function pad(kind: Pad, m: number, t: number, len: number, v: number) {
  if (kind === 'strings') { held('sawtooth', m, t, len, v, 0.85, { lp: 1500, att: len * 0.35, vib: 6 }); held('sawtooth', m + 0.07, t, len, v * 0.8, 0.85, { lp: 1300, att: len * 0.4 }); }
  else if (kind === 'choir') { held('sawtooth', m, t, len, v * 1.3, 0.9, { bp: 750, q: 3, att: len * 0.4, vib: 8 }); held('sawtooth', m, t, len, v * 0.9, 0.9, { bp: 1150, q: 4, att: len * 0.45 }); }
  else if (kind === 'organ') { held('sine', m, t, len, v * 1.2, 0.6, { att: 0.08 }); held('sine', m + 12, t, len, v * 0.5, 0.6, { att: 0.08 }); }
  else held('triangle', m, t, len, v * 1.6, 0.85, { lp: 1100, att: len * 0.4 });
}

function bassNote(m: number, t: number, len: number, v: number, kind: 'soft' | 'pizz' | 'synth' = 'soft') {
  if (kind === 'pizz') { osc('triangle', m, t, 0.004, v * 1.2, 0.35, 0.35, { lp: 900 }); return; }
  if (kind === 'synth') { osc('square', m, t, 0.005, v * 0.5, Math.min(0.3, len), 0.15, { lp: 600 }); return; }
  osc('sine', m, t, 0.02, v, len, 0.15); osc('triangle', m, t, 0.02, v * 0.25, len * 0.6, 0.15, { lp: 700 });
}

const kick = (t: number, v: number) => { const c = ctx!; const x = c.createOscillator(); x.frequency.setValueAtTime(110, t); x.frequency.exponentialRampToValueAtTime(42, t + 0.12); const g = c.createGain(); env(g, t, 0.003, v, 0.22); x.connect(g); out(g, 0.05); x.start(t); x.stop(t + 0.3); };
const snare = (t: number, v: number) => noise(t, 0.14, v, 'bandpass', 1900, 0.8, 0.25);
const clap = (t: number, v: number) => { noise(t, 0.05, v * 0.7, 'bandpass', 1400, 1.5, 0.3); noise(t + 0.012, 0.12, v, 'bandpass', 1300, 1.2, 0.35); };
const shaker = (t: number, v: number) => noise(t, 0.05, v, 'highpass', 7000, 0.7, 0.1);
const brush = (t: number, v: number) => noise(t, 0.22, v, 'bandpass', 3500, 0.5, 0.2);
const wood = (t: number, v: number) => osc('sine', 0, t, 0.001, v, 0.06, 0.2, { freq: 1050 });
const timp = (m: number, t: number, v: number) => { osc('sine', m, t, 0.01, v, 0.9, 0.5); noise(t, 0.08, v * 0.3, 'lowpass', 300, 1, 0.4); };
const ting = (t: number, v: number) => osc('sine', 0, t, 0.001, v, 1.2, 0.6, { freq: 4200 });

// ---------------- the thirty pieces ----------------
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10], DORIAN = [0, 2, 3, 5, 7, 9, 10],
  MIXO = [0, 2, 4, 5, 7, 9, 10], LYDIAN = [0, 2, 4, 6, 7, 9, 11], HARMONIC = [0, 2, 3, 5, 7, 8, 11];

/** Eight-bar progressions, as scale degrees (0 = I). */
const P = {
  pop: [0, 4, 5, 3, 0, 4, 3, 4], ballad: [0, 2, 3, 0, 3, 4, 0, 4], classic: [0, 5, 3, 4, 0, 5, 1, 4], circle: [0, 3, 6, 2, 5, 1, 4, 0],
  slow: [0, 0, 3, 3, 4, 4, 0, 0], minor: [0, 5, 2, 6, 0, 5, 3, 4], dorian: [0, 3, 0, 3, 0, 3, 6, 4], mixo: [0, 6, 3, 0, 0, 6, 3, 4],
  lydian: [0, 1, 0, 1, 2, 1, 3, 4], waltz: [0, 0, 4, 4, 4, 4, 0, 0], jazz: [0, 5, 1, 4, 0, 5, 1, 4], folk: [0, 3, 4, 0, 5, 3, 4, 0],
  lament: [0, 6, 5, 4, 0, 6, 5, 4], rise: [3, 4, 2, 5, 1, 4, 0, 0],
};

type Motif = 'lyrical' | 'fanfare' | 'arp' | 'chatty' | 'sparse' | 'dance';
type Accomp = 'arpeggio' | 'alberti' | 'waltz' | 'block' | 'strum' | 'broken' | 'offbeat' | 'stride' | 'roll' | 'gallop' | 'rock68' | 'pick' | 'none';
type Drums = 'none' | 'soft' | 'shaker' | 'brush' | 'clap' | 'march' | 'rain' | 'timp';
interface Style {
  title: string; bpm: number; meter: 3 | 4 | 6; scale: number[]; key: number; prog: number[];
  lead: Inst; lead2?: Inst; motif: Motif; motifB?: Motif; accomp: Accomp; accInst?: Inst;
  pad?: Pad; bass?: 'root' | 'walk' | 'pedal' | 'pizz' | 'synth' | 'oom' | 'none'; drums?: Drums;
  swing?: boolean; sevenths?: boolean; penta?: boolean; oct?: number; level?: number;
}

const STYLES: Record<Channel, Style[]> = {
  focus: [
    { title: 'אגם של ערב', bpm: 62, meter: 4, scale: MAJOR, key: 57, prog: P.slow, lead: 'piano', motif: 'sparse', accomp: 'block', accInst: 'epiano', pad: 'warm', bass: 'pedal' },
    { title: 'נשימה רכה', bpm: 52, meter: 4, scale: LYDIAN, key: 55, prog: P.lydian, lead: 'flute', motif: 'lyrical', accomp: 'none', pad: 'choir', bass: 'none', level: 0.8 },
    { title: 'ערפל כסוף', bpm: 66, meter: 4, scale: DORIAN, key: 52, prog: P.dorian, lead: 'celesta', motif: 'arp', accomp: 'arpeggio', accInst: 'harp', pad: 'strings', bass: 'root' },
    { title: 'אור מנורה', bpm: 70, meter: 4, scale: MAJOR, key: 52, prog: P.folk, lead: 'guitar', motif: 'lyrical', accomp: 'pick', accInst: 'guitar', bass: 'none', pad: 'warm' },
    { title: 'גשם על החלון', bpm: 84, meter: 4, scale: DORIAN, key: 57, prog: P.dorian, lead: 'kalimba', motif: 'chatty', accomp: 'none', pad: 'warm', bass: 'root', drums: 'rain', penta: true },
    { title: 'ענן איטי', bpm: 58, meter: 4, scale: MIXO, key: 50, prog: P.mixo, lead: 'clarinet', motif: 'lyrical', accomp: 'block', accInst: 'epiano', pad: 'strings', bass: 'root' },
    { title: 'שקט כחול', bpm: 76, meter: 4, scale: MAJOR, key: 53, prog: P.jazz, lead: 'epiano', motif: 'sparse', motifB: 'chatty', accomp: 'block', accInst: 'epiano', bass: 'walk', drums: 'brush', swing: true, sevenths: true },
    { title: 'חוף רחוק', bpm: 56, meter: 4, scale: MAJOR, key: 54, prog: P.slow, lead: 'harp', motif: 'arp', accomp: 'roll', accInst: 'harp', pad: 'warm', bass: 'pedal', penta: true },
    { title: 'נוצה באוויר', bpm: 84, meter: 3, scale: MAJOR, key: 60, prog: P.waltz, lead: 'musicbox', motif: 'arp', accomp: 'none', pad: 'choir', bass: 'none', oct: 1 },
    { title: 'לילה ארוך', bpm: 54, meter: 4, scale: MINOR, key: 50, prog: P.lament, lead: 'oboe', motif: 'lyrical', accomp: 'block', accInst: 'piano', pad: 'strings', bass: 'root' },
  ],
  fairy: [
    { title: 'ואלס בארמון', bpm: 108, meter: 3, scale: MAJOR, key: 55, prog: P.classic, lead: 'violin', lead2: 'flute', motif: 'lyrical', motifB: 'dance', accomp: 'waltz', accInst: 'piano', pad: 'strings', bass: 'oom' },
    { title: 'הכרכרה יוצאת', bpm: 112, meter: 6, scale: MAJOR, key: 53, prog: P.pop, lead: 'horn', lead2: 'violin', motif: 'fanfare', motifB: 'dance', accomp: 'gallop', accInst: 'piano', pad: 'strings', bass: 'pizz', drums: 'timp' },
    { title: 'יער הפיות', bpm: 92, meter: 4, scale: LYDIAN, key: 57, prog: P.lydian, lead: 'flute', lead2: 'celesta', motif: 'dance', accomp: 'broken', accInst: 'harp', pad: 'strings', bass: 'pizz', drums: 'shaker' },
    { title: 'נשף חצות', bpm: 152, meter: 3, scale: HARMONIC, key: 52, prog: P.minor, lead: 'violin', lead2: 'clarinet', motif: 'dance', motifB: 'lyrical', accomp: 'waltz', accInst: 'piano', pad: 'strings', bass: 'oom' },
    { title: 'שביל הכוכבים', bpm: 70, meter: 4, scale: MAJOR, key: 58, prog: P.rise, lead: 'celesta', lead2: 'musicbox', motif: 'arp', motifB: 'lyrical', accomp: 'roll', accInst: 'harp', pad: 'choir', bass: 'root' },
    { title: 'מגדל הפעמונים', bpm: 80, meter: 4, scale: MIXO, key: 55, prog: P.mixo, lead: 'bell', lead2: 'horn', motif: 'fanfare', accomp: 'block', accInst: 'piano', pad: 'organ', bass: 'pedal', drums: 'timp' },
    { title: 'גן הוורדים', bpm: 76, meter: 4, scale: MAJOR, key: 53, prog: P.ballad, lead: 'piano', lead2: 'violin', motif: 'lyrical', accomp: 'arpeggio', accInst: 'piano', pad: 'strings', bass: 'root', sevenths: true },
    { title: 'שיר הערש של הירח', bpm: 54, meter: 6, scale: MAJOR, key: 55, prog: P.slow, lead: 'musicbox', lead2: 'flute', motif: 'lyrical', accomp: 'rock68', accInst: 'harp', pad: 'warm', bass: 'pedal', oct: 1 },
    { title: 'מסע על ענן', bpm: 100, meter: 4, scale: MAJOR, key: 57, prog: P.circle, lead: 'oboe', lead2: 'flute', motif: 'dance', motifB: 'lyrical', accomp: 'alberti', accInst: 'piano', pad: 'strings', bass: 'pizz' },
    { title: 'הכתר האבוד', bpm: 84, meter: 4, scale: DORIAN, key: 50, prog: P.dorian, lead: 'clarinet', lead2: 'violin', motif: 'lyrical', motifB: 'fanfare', accomp: 'arpeggio', accInst: 'harp', pad: 'strings', bass: 'root', drums: 'timp' },
  ],
  playful: [
    { title: 'עפרונות קופצים', bpm: 120, meter: 4, scale: MAJOR, key: 60, prog: P.pop, lead: 'marimba', motif: 'chatty', accomp: 'offbeat', accInst: 'piano', bass: 'pizz', drums: 'soft' },
    { title: 'בלונים בחצר', bpm: 112, meter: 4, scale: MAJOR, key: 55, prog: P.folk, lead: 'whistle', motif: 'dance', accomp: 'strum', accInst: 'uke', bass: 'root', drums: 'clap' },
    { title: 'מסיבת צבעים', bpm: 132, meter: 4, scale: MIXO, key: 57, prog: P.mixo, lead: 'glock', lead2: 'marimba', motif: 'chatty', accomp: 'offbeat', accInst: 'epiano', bass: 'synth', drums: 'soft' },
    { title: 'קשת בענן', bpm: 150, meter: 3, scale: MAJOR, key: 62, prog: P.waltz, lead: 'pluck', motif: 'dance', accomp: 'waltz', accInst: 'marimba', bass: 'oom', drums: 'shaker' },
    { title: 'ריקוד הטושים', bpm: 138, meter: 4, scale: MAJOR, key: 53, prog: P.jazz, lead: 'clarinet', motif: 'chatty', motifB: 'fanfare', accomp: 'stride', accInst: 'piano', bass: 'walk', drums: 'brush', swing: true, sevenths: true },
    { title: 'פיקניק', bpm: 96, meter: 6, scale: MAJOR, key: 55, prog: P.folk, lead: 'flute', motif: 'dance', accomp: 'pick', accInst: 'guitar', bass: 'none', drums: 'shaker', penta: true },
    { title: 'גומי לעיסה', bpm: 104, meter: 4, scale: DORIAN, key: 57, prog: P.dorian, lead: 'kalimba', motif: 'chatty', accomp: 'offbeat', accInst: 'epiano', bass: 'synth', drums: 'clap', swing: true },
    { title: 'חתול על מרפסת', bpm: 118, meter: 4, scale: DORIAN, key: 50, prog: P.dorian, lead: 'piano', motif: 'sparse', motifB: 'chatty', accomp: 'stride', accInst: 'piano', bass: 'walk', drums: 'brush', swing: true, sevenths: true },
    { title: 'סוכריות', bpm: 126, meter: 4, scale: LYDIAN, key: 60, prog: P.lydian, lead: 'musicbox', motif: 'arp', accomp: 'broken', accInst: 'celesta', bass: 'pizz', drums: 'shaker' },
    { title: 'יום הולדת', bpm: 116, meter: 4, scale: MAJOR, key: 55, prog: P.classic, lead: 'glock', lead2: 'horn', motif: 'fanfare', accomp: 'strum', accInst: 'uke', bass: 'root', drums: 'march' },
  ],
};

// ---------------- melody ----------------
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const pickR = <T,>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length)];

/** Rhythms per character and meter, in beats (eighths in 6/8). A negative value is a rest. */
const RH: Record<Motif, Record<number, number[][]>> = {
  lyrical: { 4: [[2, 1, 1], [3, 1], [1.5, 0.5, 2], [1, 1, 2], [1, 0.5, 0.5, 2], [1.5, 0.5, 1, 1]], 3: [[2, 1], [1.5, 0.5, 1], [1, 1, 1], [3]], 6: [[3, 2, 1], [2, 1, 3], [3, 3], [2, 1, 2, 1]] },
  fanfare: { 4: [[1.5, 0.5, 1, 1], [0.75, 0.25, 1, 2], [1, 0.5, 0.5, 2], [0.5, 0.5, 1, 2]], 3: [[1.5, 0.5, 1], [0.75, 0.25, 2], [1, 0.5, 0.5, 1]], 6: [[2, 1, 2, 1], [1.5, 0.5, 1, 3], [3, 2, 1]] },
  arp: { 4: [[1, 1, 1, 1], [0.5, 0.5, 0.5, 0.5, 2], [1, 1, 2], [0.5, 0.5, 1, 0.5, 0.5, 1]], 3: [[1, 1, 1], [0.5, 0.5, 0.5, 0.5, 1], [1, 2]], 6: [[1, 1, 1, 1, 1, 1], [2, 1, 2, 1], [1, 1, 1, 3]] },
  chatty: { 4: [[0.5, 0.5, 0.5, 0.5, 1, 1], [0.5, 0.5, 1, 0.5, 0.5, 1], [1, 0.5, 0.5, 1, -1], [0.5, 1, 0.5, 1, 1], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1]], 3: [[0.5, 0.5, 0.5, 0.5, 1], [0.5, 0.5, 1, 1], [1, 0.5, 0.5, -1]], 6: [[1, 1, 1, 1, 1, 1], [2, 1, 1, 1, 1], [1, 1, 1, 2, -1]] },
  sparse: { 4: [[3, -1], [2, -1, 1], [4], [-1, 1, 2], [1.5, 2.5]], 3: [[3], [2, -1], [-1, 2]], 6: [[6], [3, -3], [5, 1]] },
  dance: { 4: [[1, 0.5, 0.5, 1, 1], [0.5, 0.5, 1, 1, 1], [1, 1, 0.5, 0.5, 1], [1.5, 0.5, 1, 1]], 3: [[1, 0.5, 0.5, 1], [0.5, 0.5, 1, 1], [1, 1, 1]], 6: [[2, 1, 2, 1], [1, 1, 1, 2, 1], [2, 1, 3]] },
};
const CADENCE: Record<number, number[][]> = { 4: [[1, 1, 2], [2, 2], [4], [1.5, 0.5, 2]], 3: [[2, 1], [3], [1, 2]], 6: [[3, 3], [6], [2, 1, 3]] };

type Note = { at: number; dur: number; deg: number | null };
interface MotifShape { rh: number[]; steps: number[] }

function makeMotif(r: () => number, kind: Motif, meter: number): MotifShape {
  const rh = pickR(r, RH[kind][meter]);
  const steps: number[] = [];
  let dir = r() < 0.5 ? 1 : -1;
  for (let i = 0; i < rh.length; i++) {
    let s: number;
    switch (kind) {
      case 'lyrical': s = r() < 0.72 ? dir : r() < 0.5 ? 2 * dir : -dir; if (r() < 0.15) s = 3 * dir; break;
      case 'fanfare': s = pickR(r, [0, 2, 2, 3, 4, -2, -3]); break;
      case 'arp': s = 2 * dir; if (r() < 0.2) dir = -dir; break;
      case 'chatty': s = r() < 0.35 ? 0 : r() < 0.7 ? dir : -dir; break;
      case 'sparse': s = pickR(r, [2, -2, 1, -1, 4, -3]); break;
      default: s = r() < 0.5 ? dir : r() < 0.6 ? 2 * dir : -dir; if (r() < 0.3) dir = -dir;
    }
    steps.push(i === 0 ? 0 : s);
  }
  return { rh, steps };
}

/** Turn a motif into notes starting at a scale degree; 'inv' mirrors it, 'tail' varies the end. */
function realize(m: MotifShape, start: number, how: 'same' | 'inv' | 'tail', r: () => number, penta: boolean): Note[] {
  let cur = start, at = 0;
  return m.rh.map((d, i) => {
    let s = m.steps[i];
    if (how === 'inv') s = -s;
    if (how === 'tail' && i >= m.rh.length - 2 && i > 0) s = s === 0 ? 1 : -Math.sign(s) * Math.max(1, Math.abs(s) - 1);
    cur = Math.max(-3, Math.min(11, cur + s));
    if (penta) { const k = ((cur % 7) + 7) % 7; if (k === 3 || k === 6) cur += r() < 0.5 ? 1 : -1; }
    const n: Note = { at, dur: Math.abs(d), deg: d < 0 ? null : cur };
    at += Math.abs(d);
    return n;
  });
}

function nearestTone(chord: number, target: number, sevenths: boolean): number {
  const tones: number[] = [];
  for (let o = -7; o <= 14; o += 7) for (const x of sevenths ? [0, 2, 4, 6] : [0, 2, 4]) tones.push(chord + x + o);
  return tones.reduce((a, t) => (Math.abs(t - target) < Math.abs(a - target) ? t : a), tones[0]);
}

function cadence(r: () => number, meter: number, chord: number, from: number, final: boolean): Note[] {
  const rh = pickR(r, CADENCE[meter]);
  const end = final ? nearestTone(0, from, false) : nearestTone(chord, from, false);
  let at = 0;
  return rh.map((d, i) => {
    const deg = i === rh.length - 1 ? end : end + (rh.length - 1 - i) * (from > end ? 1 : -1);
    const n = { at, dur: d, deg }; at += d; return n;
  });
}

/** An original 16-bar tune in AA'BA form: a motif, its sequence and variation, a contrasting middle. */
function compose(r: () => number, st: Style): Note[][] {
  const pr = st.prog, sev = !!st.sevenths, pen = !!st.penta;
  const mA = makeMotif(r, st.motif, st.meter), mB = makeMotif(r, st.motifB ?? (st.motif === 'lyrical' ? 'dance' : 'lyrical'), st.meter);
  const lastDeg = (bar: Note[]) => [...bar].reverse().find((n) => n.deg !== null)?.deg ?? 4;
  const section = (m: MotifShape, bars: number[], start: number, varHow: 'tail' | 'inv', final: boolean): Note[][] => {
    const out: Note[][] = [];
    let prev = start;
    for (let k = 0; k < 3; k++) {
      const s = nearestTone(bars[k], k === 0 ? start : prev + (k === 1 ? 1 : 0), sev);
      const b = realize(m, s, k === 2 ? varHow : 'same', r, pen);
      out.push(b); prev = lastDeg(b);
    }
    out.push(cadence(r, st.meter, bars[3], prev, final));
    return out;
  };
  const top = st.motif === 'arp' || st.motif === 'fanfare' ? 2 : 4;
  const A = section(mA, pr.slice(0, 4), top, 'tail', false);
  const A2 = [A[0], A[1], realize(mA, nearestTone(pr[2], lastDeg(A[1]), sev), 'inv', r, pen), cadence(r, st.meter, pr[3], lastDeg(A[1]), true)];
  const B = section(mB, pr.slice(4, 8), top + 3, 'inv', false);
  return [...A, ...A2, ...B, ...A2];
}

interface Piece { st: Style; melody: Note[][]; r: () => number }
function piece(ch: Channel, i: number): Piece {
  const r = rng(ch.charCodeAt(0) * 7919 + i * 104729 + 31);
  const st = STYLES[ch][i % 10];
  return { st, melody: compose(r, st), r };
}

const sdeg = (st: Style, d: number, oct = 0) => st.key + oct * 12 + st.scale[((d % 7) + 7) % 7] + Math.floor(d / 7) * 12;

// ---------------- playing one bar ----------------
const INTRO = 2;
const PIECE_BARS = 32; // the tune twice, then a closing chord

function bar(p: Piece, n: number, t0: number) {
  const st = p.st, r = p.r;
  const compound = st.meter === 6;
  const spb = compound ? 60 / st.bpm / 3 : 60 / st.bpm; // seconds per unit (eighth in 6/8)
  const units = st.meter, barLen = spb * units;
  const intro = n < 0, outro = n >= PIECE_BARS;
  const form = ((n % 16) + 16) % 16, round = n >= 16 ? 1 : 0;
  const chord = intro || outro ? 0 : st.prog[form % 8];
  const chordDegs = st.sevenths ? [0, 2, 4, 6] : [0, 2, 4];
  const tri = chordDegs.map((x) => sdeg(st, chord + x));
  const root = sdeg(st, chord, -1);
  const lv = st.level ?? 1;
  // swing pushes off-beat eighths late; a little human timing everywhere
  const at = (u: number) => t0 + (u + (st.swing && !compound && Math.abs((u % 1) - 0.5) < 0.01 ? 0.17 : 0)) * spb + (r() - 0.5) * 0.012;
  const vel = (v: number) => v * lv * (0.88 + r() * 0.24);

  if (outro) { // a last, gentle chord
    for (const m of tri) play1(st.accInst ?? 'piano', m, t0, barLen * 2, 0.05);
    bassNote(sdeg(st, 0, -1), t0, barLen * 2, 0.08);
    play1('bell', sdeg(st, 0, 2), t0 + 0.05, 2, 0.03);
    if (st.pad) for (const m of tri) pad(st.pad, m, t0, barLen * 2, 0.02);
    return;
  }

  // pad
  if (st.pad) for (const m of tri.slice(0, 3)) pad(st.pad, m, t0, barLen * 1.02, (st.pad === 'choir' ? 0.022 : 0.018) * lv * (intro ? 0.7 : 1));

  // accompaniment
  const ai = st.accInst ?? 'piano', av = 0.036;
  switch (st.accomp) {
    case 'arpeggio': { const ar = [tri[0], tri[1], tri[2], tri[0] + 12, tri[2] + 0, tri[1], tri[2], tri[0] + 12]; for (let k = 0; k < units * 2; k++) play1(ai, ar[k % ar.length], at(k / 2), spb, vel(av)); break; }
    case 'alberti': { const al = [tri[0], tri[2], tri[1], tri[2]]; for (let k = 0; k < units * 2; k++) play1(ai, al[k % 4], at(k / 2), spb / 2, vel(av * 0.9)); break; }
    case 'waltz': for (let k = 1; k < 3; k++) for (const m of tri.slice(1)) play1(ai, m, at(k), spb * 0.8, vel(av * 0.8)); break;
    case 'block': for (const m of tri) play1(ai, m, at(0), barLen, vel(av * 0.9)); if (units === 4) for (const m of tri) play1(ai, m, at(2.5), spb * 1.5, vel(av * 0.5)); break;
    case 'strum': for (let k = 0; k < units; k++) { const down = k % 2 === 0; const ms = down ? tri : [...tri].reverse(); ms.forEach((m, j) => play1(ai, m, at(k) + j * 0.014, spb, vel(down ? av * 1.1 : av * 0.7))); if (k % 2) ms.forEach((m, j) => play1(ai, m, at(k + 0.5) + j * 0.012, spb / 2, vel(av * 0.5))); } break;
    case 'broken': { const ar = [tri[0] + 12, tri[2], tri[1], tri[2], tri[0] + 12, tri[1] + 12, tri[2], tri[1]]; for (let k = 0; k < units * 4; k++) play1(ai, ar[k % 8], at(k / 4), spb / 4, vel(av * 0.6)); break; }
    case 'offbeat': for (let k = 0; k < units; k++) for (const m of tri) play1(ai, m, at(k + 0.5), spb * 0.35, vel(av * 0.85)); break;
    case 'stride': for (let k = 0; k < units; k++) { if (k % 2) for (const m of tri) play1(ai, m, at(k), spb * 0.6, vel(av * 0.8)); } break;
    case 'roll': tri.concat(tri[0] + 12, tri[1] + 12).forEach((m, j) => play1(ai, m, at(0) + j * 0.07, barLen, vel(av * 0.9))); if (units === 4) tri.forEach((m, j) => play1(ai, m + 12, at(2) + j * 0.06, spb * 2, vel(av * 0.5))); break;
    case 'gallop': for (const b of [0, 3]) { bassNote(root, at(b), spb * 1.5, vel(0.08), 'pizz'); for (const m of tri) play1(ai, m, at(b + 2), spb * 0.8, vel(av * 0.8)); } break;
    case 'rock68': { const ar = [tri[0], tri[1], tri[2], tri[0] + 12, tri[2], tri[1]]; for (let k = 0; k < 6; k++) play1(ai, ar[k], at(k), spb * 2, vel(av * 0.9)); break; }
    case 'pick': { const ar = units === 6 ? [root + 12, tri[1], tri[2], tri[0] + 12, tri[2], tri[1]] : [root + 12, tri[2], tri[1], tri[2], root + 12 + 7, tri[2], tri[1], tri[2]]; const step = units === 6 ? 1 : 0.5; for (let k = 0; k < ar.length; k++) play1(ai, ar[k], at(k * step), spb, vel(av * (k % 4 === 0 ? 1.1 : 0.8))); break; }
    default: break;
  }

  // bass
  const bv = 0.09 * lv;
  switch (st.bass) {
    case 'root': bassNote(root, at(0), barLen * 0.95, vel(bv)); break;
    case 'pedal': if (form % 2 === 0 || intro) bassNote(sdeg(st, 0, -1), at(0), barLen * 2, bv * 0.8); break;
    case 'pizz': if (st.accomp !== 'gallop') for (let k = 0; k < units; k += units === 3 ? 3 : 2) bassNote(k ? root + 7 : root, at(k), spb, vel(bv), 'pizz'); break;
    case 'synth': for (let k = 0; k < units * 2; k++) if (k % 2 || k === 0) bassNote(k % 4 === 3 ? root + 12 : root, at(k / 2), spb / 2, vel(bv), 'synth'); break;
    case 'oom': bassNote(root, at(0), spb * 0.9, vel(bv * 1.1), 'pizz'); break;
    case 'walk': { const nextRoot = sdeg(st, st.prog[(form + 1) % 8], -1); const w = [root, root + (st.scale[2] - st.scale[0]), root + 7, nextRoot + (nextRoot > root ? -1 : 1)]; for (let k = 0; k < units; k++) bassNote(w[k % 4], at(k), spb * 0.85, vel(bv * 0.9), 'pizz'); break; }
    default: break;
  }

  // drums (lighter on the first time through)
  const dv = (intro ? 0.5 : round ? 1 : 0.75) * lv;
  switch (st.drums) {
    case 'soft': for (let k = 0; k < units; k++) { if (k % 2 === 0) kick(at(k), 0.16 * dv); else snare(at(k), 0.05 * dv); } for (let k = 0; k < units * 2; k++) shaker(at(k / 2), 0.018 * dv * (k % 2 ? 0.7 : 1)); break;
    case 'clap': for (let k = 0; k < units; k++) { if (k % 2 === 0) kick(at(k), 0.15 * dv); else clap(at(k), 0.06 * dv); } break;
    case 'shaker': for (let k = 0; k < units * 2; k++) shaker(at(k / 2), (k % 2 ? 0.014 : 0.024) * dv); break;
    case 'brush': for (let k = 0; k < units; k++) { brush(at(k), (k % 2 ? 0.03 : 0.018) * dv); if (k === 0) kick(at(0), 0.09 * dv); } for (let k = 0; k < units; k++) shaker(at(k + 0.5), 0.01 * dv); break;
    case 'march': for (let k = 0; k < units; k++) { if (k % 2 === 0) kick(at(k), 0.13 * dv); else snare(at(k), 0.045 * dv); } if (form % 4 === 0) ting(at(0), 0.02 * dv); wood(at(units - 0.5), 0.03 * dv); break;
    case 'rain': for (let k = 0; k < 6; k++) if (r() < 0.5) shaker(t0 + r() * barLen, 0.006 + r() * 0.012); break;
    case 'timp': if (form % 4 === 3 || form === 0) timp(sdeg(st, chord, -1), at(0), 0.1 * dv); break;
    default: break;
  }
  if (compound && st.drums && st.drums !== 'timp' && st.drums !== 'rain') { kick(at(0), 0.1 * dv); shaker(at(3), 0.02 * dv); }

  if (intro) return;

  // melody: the second time through the second voice takes the A sections and the first voice adds a harmony
  const lead = round && st.lead2 && form < 8 ? st.lead2 : st.lead;
  const up = (st.oct ?? 0) + (round && form >= 8 && form < 12 && st.motif !== 'chatty' ? 1 : 0);
  const notes = p.melody[form];
  const mv = { piano: 0.09, epiano: 0.09, harp: 0.085, celesta: 0.08, musicbox: 0.075, glock: 0.06, bell: 0.06, marimba: 0.1, kalimba: 0.09, pluck: 0.09, guitar: 0.1, uke: 0.08, flute: 0.07, clarinet: 0.07, oboe: 0.06, violin: 0.07, horn: 0.075, whistle: 0.05 }[lead];
  for (const nt of notes) {
    if (nt.deg === null) continue;
    const m = sdeg(st, nt.deg, 1 + up), len = nt.dur * spb;
    play1(lead, m, at(nt.at), len, vel(mv * (round ? 1 : 0.85)));
    if (round && form >= 12 && (st.motif === 'lyrical' || st.motif === 'dance') && nt.dur >= 1) play1(st.lead2 ?? st.lead, sdeg(st, nt.deg - 2, 1 + up), at(nt.at), len, vel(mv * 0.45));
  }
  if (form === 15 && round === 0 && st.drums !== 'rain') play1('celesta', sdeg(st, 0, 2), at(units - (compound ? 1 : 0.5)), spb, 0.025);
}

let current: Piece | null = null;

function tick() {
  if (!ctx || !current) return;
  const st = current.st;
  const barLen = (st.meter === 6 ? 60 / st.bpm / 3 : 60 / st.bpm) * st.meter;
  while (nextTime < ctx.currentTime + 0.8) {
    if (step > PIECE_BARS) { clearInterval(timer); timer = 0; setTimeout(() => void next(), Math.max(0, (nextTime - ctx.currentTime) * 1000 + barLen * 1000 + 1200)); return; }
    bar(current, step, nextTime);
    nextTime += barLen; step++;
  }
}

async function userTracks(ch: Channel): Promise<Blob[]> {
  return (await store.kv<Blob[]>('music-files-' + ch)) ?? [];
}

// ---------------- a tune of its own for each book made with Claude ----------------
let bookTheme: { seed: number; style: string; title: string } | null = null;
const THEME_BASE: Record<string, [Channel, number]> = {
  elegant: ['fairy', 6], adult: ['focus', 9], storybook: ['fairy', 0], kids: ['playful', 0], botanical: ['focus', 3],
  mandala: ['focus', 2], artnouveau: ['fairy', 3], vintage: ['playful', 4], stainedglass: ['fairy', 5], folk: ['playful', 5],
};
function bookPiece(t: { seed: number; style: string; title: string }): Piece {
  const [ch, i] = THEME_BASE[t.style] ?? ['fairy', 4];
  const base = STYLES[ch][i];
  const r = rng(t.seed);
  const progs = Object.values(P);
  const st: Style = { ...base, title: t.title, key: base.key + ((t.seed % 7) - 3), bpm: Math.round(base.bpm * (0.92 + (t.seed % 17) / 100)), prog: progs[t.seed % progs.length] };
  return { st, melody: compose(r, st), r };
}
const hash = (s: string) => { let x = 2166136261; for (const ch of s) x = Math.imul(x ^ ch.charCodeAt(0), 16777619); return x >>> 0; };

/** While a book made with Claude is open, its own tune plays (composed from the book's id and drawing style). */
export async function playBookTheme(bookId: string, style: string | undefined, title: string): Promise<void> {
  bookTheme = { seed: hash(bookId), style: style ?? 'storybook', title };
  if (music.on) await start(); else emit();
}
export async function endBookTheme(): Promise<void> {
  if (!bookTheme) return;
  bookTheme = null;
  if (music.on) await start(); else emit();
}

async function start(): Promise<void> {
  stopNow();
  const ch = music.channel, i = music.track;
  if (bookTheme) {
    const c = ensureCtx();
    if (c.state === 'suspended') await c.resume();
    current = bookPiece(bookTheme); step = -INTRO; nextTime = c.currentTime + 0.1;
    master.gain.cancelScheduledValues(c.currentTime);
    master.gain.setValueAtTime(0.0001, c.currentTime);
    master.gain.exponentialRampToValueAtTime(Math.max(0.0002, music.volume * 0.6), c.currentTime + 2);
    timer = window.setInterval(tick, 120);
    tick(); emit();
    return;
  }
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
  current = piece(ch, i); step = -INTRO; nextTime = c.currentTime + 0.1;
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
  if (bookTheme) { if (music.on) await start(); return; }
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
  if (bookTheme) return `המנגינה של ${bookTheme.title}`;
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
