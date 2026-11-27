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

export function paperFlip(): void {
  if (!ac || !soundOn.get()) return;
  const dur = 0.35;
  const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.3)), 2) * (1 - t);
    d[i] = (Math.random() * 2 - 1) * env * (0.6 + 0.4 * Math.sin(t * 60));
  }
  const src = ac.createBufferSource(); src.buffer = buf;
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.6;
  const g = ac.createGain(); g.gain.value = 0.25;
  src.connect(bp).connect(g).connect(ac.destination);
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
