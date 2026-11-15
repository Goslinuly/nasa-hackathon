// Трек ровера как путь в локальных метрах сцены: длина вдоль пути, ближайшая точка,
// положение и направление на заданной дистанции. Нужен для автоуправления и для полосы
// вокруг трека, где крутизна по модели рельефа не запрещает шаг (там реально проехал ровер).

export interface PathPoint {
  x: number;
  z: number;
}

export interface TrackPath {
  pts: PathPoint[];
  /** Длина вдоль пути от начала до каждой точки, м. */
  s: number[];
  length: number;
}

/** Ширина полосы вокруг трека, в которой ровер реально прошёл, м (по каждую сторону). */
export const TRACK_CORRIDOR_M = 3;

export function buildTrackPath(points: PathPoint[]): TrackPath {
  const pts: PathPoint[] = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 1e-3) pts.push({ x: p.x, z: p.z });
  }
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { pts, s, length: s[s.length - 1] ?? 0 };
}

/** Ближайшая точка пути: дистанция вдоль пути и расстояние до него, м. */
export function nearestOnPath(path: TrackPath, x: number, z: number): { s: number; dist: number } {
  let best = { s: 0, dist: Infinity };
  const { pts, s } = path;
  if (pts.length === 1) return { s: 0, dist: Math.hypot(x - pts[0].x, z - pts[0].z) };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len2 = ex * ex + ez * ez;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * ex + (z - a.z) * ez) / len2)) : 0;
    const d = Math.hypot(a.x + ex * t - x, a.z + ez * t - z);
    if (d < best.dist) best = { s: s[i] + (s[i + 1] - s[i]) * t, dist: d };
  }
  return best;
}

/** Точка пути на дистанции sAlong (с ограничением концами) и единичное направление пути там. */
export function pointAt(path: TrackPath, sAlong: number): { x: number; z: number; dx: number; dz: number } {
  const { pts, s, length } = path;
  if (pts.length === 0) return { x: 0, z: 0, dx: 0, dz: -1 };
  if (pts.length === 1) return { x: pts[0].x, z: pts[0].z, dx: 0, dz: -1 };
  const v = Math.min(length, Math.max(0, sAlong));
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid] <= v) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const seg = s[hi] - s[lo] || 1;
  const t = (v - s[lo]) / seg;
  const dx = (b.x - a.x) / seg;
  const dz = (b.z - a.z) / seg;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx, dz };
}

/**
 * Курс ровера (rotation.y сцены, вперёд = (−sin, −cos)) на точку пути впереди на lookAheadM.
 * Сглаживает изломы трека: ровер поворачивает заранее, а не рывком на узле.
 */
export function headingAlong(path: TrackPath, sAlong: number, lookAheadM = 4): number {
  const here = pointAt(path, sAlong);
  const ahead = pointAt(path, sAlong + lookAheadM);
  let dx = ahead.x - here.x;
  let dz = ahead.z - here.z;
  if (Math.hypot(dx, dz) < 1e-3) {
    dx = here.dx;
    dz = here.dz;
  }
  return Math.atan2(-dx, -dz);
}
