// Боковая панель режима «Маршруты роверов».
import { useEffect, useMemo, useState } from 'react';

import type { GlobeLine, ModeContext } from '@/app/modeContract';

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
import './rovers.css';

const LINES = 'traverses';
const MARKERS = 'positions';

export default function RoversPanel({ globe, openMode, exit }: ModeContext) {
  const [data, setData] = useState<RoversData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadRoversData(controller.signal)
      .then(setData)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, []);

  const items = useMemo(() => (data ? roverItems(data.current) : []), [data]);

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
    <aside className="rv-panel" aria-label="Маршруты роверов">
      <header className="rv-head">
        <h2>Маршруты роверов</h2>
        <button type="button" className="rv-close" onClick={exit} aria-label="Закрыть">×</button>
      </header>

      {error && <p className="rv-error">Данные не загрузились: {error}</p>}
      {!data && !error && <p className="rv-dim">Загружаю треки…</p>}

      {data && (
        <>
          <p className="rv-dim">
            Позиции на {formatUtc(data.current.fetched_utc)} (дата выгрузки из NASA MMGIS). Роверы
            едут дальше — на глобусе последняя известная нам точка.
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
                    сол {item.sol} · {item.distanceKm.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км
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
                <dt>Сол</dt>
                <dd>{current.sol}</dd>
                <dt>Координаты</dt>
                <dd>{formatLatLon(current.lat, current.lon)}</dd>
                <dt>{current.id === 'ingenuity' ? 'Пролетел' : 'Проехал'}</dt>
                <dd>{current.distanceKm.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} км</dd>
              </dl>
              <p>{current.detail}</p>
              {current.walkSite && (
                <button
                  type="button"
                  className="rv-action"
                  onClick={() => openMode('walk', { site: current.walkSite! })}
                >
                  Пройти по маршруту
                </button>
              )}
              <a className="rv-source" href={current.sourceUrl} target="_blank" rel="noreferrer">
                Источник: NASA/JPL-Caltech, MMGIS
              </a>
            </section>
          )}

          <footer className="rv-credit">
            Треки упрощены до ~2000 точек. Данные: {data.current.credit}.
          </footer>
        </>
      )}
    </aside>
  );
}
