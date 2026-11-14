// Маршрут A → Б: A* по карте высот с моделью расхода EVA, запретами по уклону и изрезанности — оценка, а не проверенная тропа.

import { MARS_RADIUS_KM } from '@/features/globe/tiles';
import { DEFAULT_TRAVERSE, costPerMetreL, segmentCost, type Surface, type TraverseParams } from '@/shared/eva/traverse';

const R = MARS_RADIUS_KM * 1000;
const DEG = Math.PI / 180;

// ---------- сетки ----------

export type DataLevel = 'local_dtm' | 'orbital_overview';

export interface HeightGrid {
  width: number;
  height: number;
  pixelsPerDegree: number;
  heights: Float32Array;
  /** Западный и северный край окна сетки, градусы; без них сетка глобальная от 0° в. д. и +90°. */
  lonWestDeg?: number;
  latNorthDeg?: number;
  /** Происхождение рельефа; по умолчанию орбитальный обзор MOLA. */
  dataLevel?: DataLevel;
}

export interface HazardGrid {
  width: number;
  height: number;
  pixelsPerDegree: number;
  /** Уклон на масштабе ~200 м: значение = пиксель × slopeStepDeg. */
  ruggedSlope: Uint8Array;
  slopeStepDeg: number;
  /** Тепловая инерция: значение = пиксель × inertiaStep; 0 — нет данных. */
  inertia: Uint8Array;
  inertiaStep: number;
  /** Ниже этого порога грунт трактуется как рыхлый песок. */
  sandBelowTiu: number;
}

export interface RouteOptions {
  maxSlopeDeg: number;
  slopeWeight: number;
  /** Чем платим за путь: метрами со штрафом за крутизну или кислородом по модели выхода. */
  costModel?: 'distance' | 'eva';
  traverse?: TraverseParams;
  /** Запрет ячеек, где уклон на масштабе 200 м круче порога; по умолчанию равен maxSlopeDeg. */
  maxRuggedSlopeDeg?: number;
  /** Грунт каждой ячейки по тепловой инерции вместо одного переключателя на весь маршрут. */
  surfaceFromData?: boolean;
}

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = { maxSlopeDeg: 15, slopeWeight: 3 };

export interface LonLat {
  lon: number;
  lat: number;
}

export type PointSurface = Surface | 'unknown';

export interface RoutePoint extends LonLat {
  heightM: number;
  distanceM: number;
  slopeDeg: number;
  /** Грунт ячейки по тепловой инерции, когда включён расчёт по данным. */
  surface?: PointSurface;
  /** Уклон на масштабе 200 м в ячейке, когда подключена сетка проходимости. */
  ruggedSlopeDeg?: number;
}

export interface RouteEvaTotals {
  seconds: number;
  o2LowL: number;
  o2HighL: number;
  /** Участки, где уклон вышел за область определения модели скорости. */
  outsideModelSegments: number;
  surface: TraverseParams['surface'] | 'per_cell';
  crewKg: number;
  loadKg: number;
}

export interface RouteHazardInfo {
  /** Сколько раз поиск упёрся в ячейки, запрещённые по изрезанности. */
  blockedByRuggedness: number;
  maxRuggedSlopeDeg: number;
  surfaceFromData: boolean;
  /** Метров пути по рыхлому песку. */
  sandM: number;
  /** Метров пути по ячейкам без данных тепловой инерции. */
  unknownSurfaceM: number;
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
      /** Уровень данных рельефа, на котором построен маршрут. */
      dataLevel: DataLevel;
      /** Расход по модели выхода считается, когда маршрут искали по ней. */
      eva?: RouteEvaTotals;
      /** Статистика препятствий, когда подключена сетка проходимости. */
      hazard?: RouteHazardInfo;
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

// ---------- очередь с приоритетом ----------

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

