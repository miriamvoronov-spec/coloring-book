/** Soft synthesized sounds (paper flip, magic chime). Start only after a tap. */
import { prefs } from '../app/store';

let ac: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    if (!ac) ac = new AudioContext();
    if (ac.state === 'suspended') void ac.resume();
  } catch { ac = null; }
}

export const soundOn = { get: () => prefs.get('sound', true), set: (v: boolean) => prefs.set('sound', v) };

export const FLIP_SOUNDS: { id: string; name: string }[] = [
  { id: 'whisper', name: 'לחישת משי (הכי עדין)' },
  { id: 'parchment', name: 'קלף עתיק' },
  { id: 'velvet', name: 'משב רך' },
  { id: 'classic', name: 'נייר רגיל' },
];

/** A soft page-turn, in the style she picked. */
export function paperFlip(style = prefs.get('flipSound', 'whisper')): void {
  if (!ac || !soundOn.get()) return;
  const sr = ac.sampleRate;
  const shapes: Record<string, { dur: number; gain: number; type: BiquadFilterType; f: number; q: number; fill: (t: number, prev: number) => number }> = {
    // silky: smooth band of low noise, slow rise and fall
    whisper: { dur: 0.6, gain: 0.09, type: 'lowpass', f: 1600, q: 0.4, fill: (t, p) => p * 0.86 + (Math.random() * 2 - 1) * 0.14 * Math.pow(Math.sin(Math.PI * t), 3) },
    // old parchment: a hush with a few tiny crackles
    parchment: { dur: 0.55, gain: 0.1, type: 'bandpass', f: 2000, q: 0.5, fill: (t) => ((Math.random() * 2 - 1) * 0.5 + (Math.random() < 0.004 ? (Math.random() * 2 - 1) * 3 : 0)) * Math.pow(Math.sin(Math.PI * t), 2) * (1 - t * 0.6) },
    // velvet: an airy whoosh that sweeps down
    velvet: { dur: 0.7, gain: 0.12, type: 'lowpass', f: 900, q: 0.7, fill: (t, p) => p * 0.7 + (Math.random() * 2 - 1) * 0.3 * Math.sin(Math.PI * t) },
    classic: { dur: 0.35, gain: 0.12, type: 'bandpass', f: 2400, q: 0.6, fill: (t) => (Math.random() * 2 - 1) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.3)), 2) * (1 - t) * (0.6 + 0.4 * Math.sin(t * 60)) },
  };
  const sh = shapes[style] ?? shapes.whisper;
  const buf = ac.createBuffer(1, Math.floor(sr * sh.dur), sr);
  const d = buf.getChannelData(0);
  let prev = 0;
  for (let i = 0; i < d.length; i++) { prev = sh.fill(i / d.length, prev); d[i] = prev; }
  const src = ac.createBufferSource(); src.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = sh.type; f.frequency.value = sh.f; f.Q.value = sh.q;
  if (style === 'velvet') f.frequency.exponentialRampToValueAtTime(400, ac.currentTime + sh.dur);
  const g = ac.createGain(); g.gain.value = sh.gain * (style === 'whisper' ? 3 : 1);
  src.connect(f).connect(g).connect(ac.destination);
  src.start();
}

export function chime(): void {
  if (!ac || !soundOn.get()) return;
  const now = ac.currentTime;
  [1318.5, 1567.98, 2093, 2637].forEach((f, i) => {
    const o = ac!.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ac!.createGain();
    const t = now + i * 0.07;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(g).connect(ac!.destination); o.start(t); o.stop(t + 1.2);
  });
}
