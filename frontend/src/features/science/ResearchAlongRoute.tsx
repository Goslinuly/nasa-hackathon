// Поиск исследований вдоль построенного маршрута: обзорный, измерения не переносятся на путь.

import { useEffect, useState } from 'react';

import type { LonLat } from '@/features/globe/engine';
import type { RouteResult } from '@/features/planner/routing';
import { fetchResearchRoute } from '@/shared/api/client';
import type { PlacedStudy, ResearchRoute, RouteSide } from '@/shared/api/scienceTypes';
import { makeMarsPoint } from '@/shared/coordinates/mars';
import { tr, useT } from '@/shared/i18n/lang';
import { regionsAlong, regionTypeLabel, type NamedRegion } from '@/shared/regions/regionAt';

const MAX_POINTS = 50;

/** Равномерная выборка точек ломаной: концы сохраняются, середина прореживается. */
export function sampleRoute<T>(points: T[], limit = MAX_POINTS): T[] {
  if (points.length <= limit) return points;
  const step = (points.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * step)]);
}

interface Props {
  endpoints: { a: LonLat | null; b: LonLat | null };
  route: RouteResult | null;
  onFocus(point: LonLat): void;
  onAddStop?(point: LonLat): void;
}

const SIDE_LABEL: Record<RouteSide, [string, string]> = {
  left: ['слева от линии', 'left of the line'],
  right: ['справа от линии', 'right of the line'],
  on_line: ['на самой линии', 'on the line'],
};

export function formatOffset(study: PlacedStudy): string {
  const metres = study.distance_from_route_m;
  const distance =
    metres >= 1000 ? `${Math.round(metres / 1000)} ${tr('км', 'km')}` : `${Math.round(metres)} ${tr('м', 'm')}`;
  return `${distance} ${tr(...SIDE_LABEL[study.side])}`;
}

