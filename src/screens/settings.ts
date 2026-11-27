/** Settings: her name (for the greeting), the app's look, sounds and sparkles, about. */
import { go } from '../app/app';
import { greeting, greetingIcon, saveSettings, settings, THEMES, TITLE_FONTS } from '../app/settings';
import { h, toast } from '../ui/dom';
import { appBar } from '../ui/appbar';
import { categoriesScreen } from './categories';

function section(title: string, ...kids: Node[]): HTMLElement {
  return h('section', { class: 'set-card' }, h('h2', { class: 'set-card__title' }, title), ...kids);
}

function toggle(label: string, on: boolean, set: (v: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', class: 'switch__input', checked: on }) as HTMLInputElement;
  input.addEventListener('change', () => set(input.checked));
  return h('label', { class: 'switch' }, h('span', {}, label), input, h('span', { class: 'switch__track', 'aria-hidden': 'true' }));
}

export function settingsScreen(el: HTMLElement) {
  const s = settings();
  const hello = h('p', { class: 'set-hello' }, `${greetingIcon()} ${greeting()}`);
  const refreshHello = () => { hello.textContent = `${greetingIcon()} ${greeting()}`; };

  const name = h('input', { class: 'field', id: 'set-name', value: s.name, placeholder: 'השם שלך', maxlength: 30, autocomplete: 'given-name' }) as HTMLInputElement;
  name.addEventListener('input', () => { saveSettings({ name: name.value.trim() }); refreshHello(); });

  const themes = h('div', { class: 'theme-grid', role: 'radiogroup', 'aria-label': 'עיצוב' });
  for (const t of THEMES) {
    const b = h('button', { class: 'theme-choice' + (t.id === s.theme ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': String(t.id === s.theme) },
      h('span', { class: 'theme-choice__swatch', style: `background: linear-gradient(135deg, ${t.swatch[0]} 55%, ${t.swatch[1]} 55%)` }),
      h('span', {}, t.name));
    b.addEventListener('click', () => {
      themes.querySelectorAll('.theme-choice').forEach((x) => { x.classList.remove('is-on'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('is-on'); b.setAttribute('aria-checked', 'true');
      saveSettings({ theme: t.id });
    });
    themes.append(b);
  }

  const fonts = h('div', { class: 'font-grid', role: 'radiogroup', 'aria-label': 'גופן הכותרות' });
  for (const f of TITLE_FONTS) {
    const b = h('button', { class: 'font-choice' + (f.id === s.titleFont ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': String(f.id === s.titleFont), style: `font-family: ${f.css}` },
      'הספרייה שלי');
    b.title = f.name;
    b.addEventListener('click', () => {
      fonts.querySelectorAll('.font-choice').forEach((x) => { x.classList.remove('is-on'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('is-on'); b.setAttribute('aria-checked', 'true');
      saveSettings({ titleFont: f.id });
    });
    fonts.append(b);
  }

  el.append(h('main', { class: 'settings' },
    appBar({ title: 'הגדרות', back: { label: 'חזרה לספרייה', to: () => go(categoriesScreen, 'back') }, settings: false }),
    h('div', { class: 'settings__body' },
      hello,
      section('איך לקרוא לך?', h('label', { for: 'set-name', class: 'set-label' }, 'השם יופיע בברכה לפי השעה: בוקר, צהריים, ערב ולילה'), name),
      section('עיצוב האפליקציה', themes),
      section('גופן הכותרות', fonts),
      section('קסם וצלילים',
        toggle('צלילי דפדוף וניצוצות קול', s.sounds, (v) => saveSettings({ sounds: v })),
        toggle('ניצוצות וקונפטי', s.sparkles, (v) => saveSettings({ sparkles: v }))),
      section('אודות',
        h('p', { class: 'set-about' }, 'Miriam Coloring Books. החוברות והצביעה נשמרות רק במכשיר הזה.'),
        h('p', { class: 'set-about muted' }, 'הגופן Waltograph של mickeyavenue.com, לשימוש אישי בלבד (CC BY-NC-SA).')),
    )));
  const onLeave = () => toast('ההגדרות נשמרו');
  return () => { if (name.value.trim() !== s.name) onLeave(); };
}
