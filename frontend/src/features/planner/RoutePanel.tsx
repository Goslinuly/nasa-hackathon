// Режим «Построить маршрут»: точки A и Б, расчёт по MOLA в воркере, профиль и исследования рядом.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { useGlobeState, useValue } from '@/app/globeState';
import type { LonLat, ModeContext } from '@/app/modeContract';
import { EvaPanel } from '@/features/eva/EvaPanel';
import { ResearchAlongRoute } from '@/features/science/ResearchAlongRoute';

import { ElevationProfile } from './ElevationProfile';
import type { TraverseParams } from '@/shared/eva/traverse';

import {
  CREW_RANGE_KG,
  EVA_DEFAULT_TRAVERSE,
  EVA_PROVENANCE,
  LOAD_RANGE_KG,
  buildRouteOptions,
  clampMass,
  formatModelTime,
  formatOxygenCorridor,
  outsideModelWarning,
  type CostModel,
} from './routeOptions';
import { DEFAULT_ROUTE_OPTIONS, greatCircleM, type RouteResult } from './routing';
import type { WorkerRequest } from './routing.worker';

type Endpoint = 'a' | 'b';

const ENDPOINT_COLOR: Record<Endpoint, string> = { a: '#8fd0a0', b: '#ff9b7a' };

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

