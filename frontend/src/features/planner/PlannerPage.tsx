// Страница планировщика маршрута A → Б: ввод точек, расчёт в воркере, профиль и исследования рядом.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

import {
  EXAGGERATION_OPTIONS,
  MarsGlobeEngine,
  type HoverPoint,
  type LonLat,
  type TerrainState,
  type ViewState,
} from '@/features/globe/engine';
import { CTX_OVERLAY, HIRISE_OVERLAYS, SPECTRA, type SpectrumId } from '@/features/globe/layers';
import { DataCredits } from '@/features/globe/DataCredits';
import { EvaPanel } from '@/features/eva/EvaPanel';
import { ResearchAlongRoute } from '@/features/science/ResearchAlongRoute';
import { ElevationProfile } from './ElevationProfile';
import { DEFAULT_ROUTE_OPTIONS, greatCircleM, type RouteOptions, type RouteResult } from './routing';
import type { WorkerRequest } from './routing.worker';

const SPECTRUM_ORDER: SpectrumId[] = ['natural', 'hypsometry', 'shade', 'themis-day', 'themis-night'];

type Endpoint = 'a' | 'b';

function formatResolution(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} км/пикс`;
  if (meters >= 10) return `${Math.round(meters)} м/пикс`;
  return `${meters.toFixed(meters >= 1 ? 1 : 2)} м/пикс`;
}

function formatAltitude(km: number): string {
  if (km >= 100) return `${Math.round(km).toLocaleString('ru-RU')} км`;
  if (km >= 1) return `${km.toFixed(1)} км`;
  return `${Math.round(km * 1000)} м`;
}

function formatKm(m: number): string {
  return `${(m / 1000).toLocaleString('ru-RU', { maximumFractionDigits: m < 100_000 ? 1 : 0 })} км`;
}

const SOL_HOURS = 88_775.244 / 3600;

type DayUnit = 'earth' | 'mars';

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(Math.floor(n));
  if (!Number.isInteger(n)) return forms[1];
  if (abs % 10 === 1 && abs % 100 !== 11) return forms[0];
  if (abs % 10 >= 2 && abs % 10 <= 4 && (abs % 100 < 10 || abs % 100 >= 20)) return forms[1];
  return forms[2];
}

function formatDuration(hours: number, unit: DayUnit): string {
  const dayHours = unit === 'mars' ? SOL_HOURS : 24;
  const days = hours / dayHours;
  if (days >= 1) {
    const whole = Math.floor(days);
    const rest = Math.round((days - whole) * dayHours);
    const word = unit === 'mars' ? plural(whole, ['сол', 'сола', 'солов']) : plural(whole, ['сутки', 'суток', 'суток']);
    return rest > 0 ? `${whole} ${word} ${rest} ч` : `${whole} ${word}`;
  }
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const min = total % 60;
  const share = unit === 'mars' ? ` · ${days.toFixed(2)} сола` : '';
  return (h > 0 ? `${h} ч ${min} мин` : `${min} мин`) + share;
}

const lonEast = (lon: number) => ((lon % 360) + 360) % 360;

function CoordinateFields({ value, onChange }: { value: LonLat | null; onChange(point: LonLat): void }) {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');

  useEffect(() => {
    setLat(value ? value.lat.toFixed(4) : '');
    setLon(value ? lonEast(value.lon).toFixed(4) : '');
  }, [value]);

  const commit = () => {
    const latitude = Number(lat.replace(',', '.'));
    const longitude = Number(lon.replace(',', '.'));
    if (lat === '' || lon === '' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    if (Math.abs(latitude) > 90) return;
    const east = lonEast(longitude);
    onChange({ lat: latitude, lon: east > 180 ? east - 360 : east });
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit();
  };

  return (
    <div className="coord-fields">
      <label>
        <span>Шир.</span>
        <input inputMode="decimal" value={lat} placeholder="18.44" onChange={(e) => setLat(e.target.value)} onBlur={commit} onKeyDown={onKey} />
      </label>
      <label>
        <span>Долг. E</span>
        <input inputMode="decimal" value={lon} placeholder="77.45" onChange={(e) => setLon(e.target.value)} onBlur={commit} onKeyDown={onKey} />
      </label>
    </div>
  );
}

export function PlannerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MarsGlobeEngine | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);
  const pickRef = useRef<Endpoint | null>('a');

  const [hover, setHover] = useState<HoverPoint | null>(null);
  const [view, setView] = useState<ViewState | null>(null);
  const [terrain, setTerrain] = useState<TerrainState>({ status: 'loading' });
  const [endpoints, setEndpoints] = useState<Record<Endpoint, LonLat | null>>({ a: null, b: null });
  const [pick, setPick] = useState<Endpoint | null>('a');
  const [options, setOptions] = useState<RouteOptions>(DEFAULT_ROUTE_OPTIONS);
  const [speedKmh, setSpeedKmh] = useState(4);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeMs, setRouteMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [spectrumId, setSpectrumId] = useState<SpectrumId>('natural');
  const [ctxOn, setCtxOn] = useState(true);
  const [hiriseOn, setHiriseOn] = useState(true);
  const [exaggeration, setExaggeration] = useState(3);
  const [dayUnit, setDayUnit] = useState<DayUnit>('mars');
  const [routeOpen, setRouteOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(true);

  useEffect(() => {
    pickRef.current = pick;
  }, [pick]);

  const placeEndpoint = useCallback((which: Endpoint, point: LonLat) => {
    setEndpoints((current) => ({ ...current, [which]: point }));
    setPick(which === 'a' ? 'b' : null);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const labels = labelsRef.current;
    if (!canvas || !labels) return;

    const engine = new MarsGlobeEngine(
      canvas,
      labels,
      {
        onHover: setHover,
        onView: setView,
        onTerrain: setTerrain,
        onSelect: (point) => {
          const target = pickRef.current;
          if (target) placeEndpoint(target, point);
        },
        onRegionSelect: (marker) => engineRef.current?.focus(marker.lon, marker.lat, 0.05),
      },
      'planner',
    );
    engineRef.current = engine;

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      engine.setSize(rect.width, rect.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement!);

    const worker = new Worker(new URL('./routing.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; result: RouteResult; ms?: number }>) => {
      if (event.data.id !== requestRef.current) return;
      setRoute(event.data.result);
      setRouteMs(event.data.ms ?? null);
      setBusy(false);
    };
    workerRef.current = worker;

    return () => {
      observer.disconnect();
      worker.terminate();
      engine.dispose();
      engineRef.current = null;
      workerRef.current = null;
    };
  }, [placeEndpoint]);

  useEffect(() => {
    if (terrain.status !== 'ready' || !workerRef.current) return;
    const { field } = terrain;
    const heights = field.heights.slice();
    const message: WorkerRequest = {
      type: 'init',
      grid: {
        width: field.meta.width,
        height: field.meta.height,
        pixelsPerDegree: field.meta.pixels_per_degree,
        heights,
      },
    };
    workerRef.current.postMessage(message, [heights.buffer]);
  }, [terrain]);

  useEffect(() => {
    engineRef.current?.setEndpoint('a', endpoints.a);
    engineRef.current?.setEndpoint('b', endpoints.b);
  }, [endpoints]);

  useEffect(() => {
    const { a, b } = endpoints;
    if (!a || !b || terrain.status !== 'ready' || !workerRef.current) {
      setRoute(null);
      engineRef.current?.setRoute(null);
      return;
    }
    const id = ++requestRef.current;
    setBusy(true);
    const message: WorkerRequest = { type: 'route', id, a, b, options };
    workerRef.current.postMessage(message);
  }, [endpoints, options, terrain.status]);

  const fitKeyRef = useRef('');
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!route || route.status !== 'ok') {
      engine.setRoute(null);
      return;
    }
    engine.setRoute(route.points);
    const { a, b } = endpoints;
    const key = `${a?.lon},${a?.lat},${b?.lon},${b?.lat}`;
    if (a && b && key !== fitKeyRef.current) {
      fitKeyRef.current = key;
      const toVec = (p: LonLat) => {
        const lat = (p.lat * Math.PI) / 180;
        const lon = (p.lon * Math.PI) / 180;
        return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
      };
      const [x1, y1, z1] = toVec(a);
      const [x2, y2, z2] = toVec(b);
      const mx = x1 + x2;
      const my = y1 + y2;
      const mz = z1 + z2;
      const mid = {
        lat: (Math.atan2(my, Math.hypot(mx, mz)) * 180) / Math.PI,
        lon: (Math.atan2(mz, mx) * 180) / Math.PI,
      };
      const span = route.greatCircleM / 3_396_190;
      engine.focus(mid.lon, mid.lat, Math.min(2.4, Math.max(0.004, span * 1.3)));
    }
  }, [route, endpoints]);

  const chooseSpectrum = (id: SpectrumId) => {
    setSpectrumId(id);
    engineRef.current?.setSpectrum(id);
  };

  const toggleCtx = () => {
    engineRef.current?.setOverlayEnabled(CTX_OVERLAY.id, !ctxOn);
    setCtxOn(!ctxOn);
  };

  const toggleHirise = () => {
    HIRISE_OVERLAYS.forEach((overlay) => engineRef.current?.setOverlayEnabled(overlay.id, !hiriseOn));
    setHiriseOn(!hiriseOn);
  };

  const chooseExaggeration = (value: number) => {
    setExaggeration(value);
    engineRef.current?.setExaggeration(value);
  };

  const swap = () => setEndpoints(({ a, b }) => ({ a: b, b: a }));
  const clear = () => {
    setEndpoints({ a: null, b: null });
    setPick('a');
    fitKeyRef.current = '';
  };

  const spectrum = SPECTRA[spectrumId];
  const straight = endpoints.a && endpoints.b ? greatCircleM(endpoints.a, endpoints.b) : null;

  return (
    <div className="planner">
      <div className="planner-viewport">
      <nav className="topbar">
        <a className="brand" href="/">
          Martian&nbsp;Map
        </a>
        <div className="topbar-links">
          <a href="/atlas">Атлас</a>
          <a href="/planner" className="active" aria-current="page">
            Маршрут
          </a>
        </div>
        <span className="topbar-tag">Space&nbsp;Apps&nbsp;2026</span>
      </nav>

      <div className="globe-stage planner-stage">
        <canvas ref={canvasRef} className={`globe-canvas${pick ? ' picking' : ''}`} />
        <div ref={labelsRef} className="globe-labels" />
      </div>

      {!routeOpen && (
        <button type="button" className="panel-tab panel-tab-left" onClick={() => setRouteOpen(true)}>
          Маршрут ▸
        </button>
      )}
      <aside className="planner-panel" aria-label="Маршрут" hidden={!routeOpen}>
        <div className="panel-head">
          <h1 className="planner-title">Маршрут A → Б</h1>
          <button type="button" className="panel-close" aria-label="Скрыть панель маршрута" onClick={() => setRouteOpen(false)}>
            ◂
          </button>
        </div>
        <p className="planner-hint">
          {pick
            ? `Кликните по планете, чтобы поставить точку ${pick === 'a' ? 'A' : 'Б'}, или введите координаты.`
            : 'Чтобы переставить точку, нажмите «Выбрать» рядом с ней.'}
        </p>

        {(['a', 'b'] as Endpoint[]).map((which) => (
          <div key={which} className={`endpoint endpoint-${which}${pick === which ? ' picking' : ''}`}>
            <div className="endpoint-head">
              <span className="endpoint-badge">{which === 'a' ? 'A' : 'Б'}</span>
              <span className="endpoint-name">{which === 'a' ? 'Старт' : 'Цель'}</span>
              <button type="button" className="link-button" onClick={() => setPick(pick === which ? null : which)}>
                {pick === which ? 'Отмена' : 'Выбрать'}
              </button>
            </div>
            <CoordinateFields value={endpoints[which]} onChange={(point) => placeEndpoint(which, point)} />
            {endpoints[which] && terrain.status === 'ready' && (
              <span className="endpoint-height">
                Высота MOLA {Math.round(terrain.field.sample(endpoints[which]!.lon, endpoints[which]!.lat)).toLocaleString('ru-RU')} м
              </span>
            )}
          </div>
        ))}

        <div className="planner-actions">
          <button type="button" className="ghost-button" onClick={swap} disabled={!endpoints.a && !endpoints.b}>
            ⇅ Поменять
          </button>
          <button type="button" className="ghost-button" onClick={clear} disabled={!endpoints.a && !endpoints.b}>
            Сбросить
          </button>
        </div>

        <div className="planner-params">
          <label>
            <span>
              Макс. уклон <strong>{options.maxSlopeDeg}°</strong>
            </span>
            <input
              type="range"
              min={3}
              max={30}
              value={options.maxSlopeDeg}
              onChange={(e) => setOptions({ ...options, maxSlopeDeg: Number(e.target.value) })}
            />
          </label>
          <label>
            <span>
              Скорость <strong>{speedKmh} км/ч</strong>
            </span>
            <input type="range" min={1} max={20} value={speedKmh} onChange={(e) => setSpeedKmh(Number(e.target.value))} />
          </label>
        </div>

        <div className="planner-result" aria-live="polite">
          {terrain.status === 'loading' && <p className="dim">Загрузка карты высот…</p>}
          {terrain.status === 'failed' && <p className="warn">{terrain.message ?? 'Карта высот недоступна'} — расчёт рельефного маршрута недоступен. <button onClick={() => window.location.reload()}>Повторить загрузку страницы</button></p>}
          {busy && <p className="dim">Расчёт маршрута…</p>}
          {!busy && route?.status === 'unreachable' && (
            <p className="warn">
              Путь с уклоном не круче {options.maxSlopeDeg}° не найден (по прямой {formatKm(route.greatCircleM)}).
              Увеличьте допустимый уклон.
            </p>
          )}
          {!busy && route?.status === 'invalid' && <p className="warn">{route.reason}</p>}
          {!busy && route?.status === 'ok' && (
            <>
              <dl className="route-stats">
                <div>
                  <dt>Длина пути</dt>
                  <dd>{formatKm(route.lengthM)}</dd>
                </div>
                <div>
                  <dt>По прямой</dt>
                  <dd>{formatKm(straight ?? route.greatCircleM)}</dd>
                </div>
                <div>
                  <dt>Подъём / спуск</dt>
                  <dd>
                    +{Math.round(route.ascentM).toLocaleString('ru-RU')} / −{Math.round(route.descentM).toLocaleString('ru-RU')} м
                  </dd>
                </div>
                <div>
                  <dt>Макс. уклон</dt>
                  <dd>{route.maxSlopeDeg.toFixed(1)}°</dd>
                </div>
                <div className="route-time">
                  <dt>Время в пути</dt>
                  <dd>≈ {formatDuration(route.lengthM / 1000 / speedKmh, dayUnit)}</dd>
                  <div className="day-toggle" role="radiogroup" aria-label="Единица суток">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={dayUnit === 'mars'}
                      className={dayUnit === 'mars' ? 'active' : undefined}
                      onClick={() => setDayUnit('mars')}
                    >
                      Солы
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={dayUnit === 'earth'}
                      className={dayUnit === 'earth' ? 'active' : undefined}
                      onClick={() => setDayUnit('earth')}
                    >
                      Земные сутки
                    </button>
                  </div>
                  <span className="day-note">
                    {dayUnit === 'mars'
                      ? `= ${formatDuration(route.lengthM / 1000 / speedKmh, 'earth')} по-земному · 1 сол = 24 ч 39 мин 35 с`
                      : `= ${formatDuration(route.lengthM / 1000 / speedKmh, 'mars')} · 1 сол = 24 ч 39 мин 35 с`}
                  </span>
                </div>
                <div>
                  <dt>Высоты</dt>
                  <dd>
                    {Math.round(route.minHeightM).toLocaleString('ru-RU')}…{Math.round(route.maxHeightM).toLocaleString('ru-RU')} м
                  </dd>
                </div>
              </dl>
              <h2 className="planner-subtitle">Профиль высот</h2>
              <ElevationProfile
                points={route.points}
                onHover={(index) => engineRef.current?.setProbe(index == null ? null : route.points[index])}
              />
              <p className="planner-note">
                Обзорная оценка по MOLA ~7.4 км/пикс{routeMs != null ? ` · расчёт ${Math.round(routeMs)} мс` : ''}.
                Участки круче {options.maxSlopeDeg}° исключены, но обрывы, камни и кратеры мельче ~7 км не
                учтены: это направление, а не проверенная тропа. Время — симуляция при {speedKmh} км/ч без
                остановок.
              </p>
              <EvaPanel profile={route.points} />
            </>
          )}
        </div>

        <ResearchAlongRoute
          endpoints={endpoints}
          route={route}
          onFocus={(point) => engineRef.current?.focus(point.lon, point.lat, 0.05)}
        />
      </aside>

      {!layersOpen && (
        <button type="button" className="panel-tab panel-tab-right" onClick={() => setLayersOpen(true)}>
          ◂ Слои
        </button>
      )}
      <aside className="planner-layers" aria-label="Слои" hidden={!layersOpen}>
        <div className="panel-head">
          <span className="hud-label">Спектр</span>
          <button type="button" className="panel-close" aria-label="Скрыть панель слоёв" onClick={() => setLayersOpen(false)}>
            ▸
          </button>
        </div>
        <div className="layer-list" role="radiogroup" aria-label="Спектр">
          {SPECTRUM_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={id === spectrumId}
              className={id === spectrumId ? 'active' : undefined}
              onClick={() => chooseSpectrum(id)}
            >
              {SPECTRA[id].title}
            </button>
          ))}
        </div>
        <p className="layer-desc">{spectrum.description}</p>
        {spectrum.legend && (
          <div className="legend">
            <span className="legend-quantity">{spectrum.legend.quantity}</span>
            <span className="legend-bar" style={{ background: spectrum.legend.gradient }} />
            <span className="legend-ends">
              <span>{spectrum.legend.low}</span>
              <span>{spectrum.legend.high}</span>
            </span>
          </div>
        )}
        <span className="layer-meta">
          {formatResolution(spectrum.nativeResolutionM)} · {spectrum.coverage}
        </span>

        <span className="hud-label">Детальные снимки</span>
        <label className="check">
          <input type="checkbox" checked={ctxOn} onChange={toggleCtx} />
          <span>
            {CTX_OVERLAY.title}
            <small>почти вся планета, с ~160 м/пикс экрана</small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={hiriseOn} onChange={toggleHirise} />
          <span>
            HiRISE · 0.25–0.5 м (ч/б)
            <small>{HIRISE_OVERLAYS.map((o) => o.title).join(', ')}</small>
          </span>
        </label>

        <span className="hud-label">Рельеф по высоте</span>
        <div className="hud-toggle" role="radiogroup" aria-label="Вертикальное преувеличение">
          {EXAGGERATION_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={value === exaggeration}
              className={value === exaggeration ? 'active' : undefined}
              disabled={terrain.status !== 'ready'}
              onClick={() => chooseExaggeration(value)}
            >
              ×{value}
            </button>
          ))}
        </div>
        <span className="layer-meta">
          {exaggeration === 1 ? 'Реальный масштаб' : `Преувеличение ×${exaggeration}`} · геометрия MOLA ~7.4 км/пикс
        </span>
      </aside>

      <div className="zoom-buttons">
        <button type="button" aria-label="Приблизить" onClick={() => engineRef.current?.zoomBy(0.5)}>
          +
        </button>
        <button type="button" aria-label="Отдалить" onClick={() => engineRef.current?.zoomBy(2)}>
          −
        </button>
      </div>

      <div className="hud planner-hud">
        <div>
          <span className="hud-label">Курсор</span>
          <span className="hud-value">
            {hover
              ? `${Math.abs(hover.lat).toFixed(4)}° ${hover.lat >= 0 ? 'N' : 'S'}  ${lonEast(hover.lon).toFixed(4)}° E`
              : '—'}
          </span>
          {hover?.heightM != null && (
            <span className="hud-sub">MOLA {Math.round(hover.heightM).toLocaleString('ru-RU')} м</span>
          )}
        </div>
        {view && (
          <>
            <div>
              <span className="hud-label">Высота камеры</span>
              <span className="hud-value">{formatAltitude(view.altitudeKm)}</span>
            </div>
            <div>
              <span className="hud-label">Данные под центром</span>
              <span className="hud-value">{formatResolution(view.dataResolutionM)}</span>
              <span className="hud-sub">{view.sourceTitle}</span>
            </div>
          </>
        )}
        {view?.overLimit && (
          <div className="hud-warn">
            Предел источника ({formatResolution(view.nativeResolutionM)}): дальше — увеличение без новых деталей.
          </div>
        )}
      </div>

      </div>
      <footer className="footer planner-footer">
        <DataCredits />
        <span className="mono dim">MARTIAN MAP · v0.1</span>
      </footer>
    </div>
  );
}

