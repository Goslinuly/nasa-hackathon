// Конфигурация Vite: алиас @ и прокси внешних источников и API для разработки.
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/jmars-ctx': {
        target: 'https://ms-lunaserv.mars.asu.edu',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/jmars-ctx/, '/wms'),
      },
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:8001',
        changeOrigin: true,
      },
      '/trek': {
        target: 'https://trek.nasa.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/trek/, '/tiles'),
      },
      '/ctx': {
        target: 'https://murray-lab.caltech.edu',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ctx/, '/CTX/V01/kml/MurrayLab_GlobalCTXMosaic_V01'),
      },
    },
  },
});
