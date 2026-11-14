// Обзорный маршрут A → Б: A* по карте высот MOLA с запретом слишком крутых уклонов — оценка, а не проверенная тропа.

import { MARS_RADIUS_KM } from '@/features/globe/tiles';

const R = MARS_RADIUS_KM * 1000;
const DEG = Math.PI / 180;

export interface HeightGrid {
  width: number;
  height: number;
  pixelsPerDegree: number;
  heights: Float32Array;
}

export interface RouteOptions {
  maxSlopeDeg: number;
  slopeWeight: number;
}

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = { maxSlopeDeg: 15, slopeWeight: 3 };

export interface LonLat {
  lon: number;
  lat: number;
}

export interface RoutePoint extends LonLat {
  heightM: number;
  distanceM: number;
  slopeDeg: number;
}

export type RouteResult =
  | {
      status: 'ok';
      points: RoutePoint[];
      lengthM: number;
      greatCircleM: number;
      ascentM: number;
      descentM: number;
      maxSlopeDeg: number;
      minHeightM: number;
      maxHeightM: number;
      visited: number;
    }
  | { status: 'unreachable'; greatCircleM: number; visited: number }
  | { status: 'invalid'; reason: string };

export function greatCircleM(a: LonLat, b: LonLat): number {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const h =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(((b.lon - a.lon) * DEG) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

class MinHeap {
  private keys: number[] = [];
  private values: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, value: number): void {
    const keys = this.keys;
    const values = this.values;
    let i = keys.length;
    keys.push(key);
    values.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      values[i] = values[parent];
      i = parent;
    }
    keys[i] = key;
    values[i] = value;
  }

  lastKey = 0;
  pop(): number {
    const keys = this.keys;
    const values = this.values;
    const topValue = values[0];
    this.lastKey = keys[0];
    const lastKey = keys.pop()!;
    const lastValue = values.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        const left = 2 * i + 1;
        if (left >= n) break;
        const right = left + 1;
        const child = right < n && keys[right] < keys[left] ? right : left;
        if (keys[child] >= lastKey) break;
        keys[i] = keys[child];
        values[i] = values[child];
        i = child;
      }
      keys[i] = lastKey;
      values[i] = lastValue;
    }
    return topValue;
  }
}

export function findRoute(grid: HeightGrid, a: LonLat, b: LonLat, options: RouteOptions = DEFAULT_ROUTE_OPTIONS): RouteResult {
  const { width, height, pixelsPerDegree: ppd, heights } = grid;
  if (heights.length !== width * height) return { status: 'invalid', reason: 'Размер сетки не совпадает' };
  for (const p of [a, b]) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90) {
      return { status: 'invalid', reason: 'Некорректные координаты' };
    }
  }

  const cellOf = (p: LonLat) => {
    const col = Math.floor(((((p.lon % 360) + 360) % 360) * ppd)) % width;
    const row = Math.min(height - 1, Math.max(0, Math.floor((90 - p.lat) * ppd)));
    return row * width + col;
  };
  const latOf = (row: number) => 90 - (row + 0.5) / ppd;
  const lonOf = (col: number) => {
    const east = (col + 0.5) / ppd;
    return east > 180 ? east - 360 : east;
  };

  const start = cellOf(a);
  const goal = cellOf(b);
  const goalRow = Math.floor(goal / width);
  const goalPoint = { lat: latOf(goalRow), lon: lonOf(goal % width) };
  const straight = greatCircleM(a, b);

  const dy = (R * DEG) / ppd;
  const dxRow = new Float64Array(height);
  for (let row = 0; row < height; row++) {
    dxRow[row] = Math.max(1, R * Math.cos(latOf(row) * DEG) * DEG) / ppd;
  }

  const cost = new Float64Array(width * height).fill(Infinity);
  const parent = new Int32Array(width * height).fill(-1);
  const closed = new Uint8Array(width * height);
  const heap = new MinHeap();
  const maxTan = Math.tan(options.maxSlopeDeg * DEG);
  const heuristic = (row: number, col: number) => greatCircleM({ lat: latOf(row), lon: lonOf(col) }, goalPoint);

  cost[start] = 0;
  heap.push(heuristic(Math.floor(start / width), start % width), start);
  let visited = 0;

  while (heap.size > 0) {
    const node = heap.pop();
    if (closed[node]) continue;
    closed[node] = 1;
    visited++;
    if (node === goal) break;
    const row = Math.floor(node / width);
    const col = node % width;
    const h0 = heights[node];
    for (let dr = -1; dr <= 1; dr++) {
      const nr = row + dr;
      if (nr < 0 || nr >= height) continue;
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nc = (col + dc + width) % width;
        const next = nr * width + nc;
        if (closed[next]) continue;
        const dx = dc === 0 ? 0 : (dxRow[row] + dxRow[nr]) / 2;
        const run = Math.hypot(dx, dr === 0 ? 0 : dy);
        const rise = Math.abs(heights[next] - h0);
        if (rise > run * maxTan) continue;
        const ratio = rise / run / maxTan;
        const candidate = cost[node] + run * (1 + options.slopeWeight * ratio * ratio);
        if (candidate < cost[next]) {
          cost[next] = candidate;
          parent[next] = node;
          heap.push(candidate + heuristic(nr, nc), next);
        }
      }
    }
  }

  if (!closed[goal]) return { status: 'unreachable', greatCircleM: straight, visited };

  const cells: number[] = [];
  for (let node = goal; node !== -1; node = parent[node]) cells.push(node);
  cells.reverse();

  const path = cells.map((node) => ({ lat: latOf(Math.floor(node / width)), lon: lonOf(node % width), h: heights[node] }));
  if (path.length === 1) path.push({ ...path[0] });
  path[0] = { ...path[0], lat: a.lat, lon: a.lon };
  path[path.length - 1] = { ...path[path.length - 1], lat: b.lat, lon: b.lon };

  const points: RoutePoint[] = [];
  let distance = 0;
  let ascent = 0;
  let descent = 0;
  let maxSlope = 0;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let i = 0; i < path.length; i++) {
    const { h, ...point } = path[i];
    let slope = 0;
    if (i > 0) {
      const previous = points[i - 1];
      const run = greatCircleM(previous, point);
      const rise = h - previous.heightM;
      distance += run;
      slope = run > 0 ? Math.atan(Math.abs(rise) / run) / DEG : 0;
      if (rise > 0) ascent += rise;
      else descent -= rise;
      maxSlope = Math.max(maxSlope, slope);
    }
    minHeight = Math.min(minHeight, h);
    maxHeight = Math.max(maxHeight, h);
    points.push({ ...point, heightM: h, distanceM: distance, slopeDeg: slope });
  }

  return {
    status: 'ok',
    points,
    lengthM: distance,
    greatCircleM: straight,
    ascentM: ascent,
    descentM: descent,
    maxSlopeDeg: maxSlope,
    minHeightM: minHeight,
    maxHeightM: maxHeight,
    visited,
  };
}
