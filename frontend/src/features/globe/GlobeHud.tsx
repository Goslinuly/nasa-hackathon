// HUD шара в режиме исследования: курсор, высота камеры, реальное разрешение данных под центром.
import { useGlobeState, useValue } from '@/app/globeState';

import { formatAltitude, formatResolution } from './format';

const lonEast = (lon: number) => ((lon % 360) + 360) % 360;

export function GlobeHud() {
  const { hover, view } = useGlobeState();
  const point = useValue(hover);
  const state = useValue(view);

  return (
    <div className="hud shell-hud" aria-live="off">
      <div>
        <span className="hud-label">Курсор</span>
        <span className="hud-value">
          {point
            ? `${Math.abs(point.lat).toFixed(4)}° ${point.lat >= 0 ? 'N' : 'S'}  ${lonEast(point.lon).toFixed(4)}° E`
            : '—'}
        </span>
        {point?.heightM != null && (
          <span className="hud-sub">MOLA {Math.round(point.heightM).toLocaleString('ru-RU')} м · над ареоидом</span>
        )}
      </div>
      {state && (
        <>
          <div>
            <span className="hud-label">Высота камеры</span>
            <span className="hud-value">{formatAltitude(state.altitudeKm)}</span>
          </div>
          <div>
            <span className="hud-label">Данные под центром</span>
            <span className="hud-value">{formatResolution(state.dataResolutionM)}</span>
            <span className="hud-sub">{state.sourceTitle}</span>
          </div>
        </>
      )}
      {state?.overLimit && (
        <div className="hud-warn">
          Предел источника ({formatResolution(state.nativeResolutionM)}): дальше — увеличение без новых деталей.
        </div>
      )}
    </div>
  );
}