  pop(): number {
    const keys = this.keys;
    const values = this.values;
    const topValue = values[0];
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

// ---------- геометрия сетки ----------

interface GridFrame {
  width: number;
  height: number;
  ppd: number;
  lonWest: number;
  latNorth: number;
  wraps: boolean;
}

function frameOf(grid: HeightGrid): GridFrame {
  const wraps = grid.lonWestDeg === undefined && grid.width === Math.round(360 * grid.pixelsPerDegree);
  return {
    width: grid.width,
    height: grid.height,
    ppd: grid.pixelsPerDegree,
    lonWest: grid.lonWestDeg ?? 0,
    latNorth: grid.latNorthDeg ?? 90,
    wraps,
  };
}

function columnOf(frame: GridFrame, lon: number): number {
  const east = ((((lon - frame.lonWest) % 360) + 360) % 360) * frame.ppd;
  const col = Math.floor(east);
  return frame.wraps ? col % frame.width : col;
}

function rowOf(frame: GridFrame, lat: number): number {
  return Math.floor((frame.latNorth - lat) * frame.ppd);
}

function latOfRow(frame: GridFrame, row: number): number {
  return frame.latNorth - (row + 0.5) / frame.ppd;
}

function lonOfCol(frame: GridFrame, col: number): number {
  const east = frame.lonWest + (col + 0.5) / frame.ppd;
  const wrapped = ((east % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

// ---------- цена ребра ----------

type SurfaceCode = 0 | 1 | 2;

const SURFACE_NAMES: PointSurface[] = ['firm', 'sand', 'unknown'];

interface CostModel {
  /** Цена метра по уклону градиента, отдельная таблица на каждый грунт. */
  gradient: Float64Array[];
  /** Цена метра «перекатов» изрезанности: половина пути вверх, половина вниз. */
  rolling: Float64Array[];
  slopeSpan: number;
  step: number;
  cheapest: number;
}

function buildCostModel(options: RouteOptions): CostModel | null {
  if (options.costModel !== 'eva') return null;
  const base = options.traverse ?? DEFAULT_TRAVERSE;
  const step = 0.05;
  const span = options.maxSlopeDeg;
  const size = Math.max(2, Math.ceil((2 * span) / step) + 1);
  const gradient: Float64Array[] = [];
  const rolling: Float64Array[] = [];
  let cheapest = Infinity;
  for (const surface of ['firm', 'sand'] as Surface[]) {
    const params: TraverseParams = { ...base, surface };
    const grad = new Float64Array(size);
    const roll = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const slope = -span + i * step;
      grad[i] = costPerMetreL(slope, params);
      roll[i] = (costPerMetreL(Math.abs(slope), params) + costPerMetreL(-Math.abs(slope), params)) / 2;
      if (grad[i] < cheapest) cheapest = grad[i];
    }
    gradient.push(grad);
    rolling.push(roll);
  }
  return { gradient, rolling, slopeSpan: span, step, cheapest };
}

function tableIndex(model: CostModel, slopeDeg: number): number {
  const i = Math.round((slopeDeg + model.slopeSpan) / model.step);
  const last = model.gradient[0].length - 1;
  return i < 0 ? 0 : i > last ? last : i;
}

// ---------- привязка сетки проходимости ----------

interface HazardLookup {
  grid: HazardGrid;
  colMap: Int32Array;
  rowMap: Int32Array;
  maxRugged: number;
  surfaceFromData: boolean;
}

function buildHazardLookup(frame: GridFrame, hazard: HazardGrid | undefined, options: RouteOptions): HazardLookup | null {
  if (!hazard) return null;
  const colMap = new Int32Array(frame.width);
  for (let col = 0; col < frame.width; col++) {
    const east = ((lonOfCol(frame, col) % 360) + 360) % 360;
    colMap[col] = Math.min(hazard.width - 1, Math.max(0, Math.floor(east * hazard.pixelsPerDegree)));
  }
  const rowMap = new Int32Array(frame.height);
  for (let row = 0; row < frame.height; row++) {
    rowMap[row] = Math.min(hazard.height - 1, Math.max(0, Math.floor((90 - latOfRow(frame, row)) * hazard.pixelsPerDegree)));
  }
  return {
    grid: hazard,
    colMap,
    rowMap,
    maxRugged: options.maxRuggedSlopeDeg ?? options.maxSlopeDeg,
    surfaceFromData: options.surfaceFromData ?? true,
  };
}

function ruggedAt(lookup: HazardLookup, row: number, col: number): number {
  return lookup.grid.ruggedSlope[lookup.rowMap[row] * lookup.grid.width + lookup.colMap[col]] * lookup.grid.slopeStepDeg;
}

function surfaceAt(lookup: HazardLookup, row: number, col: number): SurfaceCode {
  const raw = lookup.grid.inertia[lookup.rowMap[row] * lookup.grid.width + lookup.colMap[col]];
  if (raw === 0) return 2;
  return raw * lookup.grid.inertiaStep < lookup.grid.sandBelowTiu ? 1 : 0;
}

// ---------- поиск ----------

export function findRoute(
  grid: HeightGrid,
  a: LonLat,
  b: LonLat,
  options: RouteOptions = DEFAULT_ROUTE_OPTIONS,
  hazard?: HazardGrid,
): RouteResult {
  const { width, height, heights } = grid;
  if (heights.length !== width * height) return { status: 'invalid', reason: 'Размер сетки не совпадает' };
  const frame = frameOf(grid);
  for (const p of [a, b]) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90) {
      return { status: 'invalid', reason: 'Некорректные координаты' };
    }
    const col = columnOf(frame, p.lon);
    const row = rowOf(frame, p.lat);
    if (row < 0 || row >= height || col < 0 || col >= width) {
      return { status: 'invalid', reason: 'Точка вне участка детального рельефа' };
    }
    if (!Number.isFinite(heights[row * width + col])) {
      return { status: 'invalid', reason: 'Точка попала в область без данных рельефа' };
    }
  }

  const start = rowOf(frame, a.lat) * width + columnOf(frame, a.lon);
  const goal = rowOf(frame, b.lat) * width + columnOf(frame, b.lon);
  const goalPoint = { lat: latOfRow(frame, Math.floor(goal / width)), lon: lonOfCol(frame, goal % width) };
  const straight = greatCircleM(a, b);

  const dy = (R * DEG) / frame.ppd;
  const dxRow = new Float64Array(height);
  for (let row = 0; row < height; row++) {
    dxRow[row] = Math.max(1, R * Math.cos(latOfRow(frame, row) * DEG) * DEG) / frame.ppd;
  }

  const lookup = buildHazardLookup(frame, hazard, options);
  const model = buildCostModel(options);
  const baseSurface: SurfaceCode = (options.traverse ?? DEFAULT_TRAVERSE).surface === 'sand' ? 1 : 0;

  const cost = new Float64Array(width * height).fill(Infinity);
  const parent = new Int32Array(width * height).fill(-1);
  const closed = new Uint8Array(width * height);
  const heap = new MinHeap();
  const maxTan = Math.tan(options.maxSlopeDeg * DEG);
  const cheapest = model ? model.cheapest : 1;
  const heuristic = (row: number, col: number) =>
    greatCircleM({ lat: latOfRow(frame, row), lon: lonOfCol(frame, col) }, goalPoint) * cheapest;

  cost[start] = 0;
  heap.push(heuristic(Math.floor(start / width), start % width), start);
  let visited = 0;
  let blockedByRuggedness = 0;

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
        let nc = col + dc;
        if (nc < 0 || nc >= width) {
          if (!frame.wraps) continue;
          nc = (nc + width) % width;
        }
        const next = nr * width + nc;
        if (closed[next]) continue;
        const h1 = heights[next];
        if (!Number.isFinite(h1)) continue;
        const dx = dc === 0 ? 0 : (dxRow[row] + dxRow[nr]) / 2;
        const run = Math.hypot(dx, dr === 0 ? 0 : dy);
        const delta = h1 - h0;
        const rise = Math.abs(delta);
        if (rise > run * maxTan) continue;

        let rugged = 0;
        let surfaceCode = baseSurface;
        if (lookup) {
          rugged = ruggedAt(lookup, nr, nc);
          if (rugged > lookup.maxRugged) {
            blockedByRuggedness++;
            continue;
          }
          if (lookup.surfaceFromData) {
            const code = surfaceAt(lookup, nr, nc);
            surfaceCode = code === 2 ? baseSurface : code;
          }
        }

        let step: number;
        if (model) {
          const table = surfaceCode === 1 ? 1 : 0;
          const slopeDeg = Math.atan(delta / run) / DEG;
          const gradientCost = model.gradient[table][tableIndex(model, slopeDeg)];
          const rollingCost = rugged > 0 ? model.rolling[table][tableIndex(model, rugged)] : 0;
          step = run * (gradientCost > rollingCost ? gradientCost : rollingCost);
        } else {
          const gradRatio = rise / run / maxTan;
          const ruggedRatio = lookup && lookup.maxRugged > 0 ? rugged / lookup.maxRugged : 0;
          const ratio = gradRatio > ruggedRatio ? gradRatio : ruggedRatio;
          step = run * (1 + options.slopeWeight * ratio * ratio);
        }
        const candidate = cost[node] + step;
        if (candidate < cost[next]) {
          cost[next] = candidate;
          parent[next] = node;
          heap.push(candidate + heuristic(nr, nc), next);
        }
      }
    }
  }

  if (!closed[goal]) return { status: 'unreachable', greatCircleM: straight, visited };

  return assembleResult(grid, frame, a, b, goal, parent, {
    straight,
    visited,
    options,
    lookup,
    blockedByRuggedness,
    baseSurface,
  });
}

