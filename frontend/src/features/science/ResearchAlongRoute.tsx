// Поиск исследований вдоль построенного маршрута: обзорный, измерения не переносятся на путь.

import { useEffect, useState } from 'react';

import type { LonLat } from '@/features/globe/engine';
import type { RouteResult } from '@/features/planner/routing';
import { fetchResearchRoute } from '@/shared/api/client';
import type { PlacedStudy, ResearchRoute, RouteSide } from '@/shared/api/scienceTypes';
import { makeMarsPoint } from '@/shared/coordinates/mars';

const MAX_POINTS = 50;

export function sampleRoute(points: LonLat[], limit = MAX_POINTS): LonLat[] {
  if (points.length <= limit) return points;
  const step = (points.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * step)]);
}

interface Props {
  endpoints: { a: LonLat | null; b: LonLat | null };
  route: RouteResult | null;
  onFocus(point: LonLat): void;
}

const SIDE_LABEL: Record<RouteSide, string> = {
  left: 'слева от линии',
  right: 'справа от линии',
  on_line: 'на самой линии',
};

export function formatOffset(study: PlacedStudy): string {
  const metres = study.distance_from_route_m;
  const distance =
    metres >= 1000 ? `${Math.round(metres / 1000)} км` : `${Math.round(metres)} м`;
  return `${distance} ${SIDE_LABEL[study.side]}`;
}

export function ResearchAlongRoute({ endpoints, route, onFocus }: Props) {
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

  async function search() {
    if (!path) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const corridorM = Number(corridorKm) * 1000;
      if (!Number.isFinite(corridorM) || corridorM <= 0 || corridorM > 50000) {
        throw new Error('Ширина поиска: от 0 до 50 км в каждую сторону.');
      }
      setResult(
        await fetchResearchRoute(
          path.map((point) => makeMarsPoint(point.lat, point.lon)),
          corridorM,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось выполнить поиск');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="research-route">
      <h2 className="planner-subtitle">Исследования рядом с путём</h2>
      <p className="planner-note">
        Поиск по каталогу: какие исследования находятся рядом с этим путём, с их источниками.
        Близость исследования к маршруту не переносит его измерения на ваш путь.
      </p>
      <div className="research-controls">
        <label>
          <span>Искать в каждую сторону, км</span>
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
          {busy ? 'Поиск…' : 'Найти исследования'}
        </button>
      </div>
      {!path && <p className="dim">Поставьте точки A и Б, чтобы искать исследования по пути.</p>}
      {path && route?.status !== 'ok' && (
        <p className="dim">Маршрут ещё не рассчитан — поиск пойдёт по прямой между A и Б.</p>
      )}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div aria-live="polite">
          <p>
            Длина линии поиска {(result.route_length_m / 1000).toFixed(1)} км. Найдено
            исследований: {result.matched_total}.
          </p>
          {result.matched_total === 0 && (
            <p className="dim">
              В каталоге пока нет исследований с координатами в этом коридоре. Это не значит, что
              участок не исследовался.
            </p>
          )}
          {result.nearby.length > 0 && (
            <div className="research-nearby">
              <p className="dim">
                {result.matched_total === 0
                  ? 'По самой линии ничего нет, но рядом есть — в стороне от неё:'
                  : 'Рядом с линией, но за коридором:'}
              </p>
              <ul className="dim">
                {result.nearby.map((study) => (
                  <li key={study.id}>
                    {study.title} — {formatOffset(study)}
                  </li>
                ))}
              </ul>
              <p className="dim">
                {result.nearby_total > result.nearby.length
                  ? `Показаны ближайшие ${result.nearby.length} из ${result.nearby_total}. `
                  : ''}
                Расширьте коридор, чтобы они попали в поиск. На сам маршрут их измерения
                не переносятся.
              </p>
            </div>
          )}
          {result.unlocated_studies > 0 && (
            <p className="dim">
              Наборов без координат: {result.unlocated_studies}. На путь они не нанесены.
            </p>
          )}
          {result.truncated && (
            <p className="dim">
              Показаны первые {result.studies.length}. Сузьте коридор или разбейте путь.
            </p>
          )}
          <ol className="research-results">
            {result.studies.map((study) => (
              <li key={study.id}>
                <h3>{study.title}</h3>
                <p>{study.summary}</p>
                <p className="mono dim">
                  {[study.mission, study.instrument].filter(Boolean).join(' · ')} ·{' '}
                  {(study.distance_from_start_m / 1000).toFixed(1)} км от A ·{' '}
                  {Math.round(study.distance_from_route_m)} м от линии
                </p>
                <p className="dim">
                  Привязка координат:{' '}
                  {study.verification_status === 'source_verified'
                    ? 'сверено с источником'
                    : 'требует проверки'}
                  . Погрешность:{' '}
                  {study.position_uncertainty_m == null
                    ? 'не указана'
                    : `${study.position_uncertainty_m} м`}
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
                    Показать на планете
                  </button>
                  {study.source_url && (
                    <a href={study.source_url} target="_blank" rel="noreferrer">
                      Источник ↗
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
