// Научные цели по пути: признаки из слоёв NASA, уже загруженных для маршрута.
// Панель не ищет в каталоге исследований — она показывает, где по данным стоит остановиться.

import { useEffect, useState } from 'react';

import type { LonLat } from '@/features/globe/engine';
import { thermalInertiaAt } from '@/features/planner/hazard';
import type { HazardGrid, RouteResult } from '@/features/planner/routing';
import { sampleRoute } from '@/features/science/ResearchAlongRoute';
import { findRouteTargets, type RouteSample, type RouteTarget } from '@/features/science/routeTargets';
import { tr, useT } from '@/shared/i18n/lang';
import { geologyAlong } from '@/shared/regions/regionAt';

/** Сколько точек маршрута опрашивается: шаг в сотни метров даже на длинном пути. */
const SAMPLES = 200;

interface Props {
  route: RouteResult | null;
  hazard: HazardGrid | null;
  /** Порог рыхлого песка из hazard.json. */
  sandBelow: number;
  onFocus(point: LonLat): void;
  onAddStop?(point: LonLat): void;
}

function distanceLabel(metres: number): string {
  return metres >= 1000
    ? `${(metres / 1000).toFixed(1)} ${tr('км', 'km')}`
    : `${Math.round(metres)} ${tr('м', 'm')}`;
}

export function ScienceTargets({ route, hazard, sandBelow, onFocus, onAddStop }: Props) {
  const t = useT();
  const [targets, setTargets] = useState<RouteTarget[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTargets(null);
    setError('');
  }, [route]);

  async function search() {
    if (route?.status !== 'ok') return;
    setBusy(true);
    setError('');
    try {
      const points = sampleRoute(route.points, SAMPLES);
      const geology = await geologyAlong(points);
      const samples: RouteSample[] = points.map((point, index) => ({
        lon: point.lon,
        lat: point.lat,
        alongM: point.distanceM,
        heightM: point.heightM,
        slopeDeg: point.slopeDeg,
        geology: geology[index],
        inertia: hazard ? thermalInertiaAt(hazard, point.lon, point.lat) : null,
      }));
      setTargets(findRouteTargets(samples, { sandBelow, dataLevel: route.dataLevel }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr('Не удалось разобрать слои', 'Could not read the layers'));
    } finally {
      setBusy(false);
    }
  }

  const ready = route?.status === 'ok';

  return (
    <section className="research-route">
      <h2 className="planner-subtitle">{t('Научные цели по пути', 'Science targets along the path')}</h2>
      <p className="planner-note">
        {t(
          'Где остановиться по дороге: контакты геологических единиц, скальные выходы, уступы, песчаные поля и обзорные точки. Признаки выведены из орбитальных слоёв под маршрутом, это подсказка, а не измерение и не подтверждённая находка.',
          'Where to stop on the way: geologic contacts, rock exposures, scarps, sand fields and vantage points. The signs are derived from the orbital layers under the route; this is a hint, not a measurement and not a confirmed find.',
        )}
      </p>
      <div className="research-controls">
        <button type="button" className="ghost-button" disabled={!ready || busy} onClick={() => void search()}>
          {busy ? t('Разбор слоёв…', 'Reading layers…') : t('Найти цели по пути', 'Find targets along the path')}
        </button>
      </div>
      {!ready && (
        <p className="dim">
          {t('Постройте маршрут, чтобы разобрать слои под ним.', 'Build a route to read the layers under it.')}
        </p>
      )}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      {targets?.length === 0 && (
        <p className="dim">
          {t(
            'По этому пути слои не дали ни одного признака: единица геологической карты не меняется, резких уступов и вершин нет, тепловая инерция ровная.',
            'The layers gave no sign along this path: the geologic unit does not change, there are no sharp scarps or peaks, and thermal inertia is even.',
          )}
        </p>
      )}
      {targets && targets.length > 0 && (
        <ol className="science-targets">
          {targets.map((target) => (
            <li key={target.id}>
              <div className="target-head">
                <strong>{tr(...target.title)}</strong>
                <span className="mono">{distanceLabel(target.alongM)}</span>
              </div>
              <p className="target-why">{tr(...target.why)}</p>
              <p className="target-evidence">{tr(...target.evidence)}</p>
              <div className="target-actions">
                <button type="button" className="link-button" onClick={() => onFocus({ lon: target.lon, lat: target.lat })}>
                  {t('Показать на шаре', 'Show on the globe')}
                </button>
                {onAddStop && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onAddStop({ lon: target.lon, lat: target.lat })}
                  >
                    {t('Сделать остановкой', 'Make it a stop')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {targets && targets.length > 0 && !hazard && (
        <p className="planner-note">
          {t(
            'Слой тепловой инерции не загрузился: цели по грунту (скальные выходы и песчаные поля) в этот раз не искались.',
            'The thermal inertia layer did not load: ground targets (rock exposures and sand fields) were not searched this time.',
          )}
        </p>
      )}
    </section>
  );
}
