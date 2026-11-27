/** Soft synthesized sounds (paper flip, magic chime). Start only after a tap. */
import { prefs } from '../app/store';

let ac: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    const first = !ac;
    if (!ac) ac = new AudioContext();
    if (ac.state === 'suspended') void ac.resume();
    if (first) warmFlipSounds();
  } catch { ac = null; }
}

export const soundOn = { get: () => prefs.get('sound', true), set: (v: boolean) => prefs.set('sound', v) };

export const FLIP_SOUNDS: { id: string; name: string }[] = [
  { id: 'real', name: 'דף אמיתי (מתחלף בין הקלטות)' },
  { id: 'flip1', name: 'דף של ספר' },
  { id: 'flip2', name: 'דף קליל' },
  { id: 'flip3', name: 'דפדוף קצר' },
  { id: 'soft', name: 'דף רך ושקט' },
];

/** Recordings of real paper (CC0, Kenney), decoded once. */
const decoded = new Map<string, Promise<AudioBuffer | null>>();
function recording(id: string): Promise<AudioBuffer | null> {
  let p = decoded.get(id);
  if (!p) {
    p = (async () => {
      try {
        const { FLIP_DATA } = await import('./flipdata');
        const url = FLIP_DATA[id]; if (!url || !ac) return null;
        const bytes = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
        return await ac.decodeAudioData(bytes.buffer);
      } catch { return null; }
    })();
    decoded.set(id, p);
  }
  return p;
}

/** A page turn, in the style she picked. */
export function paperFlip(style = prefs.get('flipSound', 'real')): void {
  if (!ac || !soundOn.get()) return;
  if (!FLIP_SOUNDS.some((x) => x.id === style)) style = 'real';
  const id = style === 'real' ? ['flip1', 'flip2', 'flip1', 'flip3'][Math.floor(Math.random() * 4)] : style;
  void recording(id).then((buf) => {
    if (!buf || !ac) return;
    const src = ac.createBufferSource(); src.buffer = buf;
    // tiny natural variation, like real paper
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = ac.createGain(); g.gain.value = style === 'soft' ? 0.55 : 0.7;
    src.connect(g).connect(ac.destination);
    src.start();
  });
}

/** Decode the recordings early, so the first flip plays at once. */
export function warmFlipSounds(): void { for (const s of ['flip1', 'flip2', 'flip3', 'soft']) void recording(s); }

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
