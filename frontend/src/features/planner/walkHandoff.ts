// Передача маршрута в прогулку: маршрут годится, только если весь лежит внутри одного участка
// с подробным рельефом, с небольшим отступом от края.

import type { WalkRoutePoint } from '@/shared/walkRoute';

import type { LonLat } from './routing';

/** Радиус Марса, м (как в сетке участка). */
const MARS_RADIUS_M = 3396190;
const M_PER_DEG = (Math.PI / 180) * MARS_RADIUS_M;

/** Отступ от края участка по умолчанию, м. */
export const WALK_MARGIN_M = 30;

/** Границы участка в градусах; долготы восточные 0–360, окно может переходить через 0°. */
export interface LonLatBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

function toEast(lon: number): number {
  return ((lon % 360) + 360) % 360;
}

/** Точка внутри границ с отступом marginM от каждого края. */
export function insideBounds(bounds: LonLatBounds, point: LonLat, marginM = WALK_MARGIN_M): boolean {
  if (!Number.isFinite(point.lon) || !Number.isFinite(point.lat)) return false;
  const dLat = marginM / M_PER_DEG;
  if (point.lat < bounds.south + dLat || point.lat > bounds.north - dLat) return false;
  const cos = Math.max(Math.cos((point.lat * Math.PI) / 180), 1e-6);
  const dLon = marginM / (M_PER_DEG * cos);
  const span = (toEast(bounds.east) - toEast(bounds.west) + 360) % 360;
  const offset = (toEast(point.lon) - toEast(bounds.west) + 360) % 360;
  return offset >= dLon && offset <= span - dLon;
}

/** Весь маршрут внутри границ (пустой маршрут — нет). */
export function routeInsideBounds(bounds: LonLatBounds, points: LonLat[], marginM = WALK_MARGIN_M): boolean {
  return points.length > 0 && points.every((p) => insideBounds(bounds, p, marginM));
}

/** id первого участка, внутри которого лежит весь маршрут, или null. */
export function findWalkSite(
  sites: Iterable<{ id: string; bounds: LonLatBounds }>,
  points: LonLat[],
  marginM = WALK_MARGIN_M,
): string | null {
  for (const site of sites) {
    if (routeInsideBounds(site.bounds, points, marginM)) return site.id;
  }
  return null;
}

/** Точки маршрута в формате прогулки: широта и восточная долгота 0–360. */
export function toWalkPoints(points: LonLat[]): WalkRoutePoint[] {
  return points.map((p) => ({ lat: p.lat, lonEast: toEast(p.lon) }));
}
