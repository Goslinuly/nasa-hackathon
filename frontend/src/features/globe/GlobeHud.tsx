// HUD шара в режиме исследования: курсор, регион и геология под ним, высота камеры, разрешение данных.
import { useEffect, useState } from 'react';

import { useGlobeState, useValue } from '@/app/globeState';
import { regionAt, type RegionInfo } from '@/shared/regions/regionAt';

import { formatAltitude, formatResolution } from './format';

const lonEast = (lon: number) => ((lon % 360) + 360) % 360;

function useRegion(point: { lon: number; lat: number } | null): RegionInfo | null {
  const [info, setInfo] = useState<RegionInfo | null>(null);
  const key = point ? `${point.lon.toFixed(2)}:${point.lat.toFixed(2)}` : '';
  useEffect(() => {
    if (!key) return;
    const [lon, lat] = key.split(':').map(Number);
    let alive = true;
    const timer = setTimeout(() => {
      void regionAt(lon, lat).then((value) => {
        if (alive) setInfo(value);
      });
    }, 150);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key]);
  return info;
}

export function GlobeHud() {
  const { hover, view } = useGlobeState();
  const point = useValue(hover);
  const state = useValue(view);
  const region = useRegion(point);

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
        {point && region && (region.specific || region.province || region.geology) && (
          <span className="hud-sub">
            {[
              [region.specific?.name, region.province && region.province.name !== region.specific?.name ? region.province.name : null]
                .filter(Boolean)
                .join(' · '),
              region.geology ? `геология: ${region.geology.unit} — ${region.geology.label}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
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
          Предел источника ({formatResolution(state.nativeResolutionM)}). Дальше идёт только увеличение, новых деталей нет.
        </div>
      )}
    </div>
  );
}
