// Регион и геологический юнит под точкой: газеттир IAU USGS и растр SIM 3292, расчёт в браузере.
import { GEOLOGY_IMAGE_URL, geologyPixel, loadGeologyLegend, type GeologyLegend } from '@/features/map/geology';
import { getLang } from '@/shared/i18n/lang';

export interface NamedRegion {
  name: string;
  type: string;
  lat: number;
  lon: number;
  dKm: number;
  distanceKm: number;
}

export interface RegionInfo {
  specific: NamedRegion | null;
  province: NamedRegion | null;
  geology: { unit: string; label: string } | null;
}

interface GazetteerFeature {
  name: string;
  lat: number;
  lon: number;
  d_km: number;
  type: string;
}

const MARS_RADIUS_KM = 3389.5;
const DEG = Math.PI / 180;
const PROVINCE_MIN_D_KM = 1200;

function distanceKm(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const dLat = (bLat - aLat) * DEG;
  const dLon = (bLon - aLon) * DEG;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * MARS_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

let gazetteer: Promise<GazetteerFeature[]> | null = null;

function loadGazetteer(): Promise<GazetteerFeature[]> {
  if (!gazetteer) {
    gazetteer = fetch('/data/nomenclature/mars.json')
      .then((r) => (r.ok ? r.json() : { features: [] }))
      .then((d: { features?: GazetteerFeature[] }) =>
        (d.features ?? []).filter((f) => Number.isFinite(f.d_km) && f.d_km > 0),
      )
      .catch(() => []);
  }
  return gazetteer;
}

/** Именованные структуры газеттира, внутри которых лежит точка; от мелкой к крупной. */
export function containingRegions(features: GazetteerFeature[], lon: number, lat: number): NamedRegion[] {
  const hits: NamedRegion[] = [];
  for (const f of features) {
    const d = distanceKm(lon, lat, f.lon, f.lat);
    if (d <= f.d_km / 2) hits.push({ name: f.name, type: f.type, lat: f.lat, lon: f.lon, dKm: f.d_km, distanceKm: d });
  }
  return hits.sort((a, b) => a.dKm - b.dKm);
}

interface GeologySampler {
  legend: GeologyLegend;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}

let sampler: Promise<GeologySampler | null> | null = null;

function loadSampler(): Promise<GeologySampler | null> {
  if (!sampler) {
    sampler = (async () => {
      try {
        const [legend, blob] = await Promise.all([
          loadGeologyLegend(),
          fetch(GEOLOGY_IMAGE_URL).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status))))),
        ]);
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        return { legend, ctx, width: canvas.width, height: canvas.height };
      } catch {
        return null;
      }
    })();
  }
  return sampler;
}

export function matchUnit(legend: GeologyLegend, r: number, g: number, b: number): { unit: string; label: string } | null {
  let best: { unit: string; label: string } | null = null;
  let bestD = 20 * 20 * 3;
  for (const u of legend.units) {
    const d = (u.color[0] - r) ** 2 + (u.color[1] - g) ** 2 + (u.color[2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { unit: u.unit, label: u.label };
    }
  }
  return best;
}

function sampleUnit(geo: GeologySampler, lon: number, lat: number): RegionInfo['geology'] {
  const east = ((lon % 360) + 360) % 360;
  const signed = east > 180 ? east - 360 : east;
  const px = geologyPixel(signed, lat, geo.legend.extent, geo.width, geo.height);
  if (!px.inside) return null;
  const data = geo.ctx.getImageData(Math.floor(px.x), Math.floor(px.y), 1, 1).data;
  return data[3] > 0 ? matchUnit(geo.legend, data[0], data[1], data[2]) : null;
}

/** Регион IAU и геологический юнит под точкой; долгота в любом соглашении. */
export async function regionAt(lon: number, lat: number): Promise<RegionInfo> {
  const east = ((lon % 360) + 360) % 360;
  const [features, geo] = await Promise.all([loadGazetteer(), loadSampler()]);
  const hits = containingRegions(features, east, lat);
  const specific = hits[0] ?? null;
  let province: NamedRegion | null = null;
  for (const h of hits) {
    if (h.dKm >= PROVINCE_MIN_D_KM && h.name !== specific?.name) province = h;
  }
  return { specific, province, geology: geo ? sampleUnit(geo, east, lat) : null };
}

/** Геологический юнит под каждой точкой ломаной; null там, где растр ничего не даёт. */
export async function geologyAlong(
  points: { lon: number; lat: number }[],
): Promise<(RegionInfo['geology'])[]> {
  const geo = await loadSampler();
  if (!geo) return points.map(() => null);
  return points.map((point) => sampleUnit(geo, point.lon, point.lat));
}

const TYPE_RU: Record<string, string> = {
  'Mons, montes': 'гора',
  'Crater, craters': 'кратер',
  'Planitia, planitiae': 'равнина',
  'Planum, plana': 'плато',
  'Vallis, valles': 'долина',
  'Terra, terrae': 'земля',
  'Chasma, chasmata': 'каньон',
  'Fossa, fossae': 'борозды',
  'Tholus, tholi': 'купол',
  'Patera, paterae': 'патера',
  'Labyrinthus, labyrinthi': 'лабиринт',
  'Mensa, mensae': 'столовые горы',
};

const TYPE_EN: Record<string, string> = {
  'Mons, montes': 'mountain',
  'Crater, craters': 'crater',
  'Planitia, planitiae': 'plain',
  'Planum, plana': 'plateau',
  'Vallis, valles': 'valley',
  'Terra, terrae': 'highland',
  'Chasma, chasmata': 'canyon',
  'Fossa, fossae': 'troughs',
  'Tholus, tholi': 'dome',
  'Patera, paterae': 'patera',
  'Labyrinthus, labyrinthi': 'labyrinth',
  'Mensa, mensae': 'mesas',
};

export function regionTypeRu(type: string): string | null {
  return TYPE_RU[type] ?? null;
}

/** Вид объекта газеттира на текущем языке интерфейса. */
export function regionTypeLabel(type: string): string | null {
  return getLang() === 'en' ? (TYPE_EN[type] ?? null) : regionTypeRu(type);
}

/** Именованные структуры, через которые проходит ломаная; от мелких к крупным, без повторов. */
export async function regionsAlong(points: { lon: number; lat: number }[], max = 6): Promise<NamedRegion[]> {
  const features = await loadGazetteer();
  const step = Math.max(1, Math.floor(points.length / 40));
  const seen = new Map<string, NamedRegion>();
  for (let i = 0; i < points.length; i += step) {
    const east = ((points[i].lon % 360) + 360) % 360;
    for (const hit of containingRegions(features, east, points[i].lat)) {
      const known = seen.get(hit.name);
      if (!known || hit.distanceKm < known.distanceKm) seen.set(hit.name, hit);
    }
  }
  return [...seen.values()].sort((a, b) => a.dKm - b.dKm).slice(0, max);
}
