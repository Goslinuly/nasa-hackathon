/// <reference lib="webworker" />
/**
 * Расчёт маршрута вне основного потока: A* по всей планете может занять секунды,
 * интерфейс и глобус при этом не должны замирать.
 */

import { findRoute, type HeightGrid, type LonLat, type RouteOptions } from './routing';

export type WorkerRequest =
  | { type: 'init'; grid: HeightGrid }
  | { type: 'route'; id: number; a: LonLat; b: LonLat; options: RouteOptions };

let grid: HeightGrid | null = null;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'init') {
    grid = message.grid;
    return;
  }
  if (!grid) {
    self.postMessage({ id: message.id, result: { status: 'invalid', reason: 'Карта высот ещё не загружена' } });
    return;
  }
  const started = performance.now();
  const result = findRoute(grid, message.a, message.b, message.options);
  self.postMessage({ id: message.id, result, ms: performance.now() - started });
};
