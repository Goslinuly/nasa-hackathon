// Точка на поверхности: луч из камеры до рельефа, координаты точки, трактовка тепловой инерции, жест «касание».

import { localToLonLat, type LocalFrame } from './geo';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Пересечение луча с рельефом по сетке высот: шаги вдоль луча, затем деление отрезка пополам.
 * groundY(x, z) — высота грунта в координатах сцены (NaN — нет данных). dir — единичный вектор.
 */
export function rayMarchTerrain(
  origin: Vec3,
  dir: Vec3,
  groundY: (x: number, z: number) => number,
  maxDist: number,
  firstStep = 0.5,
): (Vec3 & { t: number }) | null {
  let tPrev = 0;
  let step = firstStep;
  let t = step;
  while (t <= maxDist) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    const g = groundY(x, z);
    if (Number.isFinite(g) && y <= g) {
      let lo = tPrev;
      let hi = t;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        const gm = groundY(origin.x + dir.x * mid, origin.z + dir.z * mid);
        if (Number.isFinite(gm) && origin.y + dir.y * mid <= gm) hi = mid;
        else lo = mid;
      }
      return { x: origin.x + dir.x * hi, y: origin.y + dir.y * hi, z: origin.z + dir.z * hi, t: hi };
    }
    tPrev = t;
    // Шаг растёт с расстоянием: вблизи точность до долей метра, вдали — быстрее.
    step = Math.max(firstStep, t * 0.02);
    t += step;
  }
  return null;
}

/** Планетоцентрическая широта и восточная долгота (0–360) точки сцены. */
export function pointLonLat(frame: LocalFrame, x: number, z: number): { lat: number; lonEast: number } {
  const p = localToLonLat(frame, x, z);
  return { lat: p.lat, lonEast: p.lonEast };
}

/** Восточная долгота 0–360 → −180…180 (для карт с таким охватом). */
export function lon180(lonEast: number): number {
  return ((((lonEast + 180) % 360) + 360) % 360) - 180;
}

/** «4,8042° ю. ш., 137,3825° в. д.» / «4.8042° S, 137.3825° E». */
export function formatLatLon(lat: number, lonEast: number, lang: 'ru' | 'en'): string {
  const f = (v: number) => (lang === 'ru' ? Math.abs(v).toFixed(4).replace('.', ',') : Math.abs(v).toFixed(4));
  const ns = lang === 'ru' ? (lat < 0 ? 'ю. ш.' : 'с. ш.') : lat < 0 ? 'S' : 'N';
  const lon = ((lonEast % 360) + 360) % 360;
  return lang === 'ru' ? `${f(lat)}° ${ns}, ${f(lon)}° в. д.` : `${f(lat)}° ${ns}, ${f(lon)}° E`;
}

export type InertiaClass = 'fine' | 'sand' | 'coarse';

/** Тепловая инерция TES → тип грунта (трактовка). null/0 — нет данных. */
export function interpretInertia(value: number | null): { cls: InertiaClass; ru: string; en: string } | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  if (value < 150) return { cls: 'fine', ru: 'тонкая пыль и рыхлый песок', en: 'fine dust and loose sand' };
  if (value <= 400) return { cls: 'sand', ru: 'песок и плотный грунт с коркой', en: 'sand and firm crusted ground' };
  return { cls: 'coarse', ru: 'крупнообломочный грунт, дюрикраст или выходы пород', en: 'coarse ground, duricrust or rock outcrops' };
}

/** Касание без протяжки: сдвиг меньше 8 px и короче 300 мс. */
export const TAP_MAX_MOVE_PX = 8;
export const TAP_MAX_MS = 300;

export function isTap(dxPx: number, dyPx: number, durationMs: number): boolean {
  return Math.hypot(dxPx, dyPx) < TAP_MAX_MOVE_PX && durationMs < TAP_MAX_MS;
}
