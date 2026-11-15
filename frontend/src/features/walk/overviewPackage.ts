// Обзорный пакет для маршрута в любом месте Марса: рельеф из глобальной сетки MOLA (~7 км),
// снимок из глобальной мозаики CTX. Данные грубые: склоны и камни мельче нескольких
// километров не видны, это не проверенная тропа.

import { makeFrame, MARS_R } from './geo';
import type { HeightGrid } from './heightGrid';
import { decodePng } from './png';
import type { SiteManifest, SitePackage } from './sitePackage';
import type { PlannedWalkRoute, WalkRoutePoint } from '@/shared/walkRoute';

export const OVERVIEW_SITE_ID = 'overview';
/** Наибольшая сторона сетки высот, ячеек. */
export const OVERVIEW_MAX_CELLS = 1024;
/** Мельче этого шаг не делаем: исходная сетка MOLA ~7 км, мельче — пустая интерполяция. */
export const OVERVIEW_MIN_CELL_M = 30;
const ORTHO_MAX_PX = 1024;
const ORTHO_TILES = 2;
const ORTHO_TIMEOUT_MS = 10_000;
const DEG = Math.PI / 180;

export interface LonLatBox {
  /** Долготы в непрерывном диапазоне; центр в −180..180, края могут выйти за ±180. */
  west: number;
  east: number;
  south: number;
  north: number;
}

/** Рамка маршрута с полями (не меньше 2 км и 10 % размера), через шов 0/360 без разрыва. */
export function routeBox(points: WalkRoutePoint[], marginM = 2000): LonLatBox {
  const ref = points[0].lonEast;
  const lons = points.map((p) => ref + ((((p.lonEast - ref) % 360) + 540) % 360) - 180);
  let west = Math.min(...lons);
  let east = Math.max(...lons);
  let south = Math.min(...points.map((p) => p.lat));
  let north = Math.max(...points.map((p) => p.lat));
  const mid = (south + north) / 2;
  const kx = Math.max(0.05, Math.cos(mid * DEG));
  const mLat = Math.max(marginM, (north - south) * DEG * MARS_R * 0.1) / MARS_R / DEG;
  const mLon = Math.max(marginM, (east - west) * DEG * MARS_R * kx * 0.1) / (MARS_R * kx) / DEG;
  west -= mLon;
  east += mLon;
  south = Math.max(-89.9, south - mLat);
  north = Math.min(89.9, north + mLat);
  // Сдвигаем так, чтобы центр лежал в −180..180 (как у lonLatToEqc).
  const c = (west + east) / 2;
  const shift = ((((c + 180) % 360) + 360) % 360) - 180 - c;
  return { west: west + shift, east: east + shift, south, north };
}

/** Размер сетки: шаг = рамка / ячейки, не больше OVERVIEW_MAX_CELLS по стороне и не мельче 30 м. */
export function gridSize(widthM: number, heightM: number): { cell: number; cols: number; rows: number } {
  // Целые метры: шаг виден в подписи данных.
  const cell = Math.max(OVERVIEW_MIN_CELL_M, Math.ceil(Math.max(widthM, heightM) / OVERVIEW_MAX_CELLS));
  return {
    cell,
    cols: Math.max(2, Math.min(OVERVIEW_MAX_CELLS, Math.ceil(widthM / cell))),
    rows: Math.max(2, Math.min(OVERVIEW_MAX_CELLS, Math.ceil(heightM / cell))),
  };
}

export interface MolaGrid {
  width: number;
  height: number;
  ppd: number;
  /** Высоты, м; строки с 90° с. ш., столбцы с 0° в. д. */
  data: Float32Array;
}

export function decodeMola(pixels: ArrayLike<number>, channels: number, width: number, height: number, offset: number, step: number, ppd: number): MolaGrid {
  const data = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    data[i] = (((pixels[i * channels] << 8) | pixels[i * channels + 1]) - offset) * step;
  }
  return { width, height, ppd, data };
}