export function ResearchAlongRoute({ endpoints, route, onFocus, onAddStop }: Props) {
  const t = useT();
  const [corridorKm, setCorridorKm] = useState('5');
  const [result, setResult] = useState<ResearchRoute | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const path: LonLat[] | null =
    route?.status === 'ok'
      ? sampleRoute(route.points)
      : endpoints.a && endpoints.b
        ? [endpoints.a, endpoints.b]
        : null;

  useEffect(() => {
    setResult(null);
    setError('');
  }, [route, endpoints.a, endpoints.b]);

  const [crossed, setCrossed] = useState<NamedRegion[]>([]);
  useEffect(() => {
    if (!path || path.length === 0) {
      setCrossed([]);
      return;
    }
    let alive = true;
    void regionsAlong(path).then((regions) => {
      if (alive) setCrossed(regions);
    });
    return () => {
      alive = false;
    };
    // path пересчитывается из route и endpoints, поэтому зависимости — они.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, endpoints.a, endpoints.b]);

  async function search() {
    if (!path) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const corridorM = Number(corridorKm) * 1000;
      if (!Number.isFinite(corridorM) || corridorM <= 0 || corridorM > 50000) {
        throw new Error(tr('Ширина поиска: от 0 до 50 км в каждую сторону.', 'Search width: 0 to 50 km on each side.'));
      }
      setResult(
        await fetchResearchRoute(
          path.map((point) => makeMarsPoint(point.lat, point.lon)),
          corridorM,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr('Не удалось выполнить поиск', 'Search failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="research-route">
      <h2 className="planner-subtitle">{t('Исследования рядом с путём', 'Research near the path')}</h2>
      <p className="planner-note">
        {t(
          'Находит в каталоге исследования рядом с этим путём и показывает их источники. Близость исследования к маршруту не переносит его измерения на ваш путь.',
          "Finds catalog studies near this path and shows their sources. A study being close to the route does not carry its measurements over to your path.",
        )}
      </p>
      <div className="research-controls">
        <label>
          <span>{t('Искать в каждую сторону, км', 'Search on each side, km')}</span>
          <input
            type="number"
            min="0.1"
            max="50"
            step="0.1"
            value={corridorKm}
            onChange={(event) => setCorridorKm(event.target.value)}
          />
        </label>
        <button type="button" className="ghost-button" disabled={!path || busy} onClick={search}>
          {busy ? t('Поиск…', 'Searching…') : t('Найти исследования', 'Find research')}
        </button>
      </div>
      {crossed.length > 0 && (
        <p className="planner-note">
          {t('Маршрут проходит через:', 'The route passes through:')}{' '}
          {crossed
            .map((r) => `${r.name}${regionTypeLabel(r.type) ? ` (${regionTypeLabel(r.type)})` : ''}`)
            .join(', ')}{' '}
          · {t('газеттир IAU, USGS', 'IAU gazetteer, USGS')}
        </p>
      )}
      {!path && <p className="dim">{t('Поставьте точки A и Б, чтобы искать исследования по пути.', 'Place points A and B to search for research along the path.')}</p>}
      {path && route?.status !== 'ok' && (
        <p className="dim">{t('Маршрут ещё не рассчитан, поэтому поиск пойдёт по прямой между A и Б.', 'The route is not calculated yet, so the search follows a straight line between A and B.')}</p>
      )}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div aria-live="polite">
          <p>
            {t('Длина линии поиска', 'Search line length')} {(result.route_length_m / 1000).toFixed(1)} {t('км', 'km')}.{' '}
            {t('Найдено исследований', 'Studies found')}: {result.matched_total}.
          </p>
          {result.matched_total === 0 && (
            <p className="dim">
              {t(
                'В каталоге пока нет исследований с координатами в этом коридоре. Это не значит, что участок не исследовался.',
                'The catalog has no studies with coordinates in this corridor yet. That does not mean the area was never studied.',
              )}
            </p>
          )}
          {result.nearby.length > 0 && (
            <div className="research-nearby">
              <p className="dim">
                {result.matched_total === 0
                  ? t('На самой линии ничего нет, но в стороне от неё нашлось:', 'Nothing on the line itself, but found off to the side:')
                  : t('Рядом с линией, но за коридором:', 'Near the line, but outside the corridor:')}
              </p>
              <ul className="dim">
                {result.nearby.map((study) => (
                  <li key={study.id}>
                    {study.title}, {formatOffset(study)}
                  </li>
                ))}
              </ul>
              <p className="dim">
                {result.nearby_total > result.nearby.length
                  ? t(`Показаны ближайшие ${result.nearby.length} из ${result.nearby_total}. `, `Showing the nearest ${result.nearby.length} of ${result.nearby_total}. `)
                  : ''}
                {t(
                  'Расширьте коридор, чтобы они попали в поиск. На сам маршрут их измерения не переносятся.',
                  'Widen the corridor to include them. Their measurements do not carry over to the route itself.',
                )}
              </p>
            </div>
          )}
          {result.unlocated_studies > 0 && (
            <p className="dim">
              {t('Наборов без координат', 'Datasets without coordinates')}: {result.unlocated_studies}.{' '}
              {t('На путь они не нанесены.', 'They are not plotted on the path.')}
            </p>
          )}
          {result.truncated && (
            <p className="dim">
              {t(`Показаны первые ${result.studies.length}. Сузьте коридор или разбейте путь.`, `Showing the first ${result.studies.length}. Narrow the corridor or split the path.`)}
            </p>
          )}
          <ol className="research-results">
            {result.studies.map((study) => (
              <li key={study.id}>
                <h3>{study.title}</h3>
                <p>{study.summary}</p>
                <p className="mono dim">
                  {[study.mission, study.instrument].filter(Boolean).join(' · ')} ·{' '}
                  {(study.distance_from_start_m / 1000).toFixed(1)} {t('км от A', 'km from A')} ·{' '}
                  {Math.round(study.distance_from_route_m)} {t('м от линии', 'm from the line')}
                </p>
                <p className="dim">
                  {t('Привязка координат', 'Position')}:{' '}
                  {study.verification_status === 'source_verified'
                    ? t('сверено с источником', 'checked against the source')
                    : t('требует проверки', 'needs checking')}
                  . {t('Погрешность', 'Uncertainty')}:{' '}
                  {study.position_uncertainty_m == null
                    ? t('не указана', 'not stated')
                    : `${study.position_uncertainty_m} ${t('м', 'm')}`}
                  .{study.position_evidence ? ` ${study.position_evidence}` : ''}
                </p>
                <div className="research-actions">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      onFocus({ lon: study.longitude_deg!, lat: study.latitude_deg! })
                    }
                  >
                    {t('Показать на планете', 'Show on the planet')}
                  </button>
                  {onAddStop && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onAddStop({ lon: study.longitude_deg!, lat: study.latitude_deg! })}
                    >
                      {t('В маршрут', 'Add to route')}
                    </button>
                  )}
                  {study.source_url && (
                    <a href={study.source_url} target="_blank" rel="noreferrer">
                      {t('Источник ↗', 'Source ↗')}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
