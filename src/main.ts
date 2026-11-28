import { mountJobsPill } from './ui/jobs';
import './styles/base.css';
import './ui/install';
import { initApp, go, whenSeeded } from './app/app';
import { splashScreen } from './screens/splash';
import { applySettings } from './app/settings';

import { mountPlayer } from './ui/player';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app missing');

// The Artifact host supplies its own <html>, so set the language and direction here.
document.documentElement.lang = 'he';
document.documentElement.dir = 'rtl';
applySettings();
// Ask the browser to keep her library even when space runs low (Safari otherwise clears sites unused for a week).
try { void navigator.storage?.persist?.(); } catch { /* not offered */ }
initApp(app);
void whenSeeded().then(async () => { const { loadSampleBooks } = await import('./app/samples'); await loadSampleBooks(); });
import { takeAfterSwitch } from './app/account';
const afterSwitch = takeAfterSwitch();
import { needsGate, gateScreen } from './screens/friends';
import { pendingInvite, pendingFriend } from './app/cloud';
const joinWaiting = !!pendingInvite() || !!pendingFriend();
if (needsGate()) go(gateScreen, 'fade');
else if (joinWaiting || afterSwitch === 'friends' || /[#&](join|access_token)=|[?&]code=|^#google$/.test(location.hash + location.search) || location.hash === '#google' || location.hash === '#friends') void import('./screens/friends').then((m) => go(m.friendsScreen, 'fade'));
else go(splashScreen, 'fade');
mountPlayer();
mountJobsPill();
