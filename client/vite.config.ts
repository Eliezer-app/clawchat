import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import fs from 'fs';

function getAppName(): string {
  try {
    const env = fs.readFileSync('../.env', 'utf-8');
    const match = env.match(/^APP_NAME=(.*)$/m);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

export default defineConfig({
  plugins: [
    solid(),
    {
      name: 'inject-app-name',
      transformIndexHtml(html) {
        const appName = getAppName();
        return html
          .replace(/<title>[^<]*<\/title>/, `<title>${appName}</title>`)
          .replace('</head>', `<script>window.__APP_NAME__=${JSON.stringify(appName)}</script></head>`);
      }
    }
  ],
  server: {
    port: 3102,
    proxy: {
      '/api': process.env.API_URL || 'http://127.0.0.1:3101',
      '/invite': process.env.API_URL || 'http://127.0.0.1:3101',
      '/chat-public': process.env.API_URL || 'http://127.0.0.1:3101',
      '/widget': process.env.API_URL || 'http://127.0.0.1:3101'
    }
  }
});
