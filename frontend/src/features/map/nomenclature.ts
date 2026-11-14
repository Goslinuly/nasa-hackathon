// Названия IAU для атласа: загрузка каталога, конверсия долготы и отбор подписей по зуму без наложений.
import { signedLongitudeDelta } from '@/shared/coordinates/mars';

export const NOMENCLATURE_URL = '/data/nomenclature/mars.json';
export const MAX_LABELS = 60;
export const MIN_DIAMETER_PX = 30;
export const MAX_DIAMETER_PX = 3000;
export const POINT_MAX_KM_PER_PIXEL = 5;
export const KM_PER_DEGREE = Math.PI * 3389.5 / 180;

export interface NamedFeature { name: string; lat: number; lon: number; d_km: number; type: string }
export interface Nomenclature { credit: string; features: NamedFeature[] }
export interface PlacedLabel { name: string; x: number; y: number; major: boolean }

export function eastToSigned(lon: number) {
  return lon > 180 ? lon - 360 : lon;
}

export function kmPerPixel(pixelsPerDegree: number) {
  return KM_PER_DEGREE / pixelsPerDegree;
}

export function isLabelVisible(diameterKm: number, pixelsPerDegree: number) {
  if (diameterKm <= 0) return kmPerPixel(pixelsPerDegree) < POINT_MAX_KM_PER_PIXEL;
  const pixels = diameterKm / kmPerPixel(pixelsPerDegree);
  return pixels >= MIN_DIAMETER_PX && pixels <= MAX_DIAMETER_PX;
}

export function isMajorForm(feature: NamedFeature) {
  return feature.d_km > 500 && /^(Terra|Planitia|Vallis|Mons|Planum|Chasma)/.test(feature.type);
}

export function parseNomenclature(raw: unknown): Nomenclature {
  const data = raw as { credit?: unknown; features?: unknown };
  if (typeof data?.credit !== 'string' || !Array.isArray(data.features)) throw new Error('mars.json: неверная форма');
  const features = data.features.filter((f): f is NamedFeature => typeof f?.name === 'string' && Number.isFinite(f.lat) && Number.isFinite(f.lon)
    && Number.isFinite(f.d_km) && typeof f.type === 'string').map(f => ({ ...f, lon: eastToSigned(f.lon) }));
  return { credit: data.credit, features };
}

export async function loadNomenclature(): Promise<Nomenclature> {
  const response = await fetch(NOMENCLATURE_URL);
  if (!response.ok) throw new Error(`mars.json: HTTP ${response.status}`);
  return parseNomenclature(await response.json());
}

const LABEL_HEIGHT = 14;
const labelWidth = (text: string) => text.length * 7 + 8;

export function selectLabels(features: NamedFeature[], view: { centerLon: number; centerLat: number; pixelsPerDegree: number; width: number; height: number }, limit = MAX_LABELS): PlacedLabel[] {
  const { centerLon, centerLat, pixelsPerDegree: ppd, width, height } = view;
  const candidates = features.filter(f => isLabelVisible(f.d_km, ppd)).sort((a, b) => b.d_km - a.d_km);
  const placed: PlacedLabel[] = [];
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const f of candidates) {
    if (placed.length >= limit) break;
    const x = width / 2 + signedLongitudeDelta(centerLon, f.lon) * ppd;
    const y = height / 2 + (centerLat - f.lat) * ppd;
    const major = isMajorForm(f);
    const text = major ? f.name.toUpperCase() : f.name;
    const w = labelWidth(text);
    const box = { x0: x - w / 2, y0: y - LABEL_HEIGHT / 2, x1: x + w / 2, y1: y + LABEL_HEIGHT / 2 };
    if (box.x1 < 0 || box.x0 > width || box.y1 < 0 || box.y0 > height) continue;
    if (boxes.some(b => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
    boxes.push(box);
    placed.push({ name: text, x, y, major });
  }
  return placed;
}
