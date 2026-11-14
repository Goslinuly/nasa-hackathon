// Страница атласа: плоская карта Марса с панелью слоёв.
import { useState } from 'react';
import { MarsMap } from './MarsMap';
import { CoverageCard } from '@/features/coverage/CoverageCard';
import { formatMarsPoint, type MarsPoint } from '@/shared/coordinates/mars';
import './atlas.css';

export function AtlasPage() {
  const [point, setPoint] = useState<MarsPoint | null>(null);
  const [details, setDetails] = useState(false);
  return <div className={`atlas-app detail-mode ${details ? 'inspector-open' : ''}`}>
    <header className="atlas-header">
      <a className="brand" href="/">Martian Map</a>
      <nav aria-label="Основная навигация"><a href="/atlas" aria-current="page">Атлас</a><a href="/planner">Маршрут →</a><button onClick={() => setDetails(v => !v)}>Покрытие точки</button></nav>
      <span className="atlas-tag">Space Apps 2026</span>
    </header>
    <main className="atlas-layout">
      <div className="atlas-map-area"><MarsMap selected={point} onSelect={setPoint} focus={null} route={null} /></div>
      {details && <aside className="atlas-inspector"><div className="inspector-heading">Данные точки<button aria-label="Закрыть панель" onClick={() => setDetails(false)}>×</button></div>
        <div className="selected-point">{point ? formatMarsPoint(point, 5) : 'Выберите точку на карте'}</div>
        <div className="inspector-coverage"><CoverageCard point={point} /></div>
      </aside>}
    </main>
  </div>;
}
