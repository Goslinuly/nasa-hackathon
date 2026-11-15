// Свой маршрут для прогулки от первого лица: планировщик кладёт, прогулка забирает.
// Точки — planetocentric широта и восточная долгота 0–360, как везде в проекте.
// Хранится в памяти и в sessionStorage, чтобы пережить перезагрузку вкладки.

export interface WalkRoutePoint {
  lat: number;
  lonEast: number;
}

export interface PlannedWalkRoute {
  /** Участок прогулки (id из data/local/index.json). */
  siteId: string;
  points: WalkRoutePoint[];
  /** Откуда маршрут: из планировщика на шаре или построен в самой прогулке. */
  source: 'planner' | 'walk';
  /** Короткая подпись: «A → Б, 1,9 км». */
  label?: string;
  createdAt: number;
}

const KEY = 'martian-map-walk-route';
let pending: PlannedWalkRoute | null = null;

export function setPlannedWalkRoute(route: PlannedWalkRoute): void {
  pending = route;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(route));
  } catch {
    // Хранилище недоступно — маршрут останется в памяти до перезагрузки.
  }
}

/** Забрать маршрут для участка: возвращает и очищает, если участок совпал. */
export function takePlannedWalkRoute(siteId: string): PlannedWalkRoute | null {
  let route = pending;
  if (!route) {
    try {
      const raw = sessionStorage.getItem(KEY);
      route = raw ? (JSON.parse(raw) as PlannedWalkRoute) : null;
    } catch {
      route = null;
    }
  }
  if (!route || route.siteId !== siteId || !Array.isArray(route.points) || route.points.length < 2) return null;
  pending = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Нечего очищать.
  }
  return route;
}
