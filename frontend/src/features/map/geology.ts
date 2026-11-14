// Геологическая подложка атласа: растр SIM 3292 в равнопромежуточной проекции, разбор legend.json и привязка координат к пикселям.
export const GEOLOGY_IMAGE_URL = '/data/geology/mars_geology_sim3292.png';
export const GEOLOGY_LEGEND_URL = '/data/geology/legend.json';
export const GEOLOGY_DEFAULT_OPACITY = 0.7;

export interface GeologyExtent { lon_min: number; lon_max: number; lat_min: number; lat_max: number }
export interface GeologyUnit { unit: string; label: string; color: [number, number, number] }
export interface GeologyLegend {
  title: string; credit: string; source: string; retrieved: string; status: string; extent: GeologyExtent; units: GeologyUnit[];
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function parseGeologyLegend(raw: unknown): GeologyLegend {
  if (!isRecord(raw)) throw new Error('legend.json: ожидался объект');
  for (const key of ['title', 'credit', 'source', 'retrieved', 'status']) {
    if (!isText(raw[key])) throw new Error(`legend.json: нет поля ${key}`);
  }
  const extent = raw.extent;
  if (!isRecord(extent)) throw new Error('legend.json: нет extent');
  const [lonMin, lonMax, latMin, latMax] = ['lon_min', 'lon_max', 'lat_min', 'lat_max'].map(key => extent[key]);
  if (![lonMin, lonMax, latMin, latMax].every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error('legend.json: extent должен быть числовым');
  if ((lonMin as number) >= (lonMax as number) || (latMin as number) >= (latMax as number)) throw new Error('legend.json: пустой extent');
  if (!Array.isArray(raw.units) || raw.units.length === 0) throw new Error('legend.json: нет units');
  const units = raw.units.map((item: unknown, index: number): GeologyUnit => {
    if (!isRecord(item) || !isText(item.unit) || !isText(item.label)) throw new Error(`legend.json: некорректный юнит #${index}`);
    const color = item.color;
    if (!Array.isArray(color) || color.length !== 3 || !color.every(c => Number.isInteger(c) && c >= 0 && c <= 255)) throw new Error(`legend.json: некорректный цвет юнита ${item.unit}`);
    return { unit: item.unit, label: item.label, color: [color[0], color[1], color[2]] };
  });
  return {
    title: raw.title as string, credit: raw.credit as string, source: raw.source as string, retrieved: raw.retrieved as string,
    status: raw.status as string,
    extent: { lon_min: lonMin as number, lon_max: lonMax as number, lat_min: latMin as number, lat_max: latMax as number }, units,
  };
}

export async function loadGeologyLegend(): Promise<GeologyLegend> {
  const response = await fetch(GEOLOGY_LEGEND_URL);
  if (!response.ok) throw new Error(`legend.json: HTTP ${response.status}`);
  return parseGeologyLegend(await response.json());
}

export function geologyPixel(lon: number, lat: number, extent: GeologyExtent, width: number, height: number) {
  const x = (lon - extent.lon_min) / (extent.lon_max - extent.lon_min) * width;
  const y = (extent.lat_max - lat) / (extent.lat_max - extent.lat_min) * height;
  return { x, y, inside: x >= 0 && x < width && y >= 0 && y < height };
}

export function geologyBackground(extent: GeologyExtent, centerLon: number, centerLat: number, pixelsPerDegree: number, viewWidth: number, viewHeight: number) {
  const width = (extent.lon_max - extent.lon_min) * pixelsPerDegree;
  const height = (extent.lat_max - extent.lat_min) * pixelsPerDegree;
  const left = viewWidth / 2 + (extent.lon_min - centerLon) * pixelsPerDegree;
  const top = viewHeight / 2 + (centerLat - extent.lat_max) * pixelsPerDegree;
  return { width, height, left, top, wrapsLongitude: extent.lon_max - extent.lon_min >= 360 };
}
