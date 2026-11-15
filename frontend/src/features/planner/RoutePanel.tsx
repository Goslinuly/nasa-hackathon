// Режим «Построить маршрут»: точки A и Б, остановки, слои проходимости и детальный рельеф, расчёт в воркере.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import { useGlobeState, useValue } from '@/app/globeState';
import type { GlobeApi, LonLat, ModeContext } from '@/app/modeContract';
import { EvaPanel } from '@/features/eva/EvaPanel';
import { ResearchAlongRoute } from '@/features/science/ResearchAlongRoute';
import { getLang, locale, pick as pickLang, tr, useLang, useT } from '@/shared/i18n/lang';

import { DEMO_MISSION } from './demoMission';
import { SurfacePhotos } from './SurfacePhotos';
import { fetchManifest, fetchSiteIndex, type SiteIndexEntry } from '@/features/walk/sitePackage';

import { ElevationProfile } from './ElevationProfile';
import { findWalkSite, toWalkPoints } from './walkHandoff';
import { setPlannedWalkRoute } from '@/shared/walkRoute';
import type { TraverseParams } from '@/shared/eva/traverse';

import { loadHazardGrid } from './hazard';
import { findCoveringSite, loadLocalGrid, type SiteManifestBounds } from './localGrid';

import {
  CREW_RANGE_KG,
  EVA_DEFAULT_TRAVERSE,
  evaProvenance,
  LOAD_RANGE_KG,
  buildRouteOptions,
  clampMass,
  dataLevelNote,
  formatBlockedCells,
  formatDataLevel,
  formatDistanceKm as formatKm,
  formatSand,
  formatStopsCount,
  formatUnknownSurface,
  moveItem,
  routeReasonText,
  formatModelTime,
  formatOxygenCorridor,
  outsideModelWarning,
  type CostModel,
} from './routeOptions';
import { buildRoverTable, roverCardText, roverStatsAt, type ProfilePoint, type RoverCardText, type RoverModel } from './roverStats';
import './roverCard.css';
import { DEFAULT_ROUTE_OPTIONS, greatCircleM, type HazardGrid, type HeightGrid, type RouteResult } from './routing';
import type { WorkerRequest } from './routing.worker';

type Endpoint = 'a' | 'b';
type PickTarget = Endpoint | 'stop';

interface MultiInfo {
  stopIndices: number[];
  failedLeg?: number;
}

const ENDPOINT_COLOR: Record<Endpoint, string> = { a: '#8fd0a0', b: '#ff9b7a' };

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
    const en = getLang() === 'en';
    const word = en
      ? unit === 'mars' ? (whole === 1 ? 'sol' : 'sols') : whole === 1 ? 'day' : 'days'
      : unit === 'mars' ? plural(whole, ['сол', 'сола', 'солов']) : plural(whole, ['сутки', 'суток', 'суток']);
    return rest > 0 ? `${whole} ${word} ${rest} ${tr('ч', 'h')}` : `${whole} ${word}`;
  }
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const min = total % 60;
  const share = unit === 'mars' ? ` · ${days.toFixed(2)} ${tr('сола', 'sol')}` : '';
  return (h > 0 ? `${h} ${tr('ч', 'h')} ${min} ${tr('мин', 'min')}` : `${min} ${tr('мин', 'min')}`) + share;
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
  const t = useT();
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = clampMass(Number(draft.replace(',', '.')), range, value);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <label className="eva-field">
      <span>
        {label}, {t('кг', 'kg')} ({range.min}–{range.max})
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
  const t = useT();

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
        <span>{t('Шир.', 'Lat')}</span>
        <input inputMode="decimal" value={lat} placeholder="18.44" onChange={(e) => setLat(e.target.value)} onBlur={commit} onKeyDown={onKey} />
      </label>
      <label>
        <span>{t('Долг. E', 'Lon E')}</span>
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

const sameText = (a: RoverCardText | null, b: RoverCardText | null) =>
  a === b || (a !== null && b !== null && (Object.keys(a) as (keyof RoverCardText)[]).every((key) => a[key] === b[key]));

