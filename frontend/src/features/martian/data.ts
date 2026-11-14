// Данные режима «Маршрут „Марсианина“»: типы route.json и расчёты для профиля высот.
import type { GlobeLine, GlobeMarker } from '@/app/modeContract';

export interface RouteImage {
  title: string;
  url: string;
}

export interface RouteStop {
  id: string;
  name: string;
  place: string;
  lat: number;
  lon: number;
  novel: string;
  images: RouteImage[];
  coord_source: string;
  /** Расстояние от Ares 3 по маршруту, км; null у боковой поездки. */
  route_km: number | null;
  elevation_m: number;
  side_trip?: boolean;
  side_trip_km?: number;
  walk_site?: string;
}

export interface RouteFile {
  fetched_utc: string;
  title: string;
  note: string;
  geometry_note: string;
  hirise_remark: { text: string; ru: string; author: string; url: string };
  stops: RouteStop[];
  /** [lon, lat] */
  line: [number, number][];
  side_trip_line: [number, number][];
  profile: {
    columns: ['distance_km', 'height_m'];
    /** [distance_km, height_m] */
    points: [number, number][];
    step_km: number;
    total_km: number;
    min_m: number;
    max_m: number;
    source: string;
    source_url: string;
    credit: string;
  };
  sources: string[];
}

export const ROUTE_URL = '/data/martian/route.json';
export const ROUTE_COLOR = '#ff7a4d';

export async function loadRoute(signal?: AbortSignal): Promise<RouteFile> {
  const response = await fetch(ROUTE_URL, { signal });
  if (!response.ok) throw new Error(`Не удалось загрузить маршрут: ${response.status}`);
  return (await response.json()) as RouteFile;
}

export function routeLines(route: RouteFile): GlobeLine[] {
  return [
    { points: route.line.map(([lon, lat]) => ({ lon, lat })), color: ROUTE_COLOR, width: 3 },
    {
      points: route.side_trip_line.map(([lon, lat]) => ({ lon, lat })),
      color: ROUTE_COLOR,
      width: 2,
      dashed: true,
    },
  ];
}

export function stopMarkers(route: RouteFile): GlobeMarker[] {
  return route.stops.map(stop => ({
    id: stop.id,
    lon: stop.lon,
    lat: stop.lat,
    label: stop.name,
    kind: 'site',
    color: ROUTE_COLOR,
  }));
}

/** Остановки основного пути по порядку (без боковой поездки к Pathfinder). */
export function mainStops(route: RouteFile): RouteStop[] {
  return route.stops.filter(stop => !stop.side_trip);
}

export interface ProfileGeometry {
  width: number;
  height: number;
  path: string;
  area: string;
  x(km: number): number;
  y(m: number): number;
  yTicks: number[];
  xTicks: number[];
}

function niceStep(range: number, target: number): number {
  const raw = range / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit >= 5 ? 10 : unit >= 2 ? 5 : unit >= 1 ? 2 : 1) * power;
}

export function niceTicks(min: number, max: number, target: number): number[] {
  if (!(max > min)) return [min];
  const step = niceStep(max - min, target);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** Геометрия SVG-профиля: пути линии и заливки в координатах прямоугольника width×height. */
export function profileGeometry(
  points: [number, number][],
  width: number,
  height: number,
  pad = { top: 8, right: 8, bottom: 22, left: 44 },
): ProfileGeometry {
  const totalKm = points.length ? points[points.length - 1][0] : 1;
  const heights = points.map(p => p[1]);
  const yTicks = niceTicks(Math.min(...heights), Math.max(...heights), 4);
  const lo = Math.min(yTicks[0], ...heights);
  const hi = Math.max(yTicks[yTicks.length - 1], ...heights);
  const x = (km: number) => pad.left + (km / (totalKm || 1)) * (width - pad.left - pad.right);
  const y = (m: number) => pad.top + (1 - (m - lo) / (hi - lo || 1)) * (height - pad.top - pad.bottom);
  const path = points.map(([km, m], i) => `${i ? 'L' : 'M'}${x(km).toFixed(1)},${y(m).toFixed(1)}`).join('');
  const base = height - pad.bottom;
  const area = points.length ? `${path}L${x(totalKm).toFixed(1)},${base}L${x(0).toFixed(1)},${base}Z` : '';
  return { width, height, path, area, x, y, yTicks, xTicks: niceTicks(0, totalKm, 4) };
}

/** Индекс ближайшей точки профиля по расстоянию, км. */
export function nearestProfileIndex(points: [number, number][], km: number): number {
  let best = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (Math.abs(points[i][0] - km) < Math.abs(points[best][0] - km)) best = i;
  }
  return best;
}
