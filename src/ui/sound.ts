/** Soft synthesized sounds (paper flip, magic chime). Start only after a tap. */
import { prefs, store } from '../app/store';

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
  { id: 'heavy', name: 'דף עבה של ספר ישן' },
  { id: 'airy', name: 'דף דק ואוורירי' },
  { id: 'riffle', name: 'דפדוף בכמה דפים' },
  { id: 'close', name: 'דף שנוחת' },
  { id: 'own', name: '🎙️ הצליל שלי (הקלטה או קובץ)' },
];

/** Recordings of real paper (CC0, Kenney), decoded once. */
const decoded = new Map<string, Promise<AudioBuffer | null>>();
function recording(id: string): Promise<AudioBuffer | null> {
  let p = decoded.get(id);
  if (!p) {
    p = (async () => {
      try {
        if (id === 'own') {
          const b = await store.kv<Blob>('flip-own'); if (!b || !ac) return null;
          return trim(await ac.decodeAudioData(await b.arrayBuffer()));
        }
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
    const g = ac.createGain(); g.gain.value = style === 'soft' ? 0.55 : style === 'own' ? 1 : 0.7;
    if (style === 'own') src.playbackRate.value = 1;
    src.connect(g).connect(ac.destination);
    src.start();
  });
}

/** Cut the quiet before and after the sound in a recording. */
function trim(buf: AudioBuffer): AudioBuffer {
  if (!ac) return buf;
  const d = buf.getChannelData(0);
  let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const th = peak * 0.08;
  let a = 0; while (a < d.length && Math.abs(d[a]) < th) a++;
  let z = d.length - 1; while (z > a && Math.abs(d[z]) < th) z--;
  a = Math.max(0, a - Math.round(buf.sampleRate * 0.03)); z = Math.min(d.length, z + Math.round(buf.sampleRate * 0.12));
  if (z - a < buf.sampleRate * 0.05) return buf;
  const out = ac.createBuffer(buf.numberOfChannels, z - a, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).slice(a, z), c);
  return out;
}

/** Her own page sound: a file from the device or a recording, kept on the device. */
export async function setOwnFlip(b: Blob): Promise<void> {
  await store.setKv('flip-own', b);
  decoded.delete('own');
  prefs.set('flipSound', 'own');
}

/** Decode the recordings early, so the first flip plays at once. */
export function warmFlipSounds(): void { for (const s of ['flip1', 'flip2', 'flip3']) void recording(s); }

export const SPARKLE_SOUNDS: { id: string; name: string }[] = [
  { id: 'chime', name: 'פעמוני קסם' },
  { id: 'harp', name: 'נבל עולה' },
  { id: 'musicbox', name: 'תיבת נגינה' },
  { id: 'fairy', name: 'אבק פיות' },
  { id: 'glass', name: 'פעמון זכוכית' },
  { id: 'off', name: 'בלי צליל' },
];

/** The sparkle sound (opening a book, the splash), in the style she picked. */
export function chime(style = prefs.get('sparkleSound', 'chime')): void {
  if (!ac || !soundOn.get() || style === 'off') return;
  const now = ac.currentTime;
  const note = (f: number, t: number, len: number, vol: number, type: OscillatorType = 'sine', partial = 0) => {
    const o = ac!.createOscillator(); o.type = type; o.frequency.value = f;
    const g = ac!.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(ac!.destination); o.start(t); o.stop(t + len + 0.05);
    if (partial) { const o2 = ac!.createOscillator(); o2.frequency.value = f * partial; const g2 = ac!.createGain(); g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(vol * 0.3, t + 0.01); g2.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.5); o2.connect(g2).connect(ac!.destination); o2.start(t); o2.stop(t + len); }
  };
  if (style === 'harp') { [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093].forEach((f, i) => note(f, now + i * 0.055, 1.4, 0.06, 'triangle')); return; }
  if (style === 'musicbox') { [1567.98, 2093, 1975.5, 2349.3, 2637].forEach((f, i) => note(f, now + i * 0.16, 1.2, 0.07, 'sine', 3.01)); return; }
  if (style === 'fairy') { for (let i = 0; i < 14; i++) note(1800 + Math.random() * 2600, now + i * 0.045 + Math.random() * 0.03, 0.45, 0.035, 'sine'); return; }
  if (style === 'glass') { note(1760, now, 2.2, 0.08, 'sine', 2.76); note(2637, now + 0.12, 1.8, 0.05, 'sine', 2.76); return; }
  [1318.5, 1567.98, 2093, 2637].forEach((f, i) => note(f, now + i * 0.07, 1.1, 0.08));
}
