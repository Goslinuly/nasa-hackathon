// Каталог слоёв глобуса: подложки-«спектры» и детальные снимки с разрешением и кредитами.
import { CTX_REGIONS } from './ctxRegions';
import type { TileBounds } from './tiles';

const TREK = '/trek/Mars/EQ';
const TREK_MATRIX = '1.0.0/default/default028mm';

export interface TrekSource {
  path: string;
  ext: 'jpg' | 'png';
  maxZoom: number;
}

function trek(layer: string, ext: 'jpg' | 'png', maxZoom: number): TrekSource {
  return { path: `${TREK}/${layer}/${TREK_MATRIX}`, ext, maxZoom };
}

export function trekTileUrl(source: TrekSource, z: number, x: number, y: number): string {
  return `${source.path}/${z}/${y}/${x}.${source.ext}`;
}

export type SpectrumId = 'natural' | 'hypsometry' | 'shade' | 'themis-day' | 'themis-night';

export interface Legend {
  gradient: string;
  low: string;
  high: string;
  quantity: string;
}

export interface SpectrumLayer {
  id: SpectrumId;
  title: string;
  description: string;
  color: TrekSource;
  shade?: TrekSource;
  fallback?: SpectrumId;
  maxNativeZoom: number;
  nativeResolutionM: number;
  coverage: string;
  credit: string;
  legend?: Legend;
}

const VIKING = trek('Mars_Viking_MDIM21_ClrMosaic_global_232m', 'jpg', 7);
const HRSC_SHADE = trek('Mars_MOLA_blend200ppx_HRSC_Shade_clon0dd_200mpp_lzw', 'jpg', 8);

export const SPECTRA: Record<SpectrumId, SpectrumLayer> = {
  natural: {
    id: 'natural',
    title: 'Видимый',
    description:
      'Естественный цвет Viking MDIM2.1 (232 м) с отмывкой рельефа HRSC + MOLA (200 м).',
    color: VIKING,
    shade: HRSC_SHADE,
    maxNativeZoom: 8,
    nativeResolutionM: 200,
    coverage: 'вся планета',
    credit: 'NASA/JPL/USGS — Viking MDIM2.1; DLR/FU Berlin, NASA/GSFC — HRSC + MOLA',
  },
  hypsometry: {
    id: 'hypsometry',
    title: 'Высоты',
    description: 'Гипсометрическая раскраска по высоте HRSC + MOLA (200 м) с отмывкой.',
    color: trek('Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw', 'jpg', 8),
    maxNativeZoom: 8,
    nativeResolutionM: 200,
    coverage: 'вся планета',
    credit: 'DLR/FU Berlin, NASA/GSFC — HRSC + MOLA blend, Mars Trek',
    legend: {
      gradient: 'linear-gradient(90deg, #2b2ab0, #2f8fd8, #39c46b, #e9e24a, #e0702a, #b33a2a, #f4f4f4)',
      low: '≈ −8 км',
      high: '≈ +21 км',
      quantity: 'Высота над ареоидом',
    },
  },
  shade: {
    id: 'shade',
    title: 'Рельеф',
    description: 'Отмывка рельефа HRSC + MOLA 200 м: свет с северо-запада, без цвета.',
    color: HRSC_SHADE,
    maxNativeZoom: 8,
    nativeResolutionM: 200,
    coverage: 'вся планета',
    credit: 'DLR/FU Berlin, NASA/GSFC — HRSC + MOLA blend, Mars Trek',
  },
  'themis-day': {
    id: 'themis-day',
    title: 'ИК день',
    description:
      'THEMIS дневной ИК (12.6 мкм), 100 м: яркость растёт с температурой поверхности днём. Это яркость снимка, не градусы.',
    color: trek('THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018', 'png', 9),
    fallback: 'natural',
    maxNativeZoom: 9,
    nativeResolutionM: 100,
    coverage: 'широты ±65°; выше — видимый слой',
    credit: 'NASA/JPL/ASU — THEMIS Day IR controlled mosaic v2',
    legend: {
      gradient: 'linear-gradient(90deg, #111, #eee)',
      low: 'холоднее',
      high: 'теплее',
      quantity: 'Относительная яркость ИК, без шкалы °C',
    },
  },
  'themis-night': {
    id: 'themis-night',
    title: 'ИК ночь',
    description:
      'THEMIS ночной ИК, 100 м. Ночью тёплыми остаются камни и скальные выходы с высокой тепловой инерцией, а пыль и песок выглядят тёмными.',
    color: trek('THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018', 'png', 9),
    fallback: 'natural',
    maxNativeZoom: 9,
    nativeResolutionM: 100,
    coverage: 'широты ±65°; выше — видимый слой',
    credit: 'NASA/JPL/ASU — THEMIS Night IR controlled mosaic v2',
    legend: {
      gradient: 'linear-gradient(90deg, #111, #eee)',
      low: 'пыль, песок',
      high: 'камень',
      quantity: 'Относительная яркость ИК ночью, без шкалы °C',
    },
  },
};