// ---------- сборка результата ----------

interface AssembleContext {
  straight: number;
  visited: number;
  options: RouteOptions;
  lookup: HazardLookup | null;
  blockedByRuggedness: number;
  baseSurface: SurfaceCode;
}

function assembleResult(
  grid: HeightGrid,
  frame: GridFrame,
  a: LonLat,
  b: LonLat,
  goal: number,
  parent: Int32Array,
  ctx: AssembleContext,
): RouteResult {
  const { width } = grid;
  const cells: number[] = [];
  for (let node = goal; node !== -1; node = parent[node]) cells.push(node);
  cells.reverse();

  const path = cells.map((node) => {
    const row = Math.floor(node / width);
    const col = node % width;
    return { lat: latOfRow(frame, row), lon: lonOfCol(frame, col), h: grid.heights[node], row, col };
  });
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
  let sandM = 0;
  let unknownSurfaceM = 0;
  for (let i = 0; i < path.length; i++) {
    const { h, row, col, ...point } = path[i];
    let slope = 0;
    let run = 0;
    if (i > 0) {
      const previous = points[i - 1];
      run = greatCircleM(previous, point);
      const rise = h - previous.heightM;
      distance += run;
      slope = run > 0 ? Math.atan(Math.abs(rise) / run) / DEG : 0;
      if (rise > 0) ascent += rise;
      else descent -= rise;
      maxSlope = Math.max(maxSlope, slope);
    }
    minHeight = Math.min(minHeight, h);
    maxHeight = Math.max(maxHeight, h);
    const entry: RoutePoint = { ...point, heightM: h, distanceM: distance, slopeDeg: slope };
    if (ctx.lookup) {
      entry.ruggedSlopeDeg = ruggedAt(ctx.lookup, row, col);
      const code = ctx.lookup.surfaceFromData ? surfaceAt(ctx.lookup, row, col) : ctx.baseSurface;
      entry.surface = SURFACE_NAMES[code];
      if (run > 0 && entry.surface === 'sand') sandM += run;
      if (run > 0 && entry.surface === 'unknown') unknownSurfaceM += run;
    }
    points.push(entry);
  }

  return {
    status: 'ok',
    points,
    lengthM: distance,
    greatCircleM: ctx.straight,
    ascentM: ascent,
    descentM: descent,
    maxSlopeDeg: maxSlope,
    minHeightM: minHeight,
    maxHeightM: maxHeight,
    visited: ctx.visited,
    dataLevel: grid.dataLevel ?? 'orbital_overview',
    eva: evaTotals(points, ctx),
    hazard: ctx.lookup
      ? {
          blockedByRuggedness: ctx.blockedByRuggedness,
          maxRuggedSlopeDeg: ctx.lookup.maxRugged,
          surfaceFromData: ctx.lookup.surfaceFromData,
          sandM,
          unknownSurfaceM,
        }
      : undefined,
  };
}

