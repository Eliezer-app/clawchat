import { render } from 'solid-js/web';
import Main from './Main';

if (location.pathname === '/display') {
  import('./Display.css');
} else {
  import('./Main.css');
}

render(() => <Main />, document.getElementById('root')!);