/** Карточка у марсохода: показания модели выхода в точке, куда доехала ускоренная анимация. */
function RoverCard({ globe, points, model }: { globe: GlobeApi; points: ProfilePoint[]; model: RoverModel }) {
  const table = useMemo(() => buildRoverTable(points, model), [points, model]);
  const [host] = useState(() => {
    const element = document.createElement('div');
    element.className = 'rover-card';
    element.setAttribute('aria-hidden', 'true');
    return element;
  });
  const [text, setText] = useState<RoverCardText | null>(null);
  const t = useT();

  useEffect(() => {
    globe.setRoverTag?.(host);
    return () => globe.setRoverTag?.(null);
  }, [globe, host]);

  useEffect(() => {
    const tick = () => {
      const progress = globe.roverProgress?.() ?? null;
      const stats = progress === null ? null : roverStatsAt(table, progress);
      const next = stats ? roverCardText(stats) : null;
      setText((current) => (sameText(current, next) ? current : next));
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [globe, table]);

  if (!text) return null;
  return createPortal(
    <div className="rover-card-body">
      <div className="rover-card-title">{t('Модель выхода · показ ускорен', 'EVA model · sped-up playback')}</div>
      <dl className="rover-card-full">
        <div>
          <dt>{t('Скорость', 'Speed')}</dt>
          <dd>{text.speed}</dd>
        </div>
        <div>
          <dt>{t('Расход O₂', 'O₂ rate')}</dt>
          <dd>{text.rate}</dd>
        </div>
        <div>
          <dt>{t('Израсходовано', 'Used')}</dt>
          <dd>{text.oxygen}</dd>
        </div>
        <div>
          <dt>{t('В пути', 'Elapsed')}</dt>
          <dd>{text.time}</dd>
        </div>
        <div>
          <dt>{t('Пройдено', 'Covered')}</dt>
          <dd>{text.distance}</dd>
        </div>
      </dl>
      <div className="rover-card-compact">
        <span>
          {text.distance} · {text.time}
        </span>
        <span>
          {text.speed} · O₂ {text.oxygen}
        </span>
      </div>
    </div>,
    host,
  );
}

export default function RoutePanel({ globe, openMode }: ModeContext) {
  const { engine, terrain: terrainStore } = useGlobeState();
  const terrain = useValue(terrainStore);
  const workerRef = useRef<Worker | null>(null);
  const [workerReady, setWorkerReady] = useState(false);
  const requestRef = useRef(0);
  const pickRef = useRef<PickTarget | null>('a');
  const t = useT();
  const lang = useLang();

  const [endpoints, setEndpoints] = useState<Record<Endpoint, LonLat | null>>({ a: null, b: null });
  const [pick, setPick] = useState<PickTarget | null>('a');
  const [stops, setStops] = useState<LonLat[]>([]);
  const [hazard, setHazard] = useState<HazardGrid | null>(null);
  const [hazardRetrieved, setHazardRetrieved] = useState<string>('');
  const [surfaceFromData, setSurfaceFromData] = useState(true);
  const [multi, setMulti] = useState<MultiInfo | null>(null);
  const [failedLeg, setFailedLeg] = useState<number | null>(null);
  const [initVersion, setInitVersion] = useState(0);
  const [siteIndex, setSiteIndex] = useState<SiteIndexEntry[]>([]);
  const [manifests, setManifests] = useState<Map<string, SiteManifestBounds>>(new Map());
  const [localWanted, setLocalWanted] = useState(false);
  const [localSite, setLocalSite] = useState<string | null>(null);
  const [localError, setLocalError] = useState('');
  const localGrids = useRef(new Map<string, HeightGrid>());
  const [baseOptions, setBaseOptions] = useState(DEFAULT_ROUTE_OPTIONS);
  const [costModel, setCostModel] = useState<CostModel>('distance');
  const [traverse, setTraverse] = useState<TraverseParams>(EVA_DEFAULT_TRAVERSE);
  const options = useMemo(
    () => buildRouteOptions(baseOptions, costModel, traverse, surfaceFromData),
    [baseOptions, costModel, traverse, surfaceFromData],
  );
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

  const addStop = useCallback((point: LonLat) => {
    setStops((current) => [...current, point]);
    setPick(null);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    void loadHazardGrid(abort.signal).then((bundle) => {
      if (bundle && !abort.signal.aborted) {
        setHazard(bundle.grid);
        setHazardRetrieved(bundle.manifest.retrieved ?? '');
      }
    });
    return () => abort.abort();
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const index = await fetchSiteIndex();
        const loaded = await Promise.all(index.map((entry) => fetchManifest(entry.id).catch(() => null)));
        if (!alive) return;
        const map = new Map<string, SiteManifestBounds>();
        loaded.forEach((manifest) => {
          if (manifest?.bounds_lonlat) map.set(manifest.id, manifest as SiteManifestBounds);
        });
        setSiteIndex(index);
        setManifests(map);
      } catch {
        setSiteIndex([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Клик по шару ставит текущую точку.
  useEffect(() => {
    globe.onPick?.((point) => {
      const target = pickRef.current;
      if (target === 'stop') addStop(point);
      else if (target) placeEndpoint(target, point);
    });
    return () => globe.onPick?.(null);
  }, [globe, placeEndpoint, addStop]);

  useEffect(() => {
    const worker = new Worker(new URL('./routing.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; result: RouteResult; multi?: MultiInfo; ms?: number }>) => {
      if (event.data.id !== requestRef.current) return;
      setBusy(false);
      const leg = event.data.multi?.failedLeg;
      if (leg !== undefined) {
        setFailedLeg(leg);
        return;
      }
      setFailedLeg(null);
      setMulti(event.data.multi ?? null);
      setRoute(event.data.result);
      setRouteMs(event.data.ms ?? null);
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
      ...(hazard ? { hazard } : {}),
    };
    workerRef.current.postMessage(message, [heights.buffer]);
    setWorkerReady(true);
    setInitVersion((version) => version + 1);
  }, [terrain, hazard]);

  const covering = useMemo(() => {
    const { a, b } = endpoints;
    return a && b ? findCoveringSite(siteIndex, manifests, [a, ...stops, b]) : null;
  }, [endpoints, stops, siteIndex, manifests]);
  const coveringId = covering?.id ?? null;

  useEffect(() => {
    if (!coveringId) setLocalWanted(false);
  }, [coveringId]);

  useEffect(() => {
    const wanted = localWanted ? coveringId : null;
    const worker = workerRef.current;
    if (!worker || wanted === localSite) return;
    if (!wanted) {
      worker.postMessage({ type: 'localGrid', grid: null } satisfies WorkerRequest);
      setLocalSite(null);
      return;
    }
    let alive = true;
    setLocalError('');
    void (async () => {
      try {
        const grid = localGrids.current.get(wanted) ?? (await loadLocalGrid(wanted));
        localGrids.current.set(wanted, grid);
        if (!alive) return;
        workerRef.current?.postMessage({ type: 'localGrid', grid } satisfies WorkerRequest);
        setLocalSite(wanted);
      } catch (reason) {
        if (!alive) return;
        setLocalWanted(false);
        setLocalError(reason instanceof Error ? reason.message : tr('Не удалось загрузить детальный рельеф', 'Could not load detailed terrain'));
      }
    })();
    return () => {
      alive = false;
    };
  }, [localWanted, coveringId, localSite]);

  const useLocal = localSite !== null && localWanted && localSite === coveringId;

  useEffect(() => {
    const markers = (['a', 'b'] as Endpoint[])
      .filter((which) => endpoints[which])
      .map((which) => ({
        id: which,
        lon: endpoints[which]!.lon,
        lat: endpoints[which]!.lat,
        label: which === 'a' ? tr('A · старт', 'A · start') : tr('Б · цель', 'B · target'),
        kind: 'site' as const,
        color: ENDPOINT_COLOR[which],
      }));
    globe.setMarkers('endpoints', markers.length ? markers : null);
  }, [globe, endpoints, lang]);

  useEffect(() => {
    globe.setMarkers(
      'stops',
      stops.length
        ? stops.map((stop, index) => ({
            id: `stop-${index}`,
            lon: stop.lon,
            lat: stop.lat,
            label: `${index + 1}`,
            kind: 'site' as const,
            color: '#c9a7ff',
          }))
        : null,
    );
  }, [globe, stops]);

  useEffect(() => {
    const { a, b } = endpoints;
    if (!a || !b || terrain.status !== 'ready' || !workerReady || !workerRef.current) {
      setRoute(null);
      setMulti(null);
      setFailedLeg(null);
      setBusy(false);
      return;
    }
    const id = ++requestRef.current;
    setBusy(true);
    const message: WorkerRequest = { type: 'route', id, stops: [a, ...stops, b], options, useLocal };
    workerRef.current.postMessage(message);
  }, [endpoints, stops, options, terrain.status, workerReady, initVersion, useLocal]);

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

  const swap = () => {
    setEndpoints(({ a, b }) => ({ a: b, b: a }));
    setStops((current) => current.slice().reverse());
  };
  const clear = () => {
    setEndpoints({ a: null, b: null });
    setStops([]);
    setPick('a');
    fitKeyRef.current = '';
  };

  const straight = endpoints.a && endpoints.b ? greatCircleM(endpoints.a, endpoints.b) : null;

  const roverModel = useMemo<RoverModel | null>(() => {
    if (!route || route.status !== 'ok') return null;
    if (route.eva) {
      const perCell = route.eva.surface === 'per_cell';
      return {
        crewKg: route.eva.crewKg,
        loadKg: route.eva.loadKg,
        surface: perCell ? 'firm' : (route.eva.surface as TraverseParams['surface']),
        perCell,
      };
    }
    return { ...traverse, perCell: false };
  }, [route, traverse]);

  const walkSiteId = useMemo(() => {
    if (route?.status !== 'ok' || route.points.length < 2) return null;
    const sites = siteIndex.flatMap((entry) => {
      const manifest = manifests.get(entry.id);
      return manifest ? [{ id: entry.id, bounds: manifest.bounds_lonlat }] : [];
    });
    return findWalkSite(sites, route.points);
  }, [route, siteIndex, manifests]);
  // Подробный участок — его рельеф HiRISE; иначе обзорный режим по глобальным данным.
  const walkIt = (siteId: string | null = walkSiteId) => {
    if (!siteId || route?.status !== 'ok') return;
    setPlannedWalkRoute({
      siteId,
      points: toWalkPoints(route.points),
      source: 'planner',
      label: `A → ${tr('Б', 'B')}, ${formatKm(route.lengthM)}`,
      createdAt: Date.now(),
    });
    openMode('walk', { site: siteId });
  };

  const demoOn =
    endpoints.a?.lon === DEMO_MISSION.a.lon &&
    endpoints.b?.lon === DEMO_MISSION.b.lon &&
    stops.length === DEMO_MISSION.stops.length;
  const runDemo = () => {
    fitKeyRef.current = '';
    setEndpoints({ a: DEMO_MISSION.a, b: DEMO_MISSION.b });
    setStops(DEMO_MISSION.stops.slice());
    setCostModel('eva');
    setSurfaceFromData(true);
    setLocalWanted(true);
    setPick(null);
  };

  return (
    <div className="route-panel">
      <button type="button" className={`demo-mission${demoOn ? ' is-on' : ''}`} onClick={runDemo}>
        <strong>{pickLang(DEMO_MISSION.title, DEMO_MISSION.titleEn)}</strong>
        <span>{t('Научная цель, маршрут через неё и бюджет выхода — одним нажатием', 'A science target, a route through it and the EVA budget in one click')}</span>
      </button>
      {demoOn && (
        <>
          <p className="planner-note">{pickLang(DEMO_MISSION.science, DEMO_MISSION.scienceEn)}</p>
          <p className="planner-note">{pickLang(DEMO_MISSION.plan, DEMO_MISSION.planEn)}</p>
        </>
      )}
      <p className="planner-hint">
        {pick
          ? pick === 'stop'
            ? t('Кликните по планете, чтобы добавить промежуточную остановку.', 'Click the planet to add an intermediate stop.')
            : t(
                `Кликните по планете, чтобы поставить точку ${pick === 'a' ? 'A' : 'Б'}, или введите координаты.`,
                `Click the planet to place point ${pick === 'a' ? 'A' : 'B'}, or enter coordinates.`,
              )
          : t('Чтобы переставить точку, нажмите «Выбрать» рядом с ней.', 'To move a point, press "Pick" next to it.')}
      </p>

      {(['a', 'b'] as Endpoint[]).map((which) => (
        <div key={which} className={`endpoint endpoint-${which}${pick === which ? ' picking' : ''}`}>
          <div className="endpoint-head">
            <span className="endpoint-badge">{which === 'a' ? 'A' : t('Б', 'B')}</span>
            <span className="endpoint-name">{which === 'a' ? t('Старт', 'Start') : t('Цель', 'Target')}</span>
            <button type="button" className="link-button" onClick={() => setPick(pick === which ? null : which)}>
              {pick === which ? t('Отмена', 'Cancel') : t('Выбрать', 'Pick')}
            </button>
          </div>
          <CoordinateFields value={endpoints[which]} onChange={(point) => placeEndpoint(which, point)} />
          {endpoints[which] && terrain.status === 'ready' && (
            <span className="endpoint-height">
              {t('Высота MOLA', 'MOLA elevation')}{' '}
              {Math.round(terrain.field.sample(endpoints[which]!.lon, endpoints[which]!.lat)).toLocaleString(locale())} {t('м', 'm')}
            </span>
          )}
        </div>
      ))}

      <div className="stops-block">
        <h2 className="planner-subtitle">{t('Остановки', 'Stops')}</h2>
        {stops.length === 0 && (
          <p className="planner-note">
            {t('Между A и Б можно добавить цели: маршрут пройдёт через них по порядку.', 'You can add targets between A and B: the route will pass through them in order.')}
          </p>
        )}
        <ol className="stops-list">
          {stops.map((stop, index) => (
            <li key={`${index}-${stop.lon}-${stop.lat}`}>
              <span className="stop-number">{index + 1}</span>
              <span className="mono">
                {stop.lat.toFixed(3)}°, {lonEast(stop.lon).toFixed(3)}° {t('в. д.', 'E')}
              </span>
              <button type="button" className="link-button" aria-label={t('Выше', 'Up')} disabled={index === 0} onClick={() => setStops(moveItem(stops, index, -1))}>
                ↑
              </button>
              <button type="button" className="link-button" aria-label={t('Ниже', 'Down')} disabled={index === stops.length - 1} onClick={() => setStops(moveItem(stops, index, 1))}>
                ↓
              </button>
              <button type="button" className="link-button" aria-label={t('Удалить', 'Remove')} onClick={() => setStops(stops.filter((_, i) => i !== index))}>
                ✕
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="ghost-button" onClick={() => setPick(pick === 'stop' ? null : 'stop')}>
          {pick === 'stop' ? t('Отмена', 'Cancel') : t('Добавить точку', 'Add a point')}
        </button>
      </div>

      <div className="planner-actions">
        <button type="button" className="ghost-button" onClick={swap} disabled={!endpoints.a && !endpoints.b}>
          ⇅ {t('Поменять', 'Swap')}
        </button>
        <button type="button" className="ghost-button" onClick={clear} disabled={!endpoints.a && !endpoints.b}>
          {t('Сбросить', 'Reset')}
        </button>
      </div>

      <div className="planner-params">
        <label>
          <span>
            {t('Макс. уклон', 'Max slope')} <strong>{options.maxSlopeDeg}°</strong>
          </span>
          <input
            type="range"
            min={3}
            max={30}
            value={options.maxSlopeDeg}
            onChange={(e) => setBaseOptions({ ...baseOptions, maxSlopeDeg: Number(e.target.value) })}
          />
        </label>
        <div className="day-toggle" role="radiogroup" aria-label={t('Способ расчёта маршрута', 'Route cost model')}>
          {(['distance', 'eva'] as CostModel[]).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={costModel === value}
              className={costModel === value ? 'active' : undefined}
              onClick={() => setCostModel(value)}
            >
              {value === 'distance' ? t('По расстоянию', 'By distance') : t('По расходу выхода', 'By EVA consumption')}
            </button>
          ))}
        </div>
        {hazard && (
          <label className="check-row">
            <input type="checkbox" checked={surfaceFromData} onChange={(e) => setSurfaceFromData(e.target.checked)} />
            <span>{t('Грунт и изрезанность из данных NASA', 'Surface and ruggedness from NASA data')}</span>
          </label>
        )}
        {hazard && !surfaceFromData && (
          <p className="planner-note">
            {t(
              'Грунт задаётся переключателем ниже; запрет по изрезанности остаётся: это безопасность.',
              'Surface is set by the switch below; the ruggedness ban stays on: it is a safety rule.',
            )}
          </p>
        )}
        {covering && (
          <label className="check-row">
            <input type="checkbox" checked={localWanted} onChange={(e) => setLocalWanted(e.target.checked)} />
            <span>
              {t('Детальный рельеф', 'Detailed terrain')}: {pickLang(covering.title, covering.title_en)}
              {manifests.get(covering.id) ? t(` (шаг ${manifests.get(covering.id)!.height.pixel_m} м)`, ` (${manifests.get(covering.id)!.height.pixel_m} m step)`) : ''}
            </span>
          </label>
        )}
        {localError && <p className="warn">{localError}</p>}
        {evaMode && (
          <>
            <p className="planner-note">
              {t(
                'Скорость берётся из модели (V = −0,01·уклон + 0,75 м/с), ползунок скорости не влияет на модельное время.',
                'Speed comes from the model (V = −0.01·slope + 0.75 m/s); the speed slider does not affect model time.',
              )}
            </p>
            <div className="day-toggle" role="radiogroup" aria-label={t('Поверхность', 'Surface')}>
              {(['firm', 'sand'] as TraverseParams['surface'][]).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={traverse.surface === value}
                  className={traverse.surface === value ? 'active' : undefined}
                  onClick={() => setTraverse({ ...traverse, surface: value })}
                >
                  {value === 'firm' ? t('Плотный грунт', 'Firm ground') : t('Песок', 'Sand')}
                </button>
              ))}
            </div>
            <MassField
              label={t('Масса экипажа', 'Crew mass')}
              value={traverse.crewKg}
              range={CREW_RANGE_KG}
              onCommit={(crewKg) => setTraverse({ ...traverse, crewKg })}
            />
            <MassField
              label={t('Масса груза', 'Load mass')}
              value={traverse.loadKg}
              range={LOAD_RANGE_KG}
              onCommit={(loadKg) => setTraverse({ ...traverse, loadKg })}
            />
          </>
        )}
        <label>
          <span>
            {t('Скорость', 'Speed')} <strong>{speedKmh} {t('км/ч', 'km/h')}</strong>
            {evaMode ? t(' · только для оценки «при заданной скорости»', ' · only for the "at set speed" estimate') : ''}
          </span>
          <input type="range" min={1} max={20} value={speedKmh} onChange={(e) => setSpeedKmh(Number(e.target.value))} />
        </label>
      </div>

      <div className="planner-result" aria-live="polite">
        {terrain.status === 'loading' && <p className="dim">{t('Загрузка карты высот…', 'Loading the height map…')}</p>}
        {terrain.status === 'failed' && (
          <p className="warn">
            {t('Маршрут по рельефу построить нельзя', 'Cannot plan a route over the terrain')}:{' '}
            {terrain.message ?? t('карта высот недоступна', 'height map unavailable')}{' '}
            <button type="button" className="link-button" onClick={() => window.location.reload()}>
              {t('Перезагрузить страницу', 'Reload the page')}
            </button>
          </p>
        )}
        {busy && <p className="dim">{t('Расчёт маршрута…', 'Computing the route…')}</p>}
        {!busy && failedLeg !== null && (
          <p className="warn">
            {t(
              `Нога ${failedLeg + 1} непроходима: между соседними точками нет пути с такими ограничениями. На экране остаётся предыдущий маршрут; измените остановки или увеличьте допустимый уклон.`,
              `Leg ${failedLeg + 1} is impassable: there is no path between these points under the current limits. The previous route stays on screen; change the stops or raise the allowed slope.`,
            )}
          </p>
        )}
        {!busy && route?.status === 'unreachable' && (
          <p className="warn">
            {t(
              `Путь с уклоном не круче ${options.maxSlopeDeg}° не найден (по прямой ${formatKm(route.greatCircleM)}). Увеличьте допустимый уклон.`,
              `No path with slopes up to ${options.maxSlopeDeg}° was found (straight line ${formatKm(route.greatCircleM)}). Raise the allowed slope.`,
            )}
          </p>
        )}
        {!busy && route?.status === 'invalid' && <p className="warn">{routeReasonText(route.reason)}</p>}
        {!busy && route?.status === 'ok' && (
          <>
            <dl className="route-stats">
              <div>
                <dt>{t('Длина пути', 'Path length')}</dt>
                <dd>{formatKm(route.lengthM)}</dd>
              </div>
              <div>
                <dt>{t('По прямой', 'Straight line')}</dt>
                <dd>{formatKm(straight ?? route.greatCircleM)}</dd>
              </div>
              <div>
                <dt>{t('Подъём / спуск', 'Ascent / descent')}</dt>
                <dd>
                  +{Math.round(route.ascentM).toLocaleString(locale())} / −{Math.round(route.descentM).toLocaleString(locale())} {t('м', 'm')}
                </dd>
              </div>
              <div>
                <dt>{t('Макс. уклон', 'Max slope')}</dt>
                <dd>{route.maxSlopeDeg.toFixed(1)}°</dd>
              </div>
              <div className="route-time">
                <dt>{evaMode ? t(`Время при ${speedKmh} км/ч`, `Time at ${speedKmh} km/h`) : t('Время в пути', 'Travel time')}</dt>
                <dd>≈ {formatDuration(route.lengthM / 1000 / speedKmh, dayUnit)}</dd>
                <div className="day-toggle" role="radiogroup" aria-label={t('Единица суток', 'Day unit')}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={dayUnit === 'mars'}
                    className={dayUnit === 'mars' ? 'active' : undefined}
                    onClick={() => setDayUnit('mars')}
                  >
                    {t('Солы', 'Sols')}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={dayUnit === 'earth'}
                    className={dayUnit === 'earth' ? 'active' : undefined}
                    onClick={() => setDayUnit('earth')}
                  >
                    {t('Земные сутки', 'Earth days')}
                  </button>
                </div>
                <span className="day-note">
                  {dayUnit === 'mars'
                    ? t(
                        `= ${formatDuration(route.lengthM / 1000 / speedKmh, 'earth')} по-земному · 1 сол = 24 ч 39 мин 35 с`,
                        `= ${formatDuration(route.lengthM / 1000 / speedKmh, 'earth')} in Earth time · 1 sol = 24 h 39 min 35 s`,
                      )
                    : t(
                        `= ${formatDuration(route.lengthM / 1000 / speedKmh, 'mars')} · 1 сол = 24 ч 39 мин 35 с`,
                        `= ${formatDuration(route.lengthM / 1000 / speedKmh, 'mars')} · 1 sol = 24 h 39 min 35 s`,
                      )}
                </span>
              </div>
              {route.eva && (
                <>
                  <div>
                    <dt>{t('Время по модели', 'Model time')}</dt>
                    <dd>≈ {formatModelTime(route.eva.seconds)}</dd>
                    <span className="day-note">
                      {t(
                        `Не то же, что «время при ${speedKmh} км/ч»: здесь скорость зависит от уклона каждого участка.`,
                        `Not the same as "time at ${speedKmh} km/h": here speed depends on the slope of each segment.`,
                      )}
                    </span>
                  </div>
                  <div>
                    <dt>{t('Кислород', 'Oxygen')}</dt>
                    <dd className="eva-corridor">{formatOxygenCorridor(route.eva.o2LowL, route.eva.o2HighL)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>{t('Данные рельефа', 'Terrain data')}</dt>
                <dd className={`data-level data-level-${formatDataLevel(route.dataLevel).tone}`}>{formatDataLevel(route.dataLevel).label}</dd>
                {multi && multi.stopIndices.length > 0 && <span className="day-note">{formatStopsCount(multi.stopIndices.length)}</span>}
              </div>
              <div>
                <dt>{t('Высоты', 'Elevations')}</dt>
                <dd>
                  {Math.round(route.minHeightM).toLocaleString(locale())}…{Math.round(route.maxHeightM).toLocaleString(locale())} {t('м', 'm')}
                </dd>
              </div>
            </dl>
            {route.hazard && (
              <div className="hazard-summary">
                {route.hazard.surfaceFromData && (
                  <>
                    <p>{formatSand(route.hazard.sandM)}</p>
                    <p className="planner-note">
                      {t(
                        'грунт по тепловой инерции TES — трактовка измерения, не доля камней',
                        'surface from TES thermal inertia: an interpretation of the measurement, not a rock fraction',
                      )}
                      {route.eva?.surface === 'per_cell'
                        ? t('. Расход уже посчитан по грунту каждой ячейки', '. Consumption is already computed from the surface of each cell')
                        : ''}
                      {hazardRetrieved
                        ? t(
                            `. Слои выгружены из архивов NASA ${hazardRetrieved}`,
                            `. Layers exported from NASA archives on ${hazardRetrieved}`,
                          )
                        : ''}
                    </p>
                  </>
                )}
                {route.hazard.surfaceFromData && formatUnknownSurface(route.hazard.unknownSurfaceM) && (
                  <p>{formatUnknownSurface(route.hazard.unknownSurfaceM)}</p>
                )}
                {formatBlockedCells(route.hazard.blockedByRuggedness, route.hazard.maxRuggedSlopeDeg) && (
                  <>
                    <p>{formatBlockedCells(route.hazard.blockedByRuggedness, route.hazard.maxRuggedSlopeDeg)}</p>
                    <p className="planner-note">{t('уклон на масштабе 200 м (MOLA+HRSC), а не под ногами', 'slope at a 200 m scale (MOLA+HRSC), not underfoot')}</p>
                  </>
                )}
              </div>
            )}
            {walkSiteId ? (
              <button type="button" className="ghost-button walk-it" onClick={() => walkIt()}>
                {t('Пройти от первого лица', 'Walk it in first person')}
              </button>
            ) : (
              <>
                <button type="button" className="ghost-button walk-it" onClick={() => walkIt('overview')}>
                  {t('Пройти от первого лица (обзорный режим)', 'Walk it in first person (overview mode)')}
                </button>
                <p className="planner-note">
                  {t(
                    'Здесь нет подробного рельефа: сцена строится по MOLA (~7 км) и снимку CTX. Мелкие склоны и камни не видны, это не проверенная тропа. Подробный рельеф — в Гейле, Ares 3 и Езеро.',
                    'No detailed terrain here: the scene uses MOLA (~7 km) and a CTX image. Small slopes and rocks are not visible; this is not a checked path. Detailed terrain exists at Gale, Ares 3 and Jezero.',
                  )}
                </p>
              </>
            )}
            <h2 className="planner-subtitle">{t('Профиль высот', 'Elevation profile')}</h2>
            <ElevationProfile
              points={route.points}
              onHover={(index) => engine.setProbe(index == null ? null : route.points[index])}
            />
            <p className="planner-note">
              {dataLevelNote(route.dataLevel, localSite ? (manifests.get(localSite)?.height.pixel_m ?? null) : null, options.maxSlopeDeg)}
              {routeMs != null ? t(` Расчёт ${Math.round(routeMs)} мс.`, ` Computed in ${Math.round(routeMs)} ms.`) : ''}{' '}
              {t('Это направление, а не проверенная тропа.', 'This is a direction, not a verified trail.')}{' '}
              {route.eva
                ? t(
                    `«Время при ${speedKmh} км/ч» — простая симуляция без остановок; «Время по модели» считает скорость по уклону (V = −0,01·уклон + 0,75 м/с) и от ползунка не зависит.`,
                    `"Time at ${speedKmh} km/h" is a simple simulation without stops; "Model time" derives speed from slope (V = −0.01·slope + 0.75 m/s) and does not depend on the slider.`,
                  )
                : t(`Время рассчитано для ${speedKmh} км/ч без остановок.`, `Time computed for ${speedKmh} km/h without stops.`)}
            </p>
            {route.eva && (
              <>
                {outsideModelWarning(route.eva.outsideModelSegments) && (
                  <p className="warn">{outsideModelWarning(route.eva.outsideModelSegments)}</p>
                )}
                <p className="planner-note">{evaProvenance()}</p>
              </>
            )}
            <EvaPanel
              profile={route.points}
              {...(route.eva
                ? {
                    ...(route.eva.surface !== 'per_cell' ? { surface: route.eva.surface } : {}),
                    crewKg: route.eva.crewKg,
                    loadKg: route.eva.loadKg,
                  }
                : {})}
            />
          </>
        )}
      </div>

      {route?.status === 'ok' && roverModel && globe.setRoverTag && (
        <RoverCard globe={globe} points={route.points} model={roverModel} />
      )}
      {route?.status === 'ok' && <SurfacePhotos points={route.points} />}

      <ResearchAlongRoute
        endpoints={endpoints}
        route={route}
        onAddStop={addStop}
        onFocus={(point) => void globe.flyTo({ lon: point.lon, lat: point.lat, altitude: 0.05 }, 1200)}
      />
    </div>
  );
}
