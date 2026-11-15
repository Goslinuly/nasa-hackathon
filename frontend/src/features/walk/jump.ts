// Прыжок пешком: вертикальное движение в поле тяжести Марса и высота глаз по росту.
// Скорость отрыва даёт jump() из shared/eva/crew.ts (модель «та же работа ног», tools/crew/README.md),
// формулы и допущения — docs/PHYSICS.md §6.6; g_Марс = 3,72076 м/с² ≈ 0,38 g (§13).

/** Высота глаз ≈ 0,936 роста (антропометрическая модель). */
export const EYE_TO_STATURE = 0.936;

export function eyeHeightM(heightCm: number): number {
  const h = Number.isFinite(heightCm) && heightCm > 0 ? heightCm : 170;
  return (EYE_TO_STATURE * h) / 100;
}

export interface Airborne {
  /** Высота ступней (локальная система сцены), м. */
  y: number;
  /** Вертикальная скорость, м/с, вверх > 0. */
  vy: number;
}

/**
 * Шаг полёта за dt секунд. ground — высота рельефа под точкой после шага (NaN — нет данных,
 * там приземлиться нельзя). Возвращает null, если приземлились.
 */
export function stepJump(a: Airborne, dt: number, g: number, ground: number): Airborne | null {
  // Точное решение для постоянного ускорения: без накопления ошибки при любом dt.
  const y = a.y + a.vy * dt - 0.5 * g * dt * dt;
  const vy = a.vy - g * dt;
  if (Number.isFinite(ground) && vy <= 0 && y <= ground) return null;
  return { y, vy };
}

/** Высота подъёма и время полёта по скорости отрыва (ровная площадка). */
export function ballistic(takeoffMs: number, g: number): { heightM: number; flightS: number } {
  const v = Math.max(0, takeoffMs);
  return { heightM: (v * v) / (2 * g), flightS: (2 * v) / g };
}
