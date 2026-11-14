// Две страницы без роутера: переход — обычная ссылка, WebGL-контекст пересоздаётся.
import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';

import '@/app/styles.css';

const isPlanner = window.location.pathname.replace(/\/+$/, '') === '/planner';
const isAtlas = window.location.pathname.replace(/\/+$/, '') === '/atlas';
const App = lazy(() => import('@/app/App').then(m => ({ default: m.App })));
const PlannerPage = lazy(() => import('@/features/planner/PlannerPage').then(m => ({ default: m.PlannerPage })));
const AtlasPage = lazy(() => import('@/features/map/AtlasPage').then(m => ({ default: m.AtlasPage })));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Suspense fallback={<p>Загрузка карты…</p>}>{isPlanner ? <PlannerPage /> : isAtlas ? <AtlasPage /> : <App />}</Suspense></React.StrictMode>,
);