export const DEFAULT_SPECTRUM: SpectrumId = 'natural';


export interface OverlayBase {
  id: string;
  title: string;
  nativeResolutionM: number;
  credit: string;
  minViewZoom: number;
}

export interface TrekOverlay extends OverlayBase {
  kind: 'trek';
  source: TrekSource;
  bounds: TileBounds;
}

export interface CtxOverlay extends OverlayBase {
  kind: 'ctx';
  maxZoom: number;
}

export type OverlaySource = TrekOverlay | CtxOverlay;

function hirise(
  id: string,
  title: string,
  layer: string,
  maxZoom: number,
  resolutionM: number,
  [west, south, east, north]: [number, number, number, number],
): TrekOverlay {
  return {
    id,
    title,
    kind: 'trek',
    source: trek(layer, 'png', maxZoom),
    bounds: { west, south, east, north },
    nativeResolutionM: resolutionM,
    credit: 'NASA/JPL/University of Arizona — HiRISE, Mars Trek',
    minViewZoom: 9,
  };
}

export const CTX_OVERLAY: CtxOverlay = {
  id: 'ctx',
  title: 'CTX · 5 м (ч/б)',
  kind: 'ctx',
  maxZoom: 13,
  nativeResolutionM: 5,
  credit: 'NASA/JPL/MSSS/The Murray Lab — Global CTX Mosaic V01',
  minViewZoom: 8,
};

export const HIRISE_OVERLAYS: TrekOverlay[] = [
  hirise('hirise-jezero', 'Езеро', 'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd', 17, 0.25, [77.2229331, 18.3067994, 77.583964, 18.669315]),
  hirise('hirise-gale', 'Гейл', 'curiosity_hirise_mosaic', 16, 0.5, [137.1224669, -4.9254743, 137.7298129, -4.2489588]),
  hirise('hirise-gusev', 'Гусев', 'spirit_hirise_mosaic', 17, 0.25, [175.4278511, -14.6925026, 175.5858031, -14.5357546]),
  hirise('hirise-columbia', 'Columbia Hills', 'HiRISE_ColumbiaHills', 16, 0.5, [175.3183393, -14.847288, 175.7967313, -14.250304]),
  hirise('hirise-meridiani', 'Меридиана', 'opportunity_hirise_mosaic', 17, 0.25, [-5.5964391, -2.7513281, -4.9954112, -1.8994384]),
  hirise('hirise-phoenix', 'Phoenix', 'phoenix_hirise_mosaic', 16, 0.5, [-125.8898226, 68.165978, -125.6607922, 68.2499439]),
];

export const MERCATOR_MAX_LAT = 85.05112878;

export interface CtxRegion {
  name: string;
  bounds: TileBounds;
}

export const CTX_REGION_BOUNDS: CtxRegion[] = CTX_REGIONS.map((name) => {
  const match = /^E(-?\d+)_E-?\d+_N(-?\d+)_N-?\d+$/.exec(name);
  if (!match) throw new Error(`Неизвестное имя региона CTX: ${name}`);
  const west = Number(match[1]);
  const south = Number(match[2]);
  return {
    name,
    bounds: {
      west,
      east: west + 20,
      south: Math.max(south, -MERCATOR_MAX_LAT),
      north: Math.min(south + 16, MERCATOR_MAX_LAT),
    },
  };
});

export function ctxTileUrl(region: string, z: number, x: number, yXyz: number): string {
  const yTms = 2 ** z - 1 - yXyz;
  return `/ctx/${region}/${z}/${x}/${yTms}.png`;
}

export function mercatorRowLat(z: number, y: number): number {
  const n = Math.PI * (1 - (2 * y) / 2 ** z);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

export function mercatorTileBounds(z: number, x: number, y: number): TileBounds {
  const span = 360 / 2 ** z;
  return {
    west: -180 + x * span,
    east: -180 + (x + 1) * span,
    north: mercatorRowLat(z, y),
    south: mercatorRowLat(z, y + 1),
  };
}

export function lonLatToMercatorTile(z: number, lonDeg: number, latDeg: number): { x: number; y: number } {
  const n = 2 ** z;
  const lat = (Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, latDeg)) * Math.PI) / 180;
  const x = Math.floor(((lonDeg + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);
  return { x: Math.min(Math.max(x, 0), n - 1), y: Math.min(Math.max(y, 0), n - 1) };
}

export function boundsIntersect(a: TileBounds, b: TileBounds): boolean {
  return a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south;
}
