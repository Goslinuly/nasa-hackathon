// Атлас: плоская карта Марса с панелью слоёв; в оболочке — полноэкранный режим.
import { useState } from 'react';
import { MarsMap } from './MarsMap';
import type { ModeContext } from '@/app/modeContract';
import { CoverageCard } from '@/features/coverage/CoverageCard';
import { formatMarsPoint, type MarsPoint } from '@/shared/coordinates/mars';
import './atlas.css';

export function AtlasPage({ onExit, onRoute }: { onExit(): void; onRoute(): void }) {
  const [point, setPoint] = useState<MarsPoint | null>(null);
  const [details, setDetails] = useState(false);
  return <div className={`atlas-app detail-mode ${details ? 'inspector-open' : ''}`}>
    <header className="atlas-header">
      <button type="button" className="atlas-back" onClick={onExit}>← На шар</button>
      <span className="brand">Martian Map · 2D-атлас</span>
      <nav aria-label="Действия атласа"><button type="button" onClick={onRoute}>Маршрут →</button><button type="button" aria-pressed={details} onClick={() => setDetails(v => !v)}>Покрытие точки</button></nav>
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

export function AtlasMode({ exit, openMode }: ModeContext) {
  return <AtlasPage onExit={exit} onRoute={() => openMode('route')} />;
}
