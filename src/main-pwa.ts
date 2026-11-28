// Installed-app entry (GitHub Pages / Netlify): adds the offline service worker.
import { registerSW } from 'virtual:pwa-register';
import './main';

// Look for a new version at every start, whenever the app comes back to the front,
// and every half hour; a new version installs itself and the app reloads into it.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => { if (navigator.onLine) void reg.update().catch(() => {}); };
    check();
    setInterval(check, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  },
});
