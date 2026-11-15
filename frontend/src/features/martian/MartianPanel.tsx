// Боковая панель режима «Маршрут „Марсианина“»: остановки, профиль высот, облёт.
import { useEffect, useRef, useState } from 'react';

import type { ModeContext } from '@/app/modeContract';

import { loadRoute, mainStops, routeLines, stopMarkers, type RouteFile, type RouteStop } from './data';
import { RouteProfile } from './RouteProfile';
import { SiteBriefCard } from '@/features/walk/SiteBrief';
import './martian.css';

const LINES = 'watney-route';
const MARKERS = 'watney-stops';
const FLY_PAUSE_MS = 1800;

const fmtKm = (km: number) => Math.round(km).toLocaleString('ru-RU');

function latLon(stop: RouteStop): string {
  const ns = stop.lat >= 0 ? 'с. ш.' : 'ю. ш.';
  return `${Math.abs(stop.lat).toFixed(3)}° ${ns}, ${stop.lon.toFixed(3)}° в. д.`;
}

export default function MartianPanel({ globe, openMode }: ModeContext) {
  const [route, setRoute] = useState<RouteFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [flying, setFlying] = useState(false);
  /** Номер текущего облёта: новый облёт или размонтирование отменяют старый. */
  const flightRun = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    loadRoute(controller.signal)
      .then(setRoute)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      controller.abort();
      flightRun.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!route) return;
    globe.setLines(LINES, routeLines(route));
    globe.setMarkers(MARKERS, stopMarkers(route), id => {
      flightRun.current += 1;
      setFlying(false);
      setSelected(id);
    });
    return () => {
      globe.setLines(LINES, null);
      globe.setMarkers(MARKERS, null);
    };
  }, [route, globe]);

  const stop = route?.stops.find(s => s.id === selected) ?? null;

  useEffect(() => {
    if (!stop || flying) return;
    globe.flyTo({ lon: stop.lon, lat: stop.lat, altitude: 0.12 }).catch(() => undefined);
  }, [stop, flying, globe]);

  const flyRoute = async () => {
    if (!route) return;
    const run = ++flightRun.current;
    setFlying(true);
    try {
      for (const s of mainStops(route)) {
        if (flightRun.current !== run) return;
        setSelected(s.id);
        await globe.flyTo({ lon: s.lon, lat: s.lat, altitude: 0.25 }, 2500);
        if (flightRun.current !== run) return;
        await new Promise(resolve => setTimeout(resolve, FLY_PAUSE_MS));
      }
    } catch {
      // Глобус прервал перелёт — просто останавливаемся.
    } finally {
      if (flightRun.current === run) setFlying(false);
    }
  };

  const stopFlight = () => {
    flightRun.current += 1;
    setFlying(false);
  };

  return (
    <aside className="mt-panel" aria-label="Маршрут „Марсианина“">

      {error && <p className="mt-warn">Маршрут не загрузился: {error}</p>}
      {!route && !error && <p className="mt-dim">Загружаю маршрут…</p>}

      {route && (
        <>
          <p className="mt-note">{route.note}</p>
          <p className="mt-dim">
            Около {fmtKm(route.profile.total_km)} км по прямым между остановками. {route.geometry_note}
          </p>

          <div className="mt-actions">
            {flying ? (
              <button type="button" className="mt-btn" onClick={stopFlight}>Остановить облёт</button>
            ) : (
              <button type="button" className="mt-btn" onClick={flyRoute}>Облететь маршрут</button>
            )}
          </div>
          <SiteBriefCard siteId="ares3" label="Спуститься на Ares 3" onDescend={() => openMode('walk', { site: 'ares3' })} />

          <RouteProfile points={route.profile.points} stops={route.stops} activeStopId={selected} />
          <p className="mt-credit">
            Рельеф: <a href={route.profile.source_url} target="_blank" rel="noreferrer">MOLA MEGDR</a>,{' '}
            {route.profile.credit}. Шаг {route.profile.step_km} км, перепады мельче не видны.
          </p>

          <ol className="mt-stops">
            {route.stops.map(s => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`mt-stop-btn${s.id === selected ? ' is-active' : ''}`}
                  onClick={() => {
                    stopFlight();
                    setSelected(s.id);
                  }}
                >
                  <span className="mt-stop-name">{s.name}</span>
                  <span className="mt-stop-km">
                    {s.route_km === null ? `вылазка ${fmtKm(s.side_trip_km ?? 0)} км` : `${fmtKm(s.route_km)} км`}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          {stop && (
            <section className="mt-card">
              <h3>{stop.name}</h3>
              <p className="mt-dim">
                {stop.place} · {latLon(stop)} · {stop.elevation_m.toLocaleString('ru-RU')} м
              </p>
              <p>{stop.novel}</p>
              {stop.images.length > 0 && (
                <ul className="mt-links">
                  {stop.images.map(img => (
                    <li key={img.url}>
                      <a href={img.url} target="_blank" rel="noreferrer">{img.title}</a>
                    </li>
                  ))}
                </ul>
              )}
              <a className="mt-credit" href={stop.coord_source} target="_blank" rel="noreferrer">
                Источник координат
              </a>
              {stop.walk_site && stop.walk_site !== 'ares3' && (
                <button type="button" className="mt-btn" onClick={() => openMode('walk', { site: stop.walk_site! })}>
                  Спуститься сюда
                </button>
              )}
            </section>
          )}

          <blockquote className="mt-quote">
            <p>«{route.hirise_remark.ru}»</p>
            <p className="mt-dim" lang="en">“{route.hirise_remark.text}”</p>
            <footer>
              — <a href={route.hirise_remark.url} target="_blank" rel="noreferrer">{route.hirise_remark.author}</a>
            </footer>
          </blockquote>

          <p className="mt-credit">
            Снимки: NASA/JPL-Caltech/ASU (THEMIS), NASA/JPL/University of Arizona (HiRISE). Роман «Марсианин»
            Энди Вейра.
          </p>
        </>
      )}
    </aside>
  );
}
