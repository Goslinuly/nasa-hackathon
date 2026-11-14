/// <reference lib="webworker" />
// Воркер расчёта маршрута: A* вне основного потока, чтобы интерфейс и глобус не замирали.

import { computeRoute, type RouteRequest } from './routeRequest';
import type { HazardGrid, HeightGrid, LonLat, RouteOptions } from './routing';

export type WorkerRequest =
  | { type: 'init'; grid: HeightGrid; hazard?: HazardGrid }
  | { type: 'localGrid'; grid: HeightGrid | null }
  | { type: 'route'; id: number; stops: LonLat[]; options: RouteOptions; useLocal?: boolean }
  | { type: 'route'; id: number; a: LonLat; b: LonLat; options: RouteOptions; useLocal?: boolean };

let grid: HeightGrid | null = null;
let hazard: HazardGrid | undefined;
let local: HeightGrid | null = null;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'init') {
    grid = message.grid;
    hazard = message.hazard;
    return;
  }
  if (message.type === 'localGrid') {
    local = message.grid;
    return;
  }
  if (!grid) {
    self.postMessage({ id: message.id, result: { status: 'invalid', reason: 'Карта высот ещё не загружена' } });
    return;
  }
  const started = performance.now();
  const { result, multi } = computeRoute(message as RouteRequest, grid, hazard, local);
  self.postMessage({ id: message.id, result, multi, ms: performance.now() - started });
};
