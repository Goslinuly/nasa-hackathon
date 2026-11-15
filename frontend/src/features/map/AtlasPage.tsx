// Атлас: плоская карта Марса с панелью слоёв; в оболочке — полноэкранный режим.
import { useState } from 'react';
import { MarsMap } from './MarsMap';
import type { ModeContext } from '@/app/modeContract';
import { CoverageCard } from '@/features/coverage/CoverageCard';
import { formatMarsPoint, type MarsPoint } from '@/shared/coordinates/mars';
import { useT } from '@/shared/i18n/lang';
import { LangSwitch } from '@/shared/i18n/LangSwitch';
import './atlas.css';

export function AtlasPage({ onExit, onRoute }: { onExit(): void; onRoute(): void }) {
  const [point, setPoint] = useState<MarsPoint | null>(null);
  const [details, setDetails] = useState(false);
  const t = useT();
  return <div className={`atlas-app detail-mode ${details ? 'inspector-open' : ''}`}>
    <header className="atlas-header">
      <button type="button" className="atlas-back" onClick={onExit}>{t('← На шар', '← To the globe')}</button>
      <span className="brand">Martian Map · {t('2D-атлас', '2D atlas')}</span>
      <div className="atlas-header-end">
        <nav aria-label={t('Действия атласа', 'Atlas actions')}><button type="button" onClick={onRoute}>{t('Маршрут →', 'Route →')}</button><button type="button" aria-pressed={details} onClick={() => setDetails(v => !v)}>{t('Покрытие точки', 'Point coverage')}</button></nav>
        <LangSwitch className="atlas-lang" />
      </div>
    </header>
    <main className="atlas-layout">
      <div className="atlas-map-area"><MarsMap selected={point} onSelect={setPoint} focus={null} route={null} /></div>
      {details && <aside className="atlas-inspector"><div className="inspector-heading">{t('Данные точки', 'Point data')}<button aria-label={t('Закрыть панель', 'Close panel')} onClick={() => setDetails(false)}>×</button></div>
        <div className="selected-point">{point ? formatMarsPoint(point, 5) : t('Выберите точку на карте', 'Select a point on the map')}</div>
        <div className="inspector-coverage"><CoverageCard point={point} /></div>
      </aside>}
    </main>
  </div>;
}

export function AtlasMode({ exit, openMode }: ModeContext) {
  return <AtlasPage onExit={exit} onRoute={() => openMode('route')} />;
}
