import { render } from 'solid-js/web';
import Main from './Main';
import WidgetPage from './WidgetPage';

// Simple routing based on path
const path = window.location.pathname;
const widgetMatch = path.match(/^\/message\/([^/]+)\/widget$/);

if (widgetMatch) {
  render(() => <WidgetPage messageId={widgetMatch[1]} />, document.getElementById('root')!);
} else {
  render(() => <Main />, document.getElementById('root')!);
}
