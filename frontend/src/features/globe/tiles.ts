/**
 * Тайловая сетка NASA Mars Trek (WMTS, матрица default028mm).
 *
 * Уровень z: 2^(z+1) колонок на 360° долготы и 2^z строк на 180° широты,
 * тайл 256 px, равнопромежуточная проекция. Каждый слой ограничен своим
 * maxNativeZoom: дальше этого уровня новых деталей в данных нет, и интерфейс
 * обязан это показывать, а не растягивать пиксели молча (правило AGENTS.md).
 */

export const MARS_RADIUS_KM = 3396.19;
export const MARS_EQUATOR_M = 2 * Math.PI * MARS_RADIUS_KM * 1000;

export function tileColumns(z: number): number {
  return 2 ** (z + 1);
}

export function tileRows(z: number): number {
  return 2 ** z;
}

/** Разрешение пикселя тайла уровня z на экваторе, м/пикс. */
export function tileResolutionM(z: number): number {
  return MARS_EQUATOR_M / (256 * tileColumns(z));
}

/** Фактическое разрешение данных на уровне z: не лучше исходного продукта. */
export function dataResolutionM(nativeResolutionM: number, z: number): number {
  return Math.max(tileResolutionM(z), nativeResolutionM);
}

export interface TileBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

/** Границы тайла в градусах (долгота ±180, широта ±90). */
export function tileBounds(z: number, x: number, y: number): TileBounds {
  const span = 360 / tileColumns(z);
  return {
    west: -180 + x * span,
    east: -180 + (x + 1) * span,
    north: 90 - y * span,
    south: 90 - (y + 1) * span,
  };
}

/** Тайл, содержащий точку (долгота ±180). */
export function lonLatToTile(z: number, lonDeg: number, latDeg: number): { x: number; y: number } {
  const span = 360 / tileColumns(z);
  const x = Math.floor((lonDeg + 180) / span);
  const y = Math.floor((90 - latDeg) / span);
  return {
    x: Math.min(Math.max(x, 0), tileColumns(z) - 1),
    y: Math.min(Math.max(y, 0), tileRows(z) - 1),
  };
}

/**
 * Где внутри тайла-предка уровня zs лежит тайл (z, x, y): координаты предка и
 * преобразование UV (offset/repeat) для текстуры предка. v=1 — север тайла.
 */
export function ancestorRect(
  z: number,
  x: number,
  y: number,
  zs: number,
): { x: number; y: number; repeat: number; offsetX: number; offsetY: number } {
  const depth = Math.max(0, z - zs);
  const n = 2 ** depth;
  const ax = Math.floor(x / n);
  const ay = Math.floor(y / n);
  return {
    x: ax,
    y: ay,
    repeat: 1 / n,
    offsetX: (x - ax * n) / n,
    offsetY: 1 - (y - ay * n + 1) / n,
  };
}
