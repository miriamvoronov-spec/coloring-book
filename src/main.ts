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
initApp(app);
void whenSeeded().then(async () => { const { loadSampleBooks } = await import('./app/samples'); await loadSampleBooks(); });
go(splashScreen, 'fade');
mountPlayer();
mountJobsPill();
