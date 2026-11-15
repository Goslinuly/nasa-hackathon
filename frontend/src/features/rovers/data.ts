// Данные режима «Маршруты роверов»: типы файлов из build_rover_layers.py и чистые преобразования.
import type { GlobeMarker, LonLat } from '@/app/modeContract';

export interface TraverseFile {
  fetched_utc: string;
  source_url: string;
  credit: string;
  features: {
    properties: { sols: number[]; sol_first: number; sol_last: number; dist_total_m: number };
    geometry: { type: 'LineString'; coordinates: [number, number][] };
  }[];
}

export interface RoverPosition {
  id: string;
  name: string;
  mission: string;
  sol: number;
  lat: number;
  lon: number;
  elevation_m: number;
  dist_total_m: number;
  source_url: string;
}

export interface HeliFlight {
  flight: number;
  sol: number;
  date: string;
  lat: number;
  lon: number;
  dist_m: number;
  max_alt_m: number;
  duration_s: number;
}

export interface CurrentFile {
  fetched_utc: string;
  credit: string;
  rovers: RoverPosition[];
  ingenuity: {
    id: string;
    name: string;
    mission: string;
    status: string;
    flights_total: number;
    dist_total_m: number;
    flights: HeliFlight[];
    source_url: string;
  };
}

export interface RoversData {
  current: CurrentFile;
  traverses: Record<string, TraverseFile>;
}

/** Какой файл трека у какого ровера. */
export const TRAVERSE_FILES: Record<string, string> = {
  perseverance: '/data/rovers/m20_traverse.geojson',
  curiosity: '/data/rovers/msl_traverse.geojson',
};

export const ROVER_COLORS: Record<string, string> = {
  perseverance: '#7fc8ff',
  curiosity: '#ffb36b',
  ingenuity: '#c9a6ff',
};

export async function loadRoversData(signal?: AbortSignal): Promise<RoversData> {
  const get = async <T,>(url: string): Promise<T> => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Не удалось загрузить ${url}: ${response.status}`);
    return (await response.json()) as T;
  };
  const [current, ...tracks] = await Promise.all([
    get<CurrentFile>('/data/rovers/current.json'),
    ...Object.values(TRAVERSE_FILES).map(url => get<TraverseFile>(url)),
  ]);
  const traverses = Object.fromEntries(Object.keys(TRAVERSE_FILES).map((id, i) => [id, tracks[i]]));
  return { current, traverses };
}

export function traversePoints(file: TraverseFile): LonLat[] {
  return file.features.flatMap(f => f.geometry.coordinates.map(([lon, lat]) => ({ lon, lat })));
}

/** Карточки списка: роверы и вертолёт в одном формате. */
export interface RoverItem {
  id: string;
  name: string;
  mission: string;
  sol: number;
  lat: number;
  lon: number;
  distanceKm: number;
  detail: string;
  sourceUrl: string;
  /** Локальная сцена для прогулки, если есть. */
  walkSite?: string;
}

export function roverItems(current: CurrentFile): RoverItem[] {
  const items: RoverItem[] = current.rovers.map(r => ({
    id: r.id,
    name: r.name,
    mission: r.mission,
    sol: r.sol,
    lat: r.lat,
    lon: r.lon,
    distanceKm: r.dist_total_m / 1000,
    detail: `Высота ${Math.round(r.elevation_m).toLocaleString('ru-RU')} м над ареоидом`,
    sourceUrl: r.source_url,
    walkSite: r.id === 'curiosity' ? 'gale-boxwork' : r.id === 'perseverance' ? 'jezero' : undefined,
  }));
  const heli = current.ingenuity;
  const last = heli.flights[heli.flights.length - 1];
  if (last) {
    items.push({
      id: heli.id,
      name: heli.name,
      mission: heli.mission,
      sol: last.sol,
      lat: last.lat,
      lon: last.lon,
      distanceKm: heli.dist_total_m / 1000,
      detail: `${heli.flights_total} полётов. ${heli.status}.`,
      sourceUrl: heli.source_url,
    });
  }
  return items;
}

export function roverMarkers(items: RoverItem[]): GlobeMarker[] {
  return items.map(item => ({
    id: item.id,
    lon: item.lon,
    lat: item.lat,
    label: `${item.name}, сол ${item.sol}`,
    kind: 'rover',
    color: ROVER_COLORS[item.id],
  }));
}

/** «4.8260° ю. ш., 137.3889° в. д.» — долгота восточная 0–360, как во всём проекте. */
export function formatLatLon(lat: number, lon: number, digits = 4): string {
  const ns = lat >= 0 ? 'с. ш.' : 'ю. ш.';
  return `${Math.abs(lat).toFixed(digits)}° ${ns}, ${(((lon % 360) + 360) % 360).toFixed(digits)}° в. д.`;
}

export function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
