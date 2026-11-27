import { registerSW } from 'virtual:pwa-register';
import './styles/base.css';
import { showSplash } from './screens/splash';

registerSW({ immediate: true });

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app missing');

showSplash(app);
