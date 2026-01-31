import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 3102,
    proxy: {
      '/api': process.env.API_URL || 'http://server:3101'
    }
  }
});
