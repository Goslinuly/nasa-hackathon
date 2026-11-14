/**
 * Глобальная карта высот для объёмного глобуса: MOLA MEGDR, 8 px/° (~7.4 км/пикс).
 *
 * Файл готовит backend/scripts/build_globe_heightmap.py: PNG, где высота над
 * ареоидом закодирована в каналах R (старший байт) и G (младший). Рядом лежит
 * JSON с параметрами кодирования и источником — их и читаем, а не дублируем.
 *
 * Геометрия глобуса передаёт крупные формы рельефа; мелкие детали видны только
 * на текстуре. Вертикальное преувеличение задаётся явно и показывается в HUD.
 */

const BASE_URL = '/data/globe/mola_megdr_8ppd_height';

export interface HeightmapMeta {
  offset_units: number;
  step_m: number;
  width: number;
  height: number;
  pixels_per_degree: number;
  first_row_north_edge_lat: number;
  first_column_west_edge_lon_east: number;
  min_m: number;
  max_m: number;
  source: { product_id: string; credit: string };
}

export class HeightField {
  constructor(
    readonly meta: HeightmapMeta,
    /** Высоты в метрах, построчно с севера, столбцы на восток от 0°E. */
    readonly heights: Float32Array,
  ) {
    if (heights.length !== meta.width * meta.height) {
      throw new Error('Размер карты высот не совпадает с метаданными');
    }
  }

  /** Номинальное разрешение сетки на экваторе, м/пикс. */
  get resolutionM(): number {
    return (2 * Math.PI * 3_396_190) / this.meta.width;
  }

  /** Билинейная высота в метрах; долгота в любой записи (±180 или 0–360). */
  sample(lonDeg: number, latDeg: number): number {
    const { width, height, pixels_per_degree: ppd } = this.meta;
    const lonEast =
      (((lonDeg - this.meta.first_column_west_edge_lon_east) % 360) + 360) % 360;
    // Центры пикселей смещены на половину шага от края.
    const fx = lonEast * ppd - 0.5;
    const fy = Math.min(
      height - 1,
      Math.max(0, (this.meta.first_row_north_edge_lat - latDeg) * ppd - 0.5),
    );
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const xa = ((x0 % width) + width) % width;
    const xb = (xa + 1) % width;
    const ya = y0;
    const yb = Math.min(height - 1, y0 + 1);
    const h = this.heights;
    const top = h[ya * width + xa] * (1 - tx) + h[ya * width + xb] * tx;
    const bottom = h[yb * width + xa] * (1 - tx) + h[yb * width + xb] * tx;
    return top * (1 - ty) + bottom * ty;
  }
}

/** Раскодировать RGBA-пиксели PNG в высоты; канал B обязан быть нулевым. */
export function decodeHeights(rgba: Uint8ClampedArray, meta: HeightmapMeta): Float32Array {
  const count = meta.width * meta.height;
  if (rgba.length !== count * 4) {
    throw new Error('Размер изображения не совпадает с метаданными');
  }
  const heights = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    if (rgba[p + 2] !== 0) {
      // Признак цветокоррекции браузером: значения испорчены, рельеф не строим.
      throw new Error('Карта высот искажена при декодировании');
    }
    heights[i] = (((rgba[p] << 8) | rgba[p + 1]) - meta.offset_units) * meta.step_m;
  }
  return heights;
}

export async function loadHeightField(signal?: AbortSignal): Promise<HeightField> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error('Карта высот: сервер не ответил за 30 секунд. Повторите загрузку.')), 30000);
  try {
    const metaResponse = await fetch(`${BASE_URL}.json`, { signal: controller.signal });
    if (!metaResponse.ok) throw new Error(`Метаданные MOLA недоступны: HTTP ${metaResponse.status}`);
    if (!metaResponse.headers.get('content-type')?.includes('json')) throw new Error('Вместо метаданных MOLA сервер вернул не JSON. Проверьте /data/globe/ в сборке.');
    const meta = await metaResponse.json() as HeightmapMeta;
    if (!Number.isInteger(meta.width) || !Number.isInteger(meta.height) || meta.width <= 0 || meta.height <= 0 || meta.width * meta.height > 16777216 || !Number.isFinite(meta.step_m) || meta.step_m <= 0 || !Number.isFinite(meta.offset_units) || !Number.isFinite(meta.pixels_per_degree) || meta.pixels_per_degree <= 0) throw new Error('Некорректные метаданные MOLA');
    const imageResponse = await fetch(`${BASE_URL}.png`, { signal: controller.signal });
    if (!imageResponse.ok) throw new Error(`Изображение MOLA недоступно: HTTP ${imageResponse.status}`);
    const blob = await imageResponse.blob();
    const bitmap = await createImageBitmap(blob, {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    const canvas = document.createElement('canvas');
    if (bitmap.width !== meta.width || bitmap.height !== meta.height) { bitmap.close(); throw new Error('Размер PNG MOLA не совпадает с метаданными'); }
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) { bitmap.close(); throw new Error('Canvas 2D недоступен'); }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return new HeightField(meta, decodeHeights(pixels, meta));
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
