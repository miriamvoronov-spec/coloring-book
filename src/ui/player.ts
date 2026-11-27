/** The small music player fixed in a corner: play, mute, next, volume, channel. */
import { h } from './dom';
import { CHANNELS, music, next, nowPlaying, pause, play, resumeOnFirstTap, setChannel, setVolume } from './music';

export function mountPlayer(): void {
  if (document.querySelector('.player')) return;
  const toggleBtn = h('button', { class: 'player__fab', type: 'button', 'aria-label': 'מוזיקה', title: 'מוזיקה', 'aria-expanded': 'false' }, '♪');
  const title = h('div', { class: 'player__title', 'aria-live': 'polite' });
  const playBtn = h('button', { class: 'player__btn', type: 'button' });
  const nextBtn = h('button', { class: 'player__btn', type: 'button', 'aria-label': 'השיר הבא', title: 'הבא' }, '⏭');
  const muteBtn = h('button', { class: 'player__btn', type: 'button' });
  const vol = h('input', { type: 'range', class: 'slider player__vol', min: 0, max: 100, value: Math.round(music.volume * 100), 'aria-label': 'ווליום' }) as HTMLInputElement;
  const chans = h('div', { class: 'player__chans', role: 'radiogroup', 'aria-label': 'ערוץ' });
  for (const c of CHANNELS) {
    const b = h('button', { class: 'player__chan', type: 'button', role: 'radio', 'data-ch': c.id }, `${c.icon} ${c.name}`);
    b.addEventListener('click', () => void setChannel(c.id));
    chans.append(b);
  }
  const panel = h('div', { class: 'player__panel', hidden: true }, chans, title, h('div', { class: 'player__row' }, playBtn, nextBtn, muteBtn, vol));
  const el = h('div', { class: 'player' }, panel, toggleBtn);
  document.body.append(el);

  let lastVol = music.volume || 0.5;
  toggleBtn.addEventListener('click', () => { panel.hidden = !panel.hidden; toggleBtn.setAttribute('aria-expanded', String(!panel.hidden)); });
  playBtn.addEventListener('click', () => void (music.playing ? pause() : play()));
  nextBtn.addEventListener('click', () => void next());
  muteBtn.addEventListener('click', () => { if (music.volume > 0) { lastVol = music.volume; setVolume(0); } else setVolume(lastVol || 0.5); });
  vol.addEventListener('input', () => setVolume(Number(vol.value) / 100));
  document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !el.contains(e.target as Node)) { panel.hidden = true; toggleBtn.setAttribute('aria-expanded', 'false'); } }, true);

  const paint = async () => {
    const on = music.playing;
    playBtn.textContent = on ? '⏸' : '▶';
    playBtn.setAttribute('aria-label', on ? 'עצירה' : 'ניגון');
    muteBtn.textContent = music.volume > 0 ? '🔊' : '🔇';
    muteBtn.setAttribute('aria-label', music.volume > 0 ? 'השתקה' : 'ביטול השתקה');
    vol.value = String(Math.round(music.volume * 100));
    el.classList.toggle('player--on', on);
    chans.querySelectorAll<HTMLElement>('.player__chan').forEach((b) => { const sel = b.dataset.ch === music.channel; b.classList.toggle('is-on', sel); b.setAttribute('aria-checked', String(sel)); });
    title.textContent = '♪ ' + (await nowPlaying());
  };
  music.subscribe(() => void paint());
  void paint();
  resumeOnFirstTap();
}