function evaTotals(points: RoutePoint[], ctx: AssembleContext): RouteEvaTotals | undefined {
  if (ctx.options.costModel !== 'eva') return undefined;
  const base = ctx.options.traverse ?? DEFAULT_TRAVERSE;
  const perCell = Boolean(ctx.lookup && ctx.lookup.surfaceFromData);
  let seconds = 0;
  let o2LowL = 0;
  let o2HighL = 0;
  let outsideModelSegments = 0;
  for (let i = 1; i < points.length; i++) {
    const run = points[i].distanceM - points[i - 1].distanceM;
    if (run <= 0) continue;
    const rise = points[i].heightM - points[i - 1].heightM;
    const surface: Surface = perCell ? (points[i].surface === 'sand' ? 'sand' : 'firm') : base.surface;
    const segment = segmentCost(run, Math.atan(rise / run) / DEG, { ...base, surface });
    seconds += segment.seconds;
    o2LowL += segment.o2LowL;
    o2HighL += segment.o2HighL;
    if (segment.status !== 'ok') outsideModelSegments++;
  }
  return {
    seconds,
    o2LowL,
    o2HighL,
    outsideModelSegments,
    surface: perCell ? 'per_cell' : base.surface,
    crewKg: base.crewKg,
    loadKg: base.loadKg,
  };
}
