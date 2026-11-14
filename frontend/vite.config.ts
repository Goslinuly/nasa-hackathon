import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // ms-ctx отвечает 302 на http://ms-lunaserv — по https это mixed content
      // и тайл не грузится. Обращаемся к lunaserv напрямую, он умеет https.
      '/jmars-ctx': {
        target: 'https://ms-lunaserv.mars.asu.edu',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/jmars-ctx/, '/wms'),
      },
      '/api': {
        // 8001 — порт локального uvicorn (8000 на этой машине занят другим сервисом)
        target: process.env.VITE_API_PROXY ?? 'http://localhost:8001',
        changeOrigin: true,
      },
      // Тайлы NASA Mars Trek для WebGL-текстур: прокси даёт same-origin,
      // т.к. trek.nasa.gov не отдаёт CORS-заголовки для canvas/WebGL.
      // В продакшене этот путь обслуживает reverse proxy или FastAPI.
      '/trek': {
        target: 'https://trek.nasa.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/trek/, '/tiles'),
      },
      // Глобальная мозаика CTX Murray Lab: тоже без CORS-заголовков.
      '/ctx': {
        target: 'https://murray-lab.caltech.edu',
        changeOrigin: true,
        // Сервер отдаёт неполную цепочку сертификатов; это публичные снимки только для чтения.
        secure: false,
        rewrite: (path) => path.replace(/^\/ctx/, '/CTX/V01/kml/MurrayLab_GlobalCTXMosaic_V01'),
      },
    },
  },
});