function MassField({
  label,
  value,
  range,
  onCommit,
}: {
  label: string;
  value: number;
  range: { min: number; max: number };
  onCommit(kg: number): void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = clampMass(Number(draft.replace(',', '.')), range, value);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <label className="eva-field">
      <span>
        {label}, кг ({range.min}–{range.max})
      </span>
      <input
        type="number"
        min={range.min}
        max={range.max}
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  );
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
    if (value && Math.abs(value.lat - latitude) < 1e-5 && Math.abs(lonEast(value.lon) - east) < 1e-5) return;
    onChange({ lat: latitude, lon: east });
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

/** Середина дуги между двумя точками — центр кадра для готового маршрута. */
function midpoint(a: LonLat, b: LonLat): LonLat {
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
  return {
    lat: (Math.atan2(my, Math.hypot(mx, mz)) * 180) / Math.PI,
    lon: lonEast((Math.atan2(mz, mx) * 180) / Math.PI),
  };
}

export default function RoutePanel({ globe }: ModeContext) {
  const { engine, terrain: terrainStore } = useGlobeState();
  const terrain = useValue(terrainStore);
  const workerRef = useRef<Worker | null>(null);
  const [workerReady, setWorkerReady] = useState(false);
  const requestRef = useRef(0);
  const pickRef = useRef<Endpoint | null>('a');

  const [endpoints, setEndpoints] = useState<Record<Endpoint, LonLat | null>>({ a: null, b: null });
  const [pick, setPick] = useState<Endpoint | null>('a');
  const [baseOptions, setBaseOptions] = useState(DEFAULT_ROUTE_OPTIONS);
  const [costModel, setCostModel] = useState<CostModel>('distance');
  const [traverse, setTraverse] = useState<TraverseParams>(EVA_DEFAULT_TRAVERSE);
  const options = useMemo(() => buildRouteOptions(baseOptions, costModel, traverse), [baseOptions, costModel, traverse]);
  const evaMode = costModel === 'eva';
  const [speedKmh, setSpeedKmh] = useState(4);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeMs, setRouteMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [dayUnit, setDayUnit] = useState<DayUnit>('mars');

  useEffect(() => {
    pickRef.current = pick;
  }, [pick]);

  const placeEndpoint = useCallback((which: Endpoint, point: LonLat) => {
    setEndpoints((current) => ({ ...current, [which]: point }));
    setPick(which === 'a' ? 'b' : null);
  }, []);

  // Клик по шару ставит текущую точку.
  useEffect(() => {
    globe.onPick?.((point) => {
      const target = pickRef.current;
      if (target) placeEndpoint(target, point);
    });
    return () => globe.onPick?.(null);
  }, [globe, placeEndpoint]);

  useEffect(() => {
    const worker = new Worker(new URL('./routing.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; result: RouteResult; ms?: number }>) => {
      if (event.data.id !== requestRef.current) return;
      setRoute(event.data.result);
      setRouteMs(event.data.ms ?? null);
      setBusy(false);
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      setWorkerReady(false);
    };
  }, []);

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
    setWorkerReady(true);
  }, [terrain]);

  useEffect(() => {
    const markers = (['a', 'b'] as Endpoint[])
      .filter((which) => endpoints[which])
      .map((which) => ({
        id: which,
        lon: endpoints[which]!.lon,
        lat: endpoints[which]!.lat,
        label: which === 'a' ? 'A · старт' : 'Б · цель',
        kind: 'site' as const,
        color: ENDPOINT_COLOR[which],
      }));
    globe.setMarkers('endpoints', markers.length ? markers : null);
  }, [globe, endpoints]);

  useEffect(() => {
    const { a, b } = endpoints;
    if (!a || !b || terrain.status !== 'ready' || !workerReady || !workerRef.current) {
      setRoute(null);
      setBusy(false);
      return;
    }
    const id = ++requestRef.current;
    setBusy(true);
    const message: WorkerRequest = { type: 'route', id, a, b, options };
    workerRef.current.postMessage(message);
  }, [endpoints, options, terrain.status, workerReady]);

  const fitKeyRef = useRef('');
  useEffect(() => {
    if (!route || route.status !== 'ok') {
      globe.setLines('route', null);
      globe.setRoverRoute?.(null);
      return;
    }
    const smooth = globe.setRoverRoute?.(route.points) ?? route.points;
    globe.setLines('route', [{ points: smooth, color: '#7fd6ff', width: 3.5 }]);
    const { a, b } = endpoints;
    const key = `${a?.lon},${a?.lat},${b?.lon},${b?.lat}`;
    if (a && b && key !== fitKeyRef.current) {
      fitKeyRef.current = key;
      const span = route.greatCircleM / 3_396_190;
      void globe.flyTo({ ...midpoint(a, b), altitude: Math.min(2.4, Math.max(0.004, span * 1.3)) }, 1200);
    }
  }, [globe, route, endpoints]);

  // Точка профиля под курсором — отдельная метка движка, без пересоздания слоёв.
  useEffect(() => () => engine.setProbe(null), [engine]);

  const swap = () => setEndpoints(({ a, b }) => ({ a: b, b: a }));
  const clear = () => {
    setEndpoints({ a: null, b: null });
    setPick('a');
    fitKeyRef.current = '';
  };

  const straight = endpoints.a && endpoints.b ? greatCircleM(endpoints.a, endpoints.b) : null;

  return (
    <div className="route-panel">
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
            onChange={(e) => setBaseOptions({ ...baseOptions, maxSlopeDeg: Number(e.target.value) })}
          />
        </label>
        <div className="day-toggle" role="radiogroup" aria-label="Способ расчёта маршрута">
          {(['distance', 'eva'] as CostModel[]).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={costModel === value}
              className={costModel === value ? 'active' : undefined}
              onClick={() => setCostModel(value)}
            >
              {value === 'distance' ? 'По расстоянию' : 'По расходу выхода'}
            </button>
          ))}
        </div>
        {evaMode && (
          <>
            <p className="planner-note">
              Скорость берётся из модели (V = −0,01·уклон + 0,75 м/с), ползунок скорости не влияет на модельное время.
            </p>
            <div className="day-toggle" role="radiogroup" aria-label="Поверхность">
              {(['firm', 'sand'] as TraverseParams['surface'][]).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={traverse.surface === value}
                  className={traverse.surface === value ? 'active' : undefined}
                  onClick={() => setTraverse({ ...traverse, surface: value })}
                >
                  {value === 'firm' ? 'Плотный грунт' : 'Песок'}
                </button>
              ))}
            </div>
            <MassField
              label="Масса экипажа"
              value={traverse.crewKg}
              range={CREW_RANGE_KG}
              onCommit={(crewKg) => setTraverse({ ...traverse, crewKg })}
            />
            <MassField
              label="Масса груза"
              value={traverse.loadKg}
              range={LOAD_RANGE_KG}
              onCommit={(loadKg) => setTraverse({ ...traverse, loadKg })}
            />
          </>
        )}
        <label>
          <span>
            Скорость <strong>{speedKmh} км/ч</strong>
            {evaMode ? ' · только для оценки «при заданной скорости»' : ''}
          </span>
          <input type="range" min={1} max={20} value={speedKmh} onChange={(e) => setSpeedKmh(Number(e.target.value))} />
        </label>
      </div>

      <div className="planner-result" aria-live="polite">
        {terrain.status === 'loading' && <p className="dim">Загрузка карты высот…</p>}
        {terrain.status === 'failed' && (
          <p className="warn">
            Маршрут по рельефу построить нельзя: {terrain.message ?? 'карта высот недоступна'}{' '}
            <button type="button" className="link-button" onClick={() => window.location.reload()}>
              Перезагрузить страницу
            </button>
          </p>
        )}
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
                <dt>{evaMode ? `Время при ${speedKmh} км/ч` : 'Время в пути'}</dt>
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
              {route.eva && (
                <>
                  <div>
                    <dt>Время по модели</dt>
                    <dd>≈ {formatModelTime(route.eva.seconds)}</dd>
                    <span className="day-note">
                      Не то же, что «время при {speedKmh} км/ч»: здесь скорость зависит от уклона каждого участка.
                    </span>
                  </div>
                  <div>
                    <dt>Кислород</dt>
                    <dd className="eva-corridor">{formatOxygenCorridor(route.eva.o2LowL, route.eva.o2HighL)}</dd>
                  </div>
                </>
              )}
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
              onHover={(index) => engine.setProbe(index == null ? null : route.points[index])}
            />
            <p className="planner-note">
              Обзорная оценка по MOLA ~7.4 км/пикс{routeMs != null ? ` · расчёт ${Math.round(routeMs)} мс` : ''}.
              Участки круче {options.maxSlopeDeg}° исключены, но обрывы, камни и кратеры мельче ~7 км не учтены.
              Это направление, а не проверенная тропа.{' '}
              {route.eva
                ? `«Время при ${speedKmh} км/ч» — простая симуляция без остановок; «Время по модели» считает скорость по уклону (V = −0,01·уклон + 0,75 м/с) и от ползунка не зависит.`
                : `Время рассчитано для ${speedKmh} км/ч без остановок.`}
            </p>
            {route.eva && (
              <>
                {outsideModelWarning(route.eva.outsideModelSegments) && (
                  <p className="warn">{outsideModelWarning(route.eva.outsideModelSegments)}</p>
                )}
                <p className="planner-note">{EVA_PROVENANCE}</p>
              </>
            )}
            <EvaPanel
              profile={route.points}
              {...(route.eva ? { surface: route.eva.surface, crewKg: route.eva.crewKg, loadKg: route.eva.loadKg } : {})}
            />
          </>
        )}
      </div>

      <ResearchAlongRoute
        endpoints={endpoints}
        route={route}
        onFocus={(point) => void globe.flyTo({ lon: point.lon, lat: point.lat, altitude: 0.05 }, 1200)}
      />
    </div>
  );
}
