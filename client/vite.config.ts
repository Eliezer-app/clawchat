import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 3101,
    proxy: {
      '/api': process.env.API_URL || 'http://server:3100'
    }
  }
});