/** Билинейная высота MOLA в точке; долгота восточная (любая), по долготе сетка замкнута. */
export function sampleMola(g: MolaGrid, lonEast: number, lat: number): number {
  const col = ((((lonEast % 360) + 360) % 360) * g.ppd) - 0.5;
  const row = Math.min(g.height - 1, Math.max(0, (90 - lat) * g.ppd - 0.5));
  const c0 = Math.floor(col);
  const fc = col - c0;
  const r0 = Math.min(Math.floor(row), g.height - 2);
  const fr = row - r0;
  const w = g.width;
  const ca = ((c0 % w) + w) % w;
  const cb = (ca + 1) % w;
  const d = g.data;
  const top = d[r0 * w + ca] * (1 - fc) + d[r0 * w + cb] * fc;
  const bot = d[(r0 + 1) * w + ca] * (1 - fc) + d[(r0 + 1) * w + cb] * fc;
  return top * (1 - fr) + bot * fr;
}

let molaPromise: Promise<MolaGrid> | null = null;
function loadMola(): Promise<MolaGrid> {
  if (!molaPromise) {
    const base = `${import.meta.env.BASE_URL}data/globe/mola_megdr_8ppd_height`;
    molaPromise = (async () => {
      const [meta, buf] = await Promise.all([
        fetch(base + '.json').then((r) => {
          if (!r.ok) throw new Error(`MOLA json ${r.status}`);
          return r.json() as Promise<{ offset_units: number; step_m: number; pixels_per_degree: number }>;
        }),
        fetch(base + '.png').then((r) => {
          if (!r.ok) throw new Error(`MOLA png ${r.status}`);
          return r.arrayBuffer();
        }),
      ]);
      const png = await decodePng(buf);
      return decodeMola(png.data, png.channels, png.width, png.height, meta.offset_units, meta.step_m, meta.pixels_per_degree);
    })();
    molaPromise.catch(() => {
      molaPromise = null;
    });
  }
  return molaPromise;
}

export function ctxWmsUrl(box: LonLatBox, width: number, height: number): string {
  return '/jmars-ctx?' + new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap',
    LAYERS: 'mars_ctx_global_mosaic_v1_m4', STYLES: '', FORMAT: 'image/png',
    SRS: 'JMARS:1,180,90', BBOX: [box.west, box.south, box.east, box.north].join(','),
    WIDTH: String(width), HEIGHT: String(height),
  });
}

async function flatOrtho(): Promise<ImageBitmap> {
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9a7356';
  g.fillRect(0, 0, 4, 4);
  return createImageBitmap(c);
}

/**
 * Снимок CTX: рамка делится на ORTHO_TILES × ORTHO_TILES запросов, они идут параллельно
 * (один большой запрос к WMS отвечает дольше 10 с). Не пришедший кусок остаётся ровным тоном.
 */
async function loadCtxOrtho(box: LonLatBox, aspect: number, signal?: AbortSignal): Promise<ImageBitmap> {
  const w = aspect >= 1 ? ORTHO_MAX_PX : Math.max(16, Math.round(ORTHO_MAX_PX * aspect));
  const h = aspect >= 1 ? Math.max(16, Math.round(ORTHO_MAX_PX / aspect)) : ORTHO_MAX_PX;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ORTHO_TIMEOUT_MS);
  const onAbort = () => ac.abort();
  signal?.addEventListener('abort', onAbort);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#9a7356';
  g.fillRect(0, 0, w, h);
  const n = ORTHO_TILES;
  const xs = Array.from({ length: n + 1 }, (_, i) => Math.round((w * i) / n));
  const ys = Array.from({ length: n + 1 }, (_, i) => Math.round((h * i) / n));
  const lonAt = (px: number) => box.west + ((box.east - box.west) * px) / w;
  const latAt = (py: number) => box.north - ((box.north - box.south) * py) / h;
  let ok = 0;
  try {
    await Promise.all(
      Array.from({ length: n * n }, async (_, k) => {
        const i = k % n;
        const j = Math.floor(k / n);
        const tile: LonLatBox = { west: lonAt(xs[i]), east: lonAt(xs[i + 1]), north: latAt(ys[j]), south: latAt(ys[j + 1]) };
        try {
          const r = await fetch(ctxWmsUrl(tile, xs[i + 1] - xs[i], ys[j + 1] - ys[j]), { signal: ac.signal });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const bmp = await createImageBitmap(await r.blob());
          g.drawImage(bmp, xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j]);
          bmp.close();
          ok++;
        } catch (e) {
          if (signal?.aborted) throw e;
        }
      }),
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  if (ok < n * n) console.warn(`Снимок CTX: загружено ${ok} из ${n * n} частей`);
  if (ok === 0) return flatOrtho();
  return createImageBitmap(canvas);
}

