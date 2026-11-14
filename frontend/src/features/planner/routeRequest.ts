// Чистая диспетчеризация запроса маршрута для воркера: выбор сетки, форма stops, сшивка остановок.

import { findRoute, type HazardGrid, type HeightGrid, type LonLat, type RouteOptions, type RouteResult } from './routing';
import { findRouteThrough } from './waypoints';

export interface RouteRequest {
  type: 'route';
  id: number;
  stops?: LonLat[];
  /** Старая форма запроса: эквивалентна stops = [a, b]. */
  a?: LonLat;
  b?: LonLat;
  options: RouteOptions;
  useLocal?: boolean;
}

export interface RouteComputation {
  result: RouteResult;
  /** Только для маршрута с остановками: индексы остановок в точках сшитого маршрута. */
  multi?: { stopIndices: number[]; failedLeg?: number };
}

export function stopsOf(request: RouteRequest): LonLat[] {
  if (request.stops) return request.stops;
  return request.a && request.b ? [request.a, request.b] : [];
}

/** Детальная сетка берётся при useLocal; изрезанность и грунт по инерции — только для глобальной сетки. */
export function computeRoute(
  request: RouteRequest,
  globalGrid: HeightGrid,
  hazard: HazardGrid | undefined,
  local: HeightGrid | null,
): RouteComputation {
  const stops = stopsOf(request);
  const useLocal = request.useLocal === true && local !== null;
  const grid = useLocal && local ? local : globalGrid;
  const layers = useLocal ? undefined : hazard;
  if (stops.length < 2) return { result: { status: 'invalid', reason: 'Нужны хотя бы старт и финиш' } };
  if (stops.length === 2) return { result: findRoute(grid, stops[0], stops[1], request.options, layers) };
  const through = findRouteThrough(grid, stops, request.options, layers);
  if (through.status === 'ok') return { result: through.route, multi: { stopIndices: through.stopIndices } };
  return { result: through.reason, multi: { stopIndices: [], failedLeg: through.legIndex } };
}
