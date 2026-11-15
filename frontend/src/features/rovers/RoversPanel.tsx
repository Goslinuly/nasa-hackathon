// Боковая панель режима «Маршруты роверов».
import { useEffect, useMemo, useState } from 'react';

import type { GlobeLine, ModeContext } from '@/app/modeContract';
import { fetchRoverPositions } from '@/shared/api/client';
import type { RoverPositionsOk } from '@/shared/api/evaTypes';
import { locale, useLang, useT } from '@/shared/i18n/lang';

import {
  ROVER_COLORS,
  formatLatLon,
  formatUtc,
  loadRoversData,
  roverItems,
  roverMarkers,
  traversePoints,
  type RoversData,
} from './data';
import { SiteBriefCard } from '@/features/walk/SiteBrief';
import './rovers.css';

const LINES = 'traverses';
const MARKERS = 'positions';

export default function RoversPanel({ globe, openMode }: ModeContext) {
  const [data, setData] = useState<RoversData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const t = useT();
  const lang = useLang();
  const [live, setLive] = useState<RoverPositionsOk | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchRoverPositions().then(
      (data) => alive && data.status === 'ok' && setLive(data),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadRoversData(controller.signal)
      .then(setData)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, []);

  // Подписи зависят от языка, позиции — от живого запроса: пересобираем при смене любого.
  const items = useMemo(() => {
    const base = data ? roverItems(data.current) : [];
    if (!live) return base;
    return base.map((item) => {
      const now = live.rovers[item.id];
      if (!now) return item;
      return {
        ...item,
        lat: now.lat,
        lon: now.lon,
        sol: now.sol ?? item.sol,
        distanceKm: now.dist_total_m ? now.dist_total_m / 1000 : item.distanceKm,
      };
    });
  }, [data, live, lang]);

  useEffect(() => {
    if (!data) return;
    const lines: GlobeLine[] = Object.entries(data.traverses).map(([id, file]) => ({
      points: traversePoints(file),
      color: ROVER_COLORS[id] ?? '#ffffff',
      width: 3,
    }));
    const flights = data.current.ingenuity.flights;
    if (flights.length > 1) {
      lines.push({
        points: flights.map(f => ({ lon: f.lon, lat: f.lat })),
        color: ROVER_COLORS.ingenuity,
        width: 1.5,
        dashed: true,
      });
    }
    globe.setLines(LINES, lines);
    globe.setMarkers(MARKERS, roverMarkers(items), id => setSelected(id));
    return () => {
      globe.setLines(LINES, null);
      globe.setMarkers(MARKERS, null);
    };
  }, [data, items, globe]);

  const current = items.find(item => item.id === selected) ?? null;

  useEffect(() => {
    if (!current) return;
    globe.flyTo({ lon: current.lon, lat: current.lat, altitude: 0.02 }).catch(() => undefined);
  }, [current, globe]);

  return (
    <aside className="rv-panel" aria-label={t('Маршруты роверов', 'Rover routes')}>

      {error && <p className="rv-error">{t('Данные не загрузились', 'Data failed to load')}: {error}</p>}
      {!data && !error && <p className="rv-dim">{t('Загружаю треки…', 'Loading tracks…')}</p>}

      {data && (
        <>
          <p className="rv-dim">
            {live
              ? t(
                  `Позиции запрошены ${formatUtc(live.fetched_utc)} напрямую из NASA MMGIS: ${live.note}.`,
                  `Positions requested ${formatUtc(live.fetched_utc)} straight from NASA MMGIS: ${live.note}.`,
                )
              : t(
                  `Позиции на ${formatUtc(data.current.fetched_utc)} (снимок набора NASA MMGIS; живой запрос не прошёл).`,
                  `Positions as of ${formatUtc(data.current.fetched_utc)} (NASA MMGIS snapshot; the live request failed).`,
                )}{' '}
            {t(
              `Треки показаны по снимку от ${formatUtc(data.current.fetched_utc)}.`,
              `Traverses are drawn from the snapshot taken ${formatUtc(data.current.fetched_utc)}.`,
            )}
          </p>
          <ul className="rv-list">
            {items.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`rv-item${item.id === selected ? ' is-active' : ''}`}
                  onClick={() => setSelected(item.id)}
                >
                  <span className="rv-swatch" style={{ background: ROVER_COLORS[item.id] }} />
                  <span className="rv-name">{item.name}</span>
                  <span className="rv-meta">
                    {t('сол', 'sol')} {item.sol} · {item.distanceKm.toLocaleString(locale(), { maximumFractionDigits: 1 })} {t('км', 'km')}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {current && (
            <section className="rv-card">
              <h3>{current.name}</h3>
              <p className="rv-dim">{current.mission}</p>
              <dl>
                <dt>{t('Сол', 'Sol')}</dt>
                <dd>{current.sol}</dd>
                <dt>{t('Координаты', 'Coordinates')}</dt>
                <dd>{formatLatLon(current.lat, current.lon)}</dd>
                <dt>{current.id === 'ingenuity' ? t('Пролетел', 'Flown') : t('Проехал', 'Driven')}</dt>
                <dd>{current.distanceKm.toLocaleString(locale(), { maximumFractionDigits: 2 })} {t('км', 'km')}</dd>
              </dl>
              <p>{current.detail}</p>
              {current.walkSite && (
                <SiteBriefCard
                  siteId={current.walkSite}
                  label={t('Пройти по маршруту', 'Walk the route')}
                  onDescend={() => openMode('walk', { site: current.walkSite! })}
                />
              )}
              <a className="rv-source" href={current.sourceUrl} target="_blank" rel="noreferrer">
                {t('Источник', 'Source')}: NASA/JPL-Caltech, MMGIS
              </a>
            </section>
          )}

          <footer className="rv-credit">
            {t('Треки упрощены до ~2000 точек. Данные', 'Tracks simplified to ~2000 points. Data')}: {data.current.credit}.
          </footer>
        </>
      )}
    </aside>
  );
}
