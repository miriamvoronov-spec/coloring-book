/** Opening screen: the logo appears with sparkles. Tap (or wait) to continue. */
import { go, whenSeeded } from '../app/app';
import { logoFull } from '../ui/logo';
import { sparkle } from '../ui/sparkles';
import { unlockAudio, chime } from '../ui/sound';
import { categoriesScreen } from './categories';
import { dailyLine, greeting, greetingIcon } from '../app/settings';
import { prefs } from '../app/store';

export function splashScreen(el: HTMLElement) {
  el.innerHTML = `
    <main class="splash" aria-label="מסך פתיחה">
      ${logoFull(Math.min(260, Math.round(innerWidth * 0.5)))}
      <p class="splash__tag">חוברות צביעה קסומות לפי מספרים</p>
      <button class="btn btn--gold splash__go" type="button">פתחי את הספרייה</button>
      <div class="splash__greet"><p class="splash__hello"></p><p class="splash__line"></p></div>
    </main>`;
  const hello = el.querySelector<HTMLElement>('.splash__hello')!, line = el.querySelector<HTMLElement>('.splash__line')!;
  hello.textContent = `${greetingIcon()} ${greeting()}`; hello.hidden = !prefs.get('showGreeting', true);
  line.textContent = dailyLine(); line.hidden = !prefs.get('showLine', true);
  let done = false;
  const next = () => {
    if (done) return; done = true;
    unlockAudio(); chime();
    const r = el.querySelector('.logo-mark')!.getBoundingClientRect();
    sparkle(r.left + r.width / 2, r.top + r.height / 2, 70, 9);
    void whenSeeded().then(() => go(categoriesScreen, 'forward'));
  };
  el.querySelector('.splash__go')!.addEventListener('click', next);
  return () => {};
}
