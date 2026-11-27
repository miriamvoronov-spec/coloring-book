// Installed-app entry (GitHub Pages / Netlify): adds the offline service worker.
import { registerSW } from 'virtual:pwa-register';
import './main';

registerSW({ immediate: true });
