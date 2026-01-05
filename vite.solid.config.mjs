import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [
    solid(),
  ],
  root: '.',
  build: {
    outDir: 'dist-ui-solid',
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/jobs': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      }
    },
  },
});
