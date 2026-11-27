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
  { id: 'page', name: 'דף נייר אמיתי' },
  { id: 'book', name: 'דף של ספר עבה' },
  { id: 'quick', name: 'דפדוף מהיר' },
  { id: 'whisper', name: 'משב רך (הכי שקט)' },
];

/**
 * A real page turn, built from three parts: the paper lifting (a soft dense
 * rustle), the page moving through the air (a broad whoosh whose colour
 * rises and falls), and the page settling (a soft low flap). Every turn is a
 * little different, like real paper. No tones, no clicks.
 */
function turnBuffer(style: string, sr: number): Float32Array {
  const P = {
    page: { dur: 0.62, rustle: 0.55, whoosh: 0.8, land: 0.5, lo: 500, hi: 3200 },
    book: { dur: 0.85, rustle: 0.4, whoosh: 0.9, land: 0.8, lo: 300, hi: 2200 },
    quick: { dur: 0.36, rustle: 0.6, whoosh: 0.7, land: 0.35, lo: 700, hi: 4200 },
    whisper: { dur: 0.7, rustle: 0.12, whoosh: 0.8, land: 0.2, lo: 350, hi: 1500 },
  }[style] ?? { dur: 0.62, rustle: 0.55, whoosh: 0.8, land: 0.5, lo: 500, hi: 3200 };
  const dur = P.dur * (0.9 + Math.random() * 0.2);
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  const peak = 0.38 + Math.random() * 0.12;               // where the page is fastest
  const bell = (t: number, c: number, w: number) => Math.exp(-((t - c) ** 2) / (2 * w * w));
  // 1. whoosh: noise through a lowpass whose cutoff follows the page's speed, then a gentle highpass
  let lp1 = 0, lp2 = 0, hpPrev = 0, hpOut = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const speed = bell(t, peak, 0.2);
    const fc = P.lo + (P.hi - P.lo) * speed;
    const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
    const x = Math.random() * 2 - 1;
    lp1 += a * (x - lp1); lp2 += a * (lp1 - lp2);
    const r = 0.995; hpOut = r * (hpOut + lp2 - hpPrev); hpPrev = lp2;
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 1.6) * (0.25 + 0.75 * speed);
    out[i] = hpOut * env * P.whoosh * 2.2;
  }
  // 2. rustle: many tiny soft grains of paper texture, densest while lifting
  const grainLen = Math.floor(sr * 0.004);
  const grains = Math.floor(dur * 650);
  for (let g = 0; g < grains; g++) {
    const t = Math.random() < 0.6 ? Math.random() * 0.45 : Math.random();
    const start = Math.floor(t * n);
    const amp = (0.08 + Math.random() * 0.12) * P.rustle * (0.35 + bell(t, 0.18, 0.15) + 0.6 * bell(t, peak, 0.2));
    let f1 = 0;
    for (let k = 0; k < grainLen && start + k < n; k++) {
      const w = Math.sin((Math.PI * k) / grainLen) ** 2;      // smooth grain, no click
      f1 += 0.45 * ((Math.random() * 2 - 1) - f1);           // soften the top end
      out[start + k] += f1 * w * amp;
    }
  }
  // 3. settling: a soft low flap near the end
  const landAt = Math.floor(n * (0.78 + Math.random() * 0.08));
  const landLen = Math.floor(sr * 0.09);
  let l1 = 0, l2 = 0;
  const la = 1 - Math.exp((-2 * Math.PI * 180) / sr);
  for (let k = 0; k < landLen && landAt + k < n; k++) {
    const x = Math.random() * 2 - 1; l1 += la * (x - l1); l2 += la * (l1 - l2);
    const env = (k / landLen < 0.15 ? k / (landLen * 0.15) : Math.exp(-((k / landLen) - 0.15) * 5));
    out[landAt + k] += l2 * env * P.land * 6;
  }
  // fade the very ends and normalise gently
  const fade = Math.floor(sr * 0.01);
  for (let i = 0; i < fade; i++) { out[i] *= i / fade; out[n - 1 - i] *= i / fade; }
  let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(out[i]));
  if (m > 0) for (let i = 0; i < n; i++) out[i] /= m;
  return out;
}

/** A soft page-turn, in the style she picked. */
export function paperFlip(style = prefs.get('flipSound', 'page')): void {
  if (!ac || !soundOn.get()) return;
  if (!FLIP_SOUNDS.some((x) => x.id === style)) style = 'page';
  const data = turnBuffer(style, ac.sampleRate);
  const buf = ac.createBuffer(1, data.length, ac.sampleRate);
  buf.getChannelData(0).set(data);
  const src = ac.createBufferSource(); src.buffer = buf;
  const g = ac.createGain(); g.gain.value = style === 'whisper' ? 0.18 : 0.28;
  src.connect(g).connect(ac.destination);
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