export async function buildOverviewPackage(route: PlannedWalkRoute, signal?: AbortSignal): Promise<SitePackage> {
  const box = routeBox(route.points);
  const bounds: [number, number, number, number] = [box.west * DEG * MARS_R, box.south * DEG * MARS_R, box.east * DEG * MARS_R, box.north * DEG * MARS_R];
  const wEqc = bounds[2] - bounds[0];
  const hEqc = bounds[3] - bounds[1];
  const { cell, cols, rows } = gridSize(wEqc, hEqc);
  // Рамка ровно по сетке, от северо-западного угла.
  bounds[2] = bounds[0] + cols * cell;
  bounds[1] = bounds[3] - rows * cell;
  const geoBox: LonLatBox = { ...box, east: bounds[2] / MARS_R / DEG, south: bounds[1] / MARS_R / DEG };

  const [mola, ortho] = await Promise.all([loadMola(), loadCtxOrtho(geoBox, cols / rows, signal)]);
  const data = new Float32Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let r = 0; r < rows; r++) {
    const lat = (bounds[3] - (r + 0.5) * cell) / MARS_R / DEG;
    for (let c = 0; c < cols; c++) {
      const lon = (bounds[0] + (c + 0.5) * cell) / MARS_R / DEG;
      const v = sampleMola(mola, lon, lat);
      data[r * cols + c] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const grid: HeightGrid = { width: cols, height: rows, data };
  const a = route.points[0];
  const b = route.points[route.points.length - 1];
  const label = route.label ? ` (${route.label})` : '';
  const lonE = (x: number) => ((x % 360) + 360) % 360;
  const manifest: SiteManifest = {
    id: OVERVIEW_SITE_ID,
    title: `Обзорный маршрут A → Б${label}`,
    title_en: `Overview route A → B${label}`,
    note: 'Рельеф MOLA ~7 км и снимок CTX: это не проверенная тропа.',
    note_en: 'MOLA ~7 km terrain and a CTX image: this is not a checked path.',
    center: { lat: (geoBox.south + geoBox.north) / 2, lon_east: lonE((geoBox.west + geoBox.east) / 2) },
    bounds_eqc_m: bounds,
    bounds_lonlat: { west: lonE(geoBox.west), south: geoBox.south, east: lonE(geoBox.east), north: geoBox.north },
    height: {
      file: '',
      width: cols,
      height: rows,
      pixel_m: cell,
      base_m: 0,
      step_m: 1,
      min_m: min,
      max_m: max,
      source_channel: {
        channel: 'B',
        values: { '0': 'MOLA MEGDR ~7 км (обзор) · снимок CTX' },
        values_en: { '0': 'MOLA MEGDR ~7 km (overview) · CTX image' },
      },
    },
    ortho: { file: '', width: ortho.width, height: ortho.height, pixel_m: (cols * cell) / ortho.width },
    sources: [
      { role: 'height', product: 'MOLA MEGDR 8 px/deg', credit: 'NASA/GSFC MOLA Science Team' },
      { role: 'ortho', product: 'CTX global mosaic (Murray Lab, Caltech)' },
    ],
    pois: [
      { id: 'A', title: 'A', lat: a.lat, lon_east: a.lonEast },
      { id: 'B', title: 'Б', title_en: 'B', lat: b.lat, lon_east: b.lonEast },
    ],
    track: null,
  };
  const frame = makeFrame(bounds, cell, cols, rows);
  return { manifest, frame, grid, ortho, orthoHi: null, track: null };
}
