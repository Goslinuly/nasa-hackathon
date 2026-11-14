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

export type SpectrumId =
  | 'natural'
  | 'hypsometry'
  | 'shade'
  | 'themis-day'
  | 'themis-night'
  | 'tes-albedo'
  | 'tes-dust'
  | 'tes-inertia'
  | 'tes-pyroxene'
  | 'tes-plagioclase'
  | 'tes-silicates';

export interface Legend {
  gradient: string;
  low: string;
  high: string;
  quantity: string;
}

export interface SpectrumLayer {
  id: SpectrumId;
  title: string;
  kind: string;
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
    kind: 'оптический',
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
    kind: 'топографический',
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
    kind: 'топографический',
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
    kind: 'тепловой',
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
    kind: 'тепловой',
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
  'tes-albedo': {
    id: 'tes-albedo',
    title: 'Альбедо',
    kind: 'спектральный',
    description:
      'Альбедо поверхности по видимому и ближнему ИК каналу (0.3–2.9 мкм) спектрометра TES, MGS. Исходная карта около 7.4 км/пикс, в тайлах Trek доступна грубее. Светлые области — пыль, тёмные — открытая порода и песок.',
    color: trek('Mars_MGS_TES_Albedo_mosaic_global_7410m', 'png', 1),
    fallback: 'natural',
    maxNativeZoom: 1,
    nativeResolutionM: 20800,
    coverage: 'вся планета, обзорный масштаб',
    credit: 'NASA/GSFC — MGS TES, Global Surface Albedo mosaic, Mars Trek',
    legend: {
      gradient: 'linear-gradient(90deg, #222, #eee)',
      low: 'темнее',
      high: 'светлее',
      quantity: 'Относительное отражение (альбедо), оттенок серого',
    },
  },
  'tes-dust': {
    id: 'tes-dust',
    title: 'Пыль',
    kind: 'пылевой покров',
    description:
      'Индекс пылевого покрова TES (Ruff, Christensen 2002): мера того, насколько пыль скрывает спектр поверхности. Исходный шаг 16 пикс/° (около 3.5 км), тайлы Trek грубее. Это индекс по тепловому ИК, а не толщина слоя пыли и не пыль в воздухе.',
    color: trek('tes_ruffdust', 'png', 2),
    fallback: 'natural',
    maxNativeZoom: 2,
    nativeResolutionM: 10400,
    coverage: 'преимущественно низкие и средние широты',
    credit: 'NASA/GSFC — MGS TES dust cover index (Ruff, Christensen 2002), Mars Trek',
    legend: {
      gradient: 'linear-gradient(90deg, #2a4cff, #20c8d0, #5adc50, #f0e040, #f07a20, #e02020)',
      low: 'меньше пыли',
      high: 'больше пыли',
      quantity: 'Индекс пылевого покрова, безразмерный; числовая шкала в тайлах не передана',
    },
  },
  'tes-inertia': {
    id: 'tes-inertia',
    title: 'Инерция',
    kind: 'термофизический',
    description:
      'Тепловая инерция поверхности по TES (Putzig и др. 2005), около 3 км исходно, в тайлах Trek грубее. Показывает, как быстро грунт греется и остывает: низкая у пыли, высокая у камня и скал. Выводится из температур поверхности, а не измеряется напрямую.',
    color: trek('TES_Thermal_Inertia', 'png', 1),
    fallback: 'natural',
    maxNativeZoom: 1,
    nativeResolutionM: 20800,
    coverage: 'преимущественно низкие и средние широты',
    credit: 'NASA/GSFC — MGS TES thermal inertia (Putzig и др. 2005), Mars Trek',
    legend: {
      gradient: 'linear-gradient(90deg, #6a1ee0, #2a5be0, #20c8d0, #5adc50, #f0e040)',
      low: 'пыль, песок',
      high: 'камень, скалы',
      quantity: 'Тепловая инерция, Дж·м⁻²·К⁻¹·с⁻¹ᐟ²; числовая шкала в тайлах не передана',
    },
  },
  'tes-pyroxene': {
    id: 'tes-pyroxene',
    title: 'Пироксен',
    kind: 'химический (минералы)',
    description:
      'Доля высококальциевого пироксена по спектрам TES (Bandfield 2002), 4 пикс/° (около 16 км). Деконволюция спектров даёт долю минерала в поверхности: 0.1–0.2 в тёмных областях низких широт, ниже предела обнаружения на светлых.',
    color: trek('TES_Clinopyroxene', 'png', 1),
    fallback: 'natural',
    maxNativeZoom: 1,
    nativeResolutionM: 20800,
    coverage: 'тёмные области низких и средних широт; на светлых ниже порога обнаружения',
    credit: 'NASA/GSFC — MGS TES mineralogy (Bandfield 2002), Mars Trek',
    legend: {
      gradient: 'linear-gradient(90deg, #4b10c8, #2a5be0, #20c8d0, #5adc50, #e02020)',
      low: '0',
      high: '≈ 0.2',
      quantity: 'Доля минерала в поверхностном слое (безразмерная)',
    },
  },
  'tes-plagioclase': {
    id: 'tes-plagioclase',
    title: 'Плагиоклаз',
    kind: 'химический (минералы)',
    description:
      'Доля плагиоклаза по спектрам TES (Bandfield 2002), 4 пикс/° (около 16 км). Заметна в тёмных областях, максимум в районе Большого Сырта; на светлых поверхностях ниже порога обнаружения.',
    color: trek('TES_Plagioclase', 'png', 1),
    fallback: 'natural',
    maxNativeZoom: 1,
    nativeResolutionM: 20800,
    coverage: 'тёмные области низких и средних широт; на светлых ниже порога обнаружения',
    credit: 'NASA/GSFC — MGS TES mineralogy (Bandfield 2002), Mars Trek',
    legend: {
      gradient: 'linear-gradient(90deg, #4b10c8, #2a5be0, #20c8d0, #5adc50, #f0e040, #e02020)',
      low: '0',
      high: '≈ 0.2',
      quantity: 'Доля минерала в поверхностном слое (безразмерная)',
    },
  },
  'tes-silicates': {
    id: 'tes-silicates',
    title: 'Силикаты',
    kind: 'химический (минералы)',
    description:
      'Доля слоистых силикатов и высококремнистого стекла по спектрам TES (Bandfield 2002), 4 пикс/° (около 16 км). Карта шумнее остальных: спектр этих минералов похож на пыль в атмосфере. Это группа минералов, а не измерение элементов.',
    color: trek('TES_Glass_Clay', 'png', 1),
    fallback: 'natural',
    maxNativeZoom: 1,
    nativeResolutionM: 20800,
    coverage: 'преимущественно низкие и средние широты; значения шумные',
    credit: 'NASA/GSFC — MGS TES mineralogy (Bandfield 2002), Mars Trek',
    legend: {
      gradient: 'linear-gradient(90deg, #4b10c8, #2a5be0, #20c8d0, #5adc50, #f0e040, #e02020)',
      low: '0',
      high: '≈ 0.2',
      quantity: 'Доля группы минералов в поверхностном слое (безразмерная)',
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
