import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 3102,
    proxy: {
      '/api': process.env.API_URL || 'http://127.0.0.1:3101',
      '/invite': process.env.API_URL || 'http://127.0.0.1:3101'
    }
  }
});
