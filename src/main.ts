import './styles/base.css';
import { initApp, go, whenSeeded } from './app/app';
import { splashScreen } from './screens/splash';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app missing');

initApp(app);
void whenSeeded();
go(splashScreen, 'fade');
