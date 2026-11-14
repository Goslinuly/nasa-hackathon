// Маршрут через промежуточные точки: последовательные ноги A*, сшитые в один непрерывный результат.

import {
  findRoute,
  type HazardGrid,
  type HeightGrid,
  type LonLat,
  type RouteEvaTotals,
  type RouteHazardInfo,
  type RouteOptions,
  type RoutePoint,
  type RouteResult,
} from './routing';

export type RouteOk = Extract<RouteResult, { status: 'ok' }>;

export interface MultiRouteOk {
  status: 'ok';
  route: RouteOk;
  /** Индексы точек остановок в общем массиве points: старт, каждая цель, финиш. */
  stopIndices: number[];
  legs: RouteOk[];
}

export interface MultiRouteFailed {
  status: 'failed';
  /** Номер ноги (0 — от старта к первой цели), на которой поиск не удался. */
  legIndex: number;
  from: LonLat;
  to: LonLat;
  reason: RouteResult;
  completed: RouteOk[];
}

export type MultiRouteResult = MultiRouteOk | MultiRouteFailed;

function mergeEva(legs: RouteOk[]): RouteEvaTotals | undefined {
  const parts = legs.map((leg) => leg.eva).filter((eva): eva is RouteEvaTotals => eva !== undefined);
  if (parts.length !== legs.length || parts.length === 0) return undefined;
  const first = parts[0];
  return {
    seconds: parts.reduce((sum, eva) => sum + eva.seconds, 0),
    o2LowL: parts.reduce((sum, eva) => sum + eva.o2LowL, 0),
    o2HighL: parts.reduce((sum, eva) => sum + eva.o2HighL, 0),
    outsideModelSegments: parts.reduce((sum, eva) => sum + eva.outsideModelSegments, 0),
    surface: first.surface,
    crewKg: first.crewKg,
    loadKg: first.loadKg,
  };
}

function mergeHazard(legs: RouteOk[]): RouteHazardInfo | undefined {
  const parts = legs.map((leg) => leg.hazard).filter((info): info is RouteHazardInfo => info !== undefined);
  if (parts.length !== legs.length || parts.length === 0) return undefined;
  return {
    blockedByRuggedness: parts.reduce((sum, info) => sum + info.blockedByRuggedness, 0),
    maxRuggedSlopeDeg: parts[0].maxRuggedSlopeDeg,
    surfaceFromData: parts.every((info) => info.surfaceFromData),
    sandM: parts.reduce((sum, info) => sum + info.sandM, 0),
    unknownSurfaceM: parts.reduce((sum, info) => sum + info.unknownSurfaceM, 0),
  };
}

/** Маршрут старт → цели по порядку → финиш. Любая непроходимая нога честно останавливает расчёт. */
export function findRouteThrough(
  grid: HeightGrid,
  stops: LonLat[],
  options: RouteOptions,
  hazard?: HazardGrid,
): MultiRouteResult {
  if (stops.length < 2) {
    return {
      status: 'failed',
      legIndex: 0,
      from: stops[0] ?? { lon: 0, lat: 0 },
      to: stops[0] ?? { lon: 0, lat: 0 },
      reason: { status: 'invalid', reason: 'Нужны хотя бы старт и финиш' },
      completed: [],
    };
  }

  const legs: RouteOk[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const result = findRoute(grid, stops[i], stops[i + 1], options, hazard);
    if (result.status !== 'ok') {
      return { status: 'failed', legIndex: i, from: stops[i], to: stops[i + 1], reason: result, completed: legs };
    }
    legs.push(result);
  }

  const points: RoutePoint[] = [];
  const stopIndices: number[] = [0];
  let distanceShift = 0;
  for (const leg of legs) {
    const from = points.length === 0 ? 0 : 1;
    for (let i = from; i < leg.points.length; i++) {
      const point = leg.points[i];
      points.push({ ...point, distanceM: point.distanceM + distanceShift });
    }
    distanceShift = points[points.length - 1].distanceM;
    stopIndices.push(points.length - 1);
  }

  const route: RouteOk = {
    status: 'ok',
    points,
    lengthM: distanceShift,
    greatCircleM: legs.reduce((sum, leg) => sum + leg.greatCircleM, 0),
    ascentM: legs.reduce((sum, leg) => sum + leg.ascentM, 0),
    descentM: legs.reduce((sum, leg) => sum + leg.descentM, 0),
    maxSlopeDeg: Math.max(...legs.map((leg) => leg.maxSlopeDeg)),
    minHeightM: Math.min(...legs.map((leg) => leg.minHeightM)),
    maxHeightM: Math.max(...legs.map((leg) => leg.maxHeightM)),
    visited: legs.reduce((sum, leg) => sum + leg.visited, 0),
    dataLevel: legs.every((leg) => leg.dataLevel === 'local_dtm') ? 'local_dtm' : 'orbital_overview',
    eva: mergeEva(legs),
    hazard: mergeHazard(legs),
  };

  return { status: 'ok', route, stopIndices, legs };
}
