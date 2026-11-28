/** The app's top bar: back, title, extra actions, home (opening screen) and settings. */
import { go } from '../app/app';
import { h } from './dom';
import { icons } from './icons';

export interface BarOpts { title?: Node | string; back?: { label: string; to: () => void }; end?: Node[]; home?: boolean | 'splash'; settings?: boolean }

export function appBar(o: BarOpts): HTMLElement {
  const bar = h('header', { class: 'appbar' });
  if (o.back) {
    bar.append(h('button', { class: 'icon-btn', type: 'button', 'aria-label': o.back.label, title: o.back.label, html: icons.back, onclick: o.back.to }));
  }
  const title = typeof o.title === 'string' ? h('h1', { class: 'appbar__title', dir: 'auto' }, o.title) : o.title ?? h('span', { class: 'appbar__title' });
  bar.append(title);
  const end = h('div', { class: 'appbar__end' }, ...(o.end ?? []));
  if (o.home !== false) {
    // home: from the library itself to the opening screen, from anywhere else to the library
    const toSplash = o.home === 'splash';
    const label = toSplash ? 'למסך הפתיחה' : 'לספרייה';
    end.append(h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, title: label, html: icons.home,
      onclick: async () => {
        if (toSplash) { const { splashScreen } = await import('../screens/splash'); go(splashScreen, 'back'); }
        else { const { categoriesScreen } = await import('../screens/categories'); go(categoriesScreen, 'back'); }
      } }));
  }
  if (o.settings !== false) {
    end.append(h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'הגדרות', title: 'הגדרות', html: icons.gear,
      onclick: async () => { const { settingsScreen } = await import('../screens/settings'); go(settingsScreen, 'forward'); } }));
  }
  bar.append(end);
  return bar;
}
