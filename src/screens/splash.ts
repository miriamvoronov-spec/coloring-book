/** Opening screen: the logo appears with sparkles. Tap (or wait) to continue. */
import { go, whenSeeded } from '../app/app';
import { logoFull } from '../ui/logo';
import { sparkle } from '../ui/sparkles';
import { unlockAudio, chime } from '../ui/sound';
import { categoriesScreen } from './categories';
import { dailyLine, greeting, greetingIcon } from '../app/settings';

export function splashScreen(el: HTMLElement) {
  el.innerHTML = `
    <main class="splash" aria-label="מסך פתיחה">
      ${logoFull(Math.min(260, Math.round(innerWidth * 0.5)))}
      <p class="splash__tag">חוברות צביעה קסומות לפי מספרים</p>
      <button class="btn btn--gold splash__go" type="button">פתחי את הספרייה</button>
      <div class="splash__greet"><p class="splash__hello"></p><p class="splash__line"></p></div>
    </main>`;
  el.querySelector('.splash__hello')!.textContent = `${greetingIcon()} ${greeting()}`;
  el.querySelector('.splash__line')!.textContent = dailyLine();
  let done = false;
  const next = () => {
    if (done) return; done = true;
    unlockAudio(); chime();
    const r = el.querySelector('.logo-mark')!.getBoundingClientRect();
    sparkle(r.left + r.width / 2, r.top + r.height / 2, 70, 9);
    void whenSeeded().then(() => go(categoriesScreen, 'forward'));
  };
  el.querySelector('.splash__go')!.addEventListener('click', next);
  const t1 = setTimeout(() => {
    const r = el.querySelector('.logo-mark')?.getBoundingClientRect();
    if (r) sparkle(r.left + r.width * 0.85, r.top + r.height * 0.2, 36, 4);
  }, 900);
  return () => clearTimeout(t1);
}
