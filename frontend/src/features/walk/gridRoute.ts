// Свой маршрут по локальному DTM: A* на грубой сетке (8 соседей), спрямление и оценка
// длины и времени пешком. Чистые функции, без three.js.

export interface RouteGrid {
  width: number;
  height: number;
  /** Шаг клетки, м. */
  cellM: number;
  /** Крутизна в центре клетки, градусы; NaN — нет данных. */
  slope: Float32Array;
}

export interface Cell {
  col: number;
  row: number;
}

/** Клетка проходима: есть данные и крутизна не выше порога. */
export function passableMask(g: RouteGrid, maxSlopeDeg: number): Uint8Array {
  const m = new Uint8Array(g.width * g.height);
  for (let i = 0; i < m.length; i++) {
    const s = g.slope[i];
    m[i] = Number.isFinite(s) && s <= maxSlopeDeg ? 1 : 0;
  }
  return m;
}

/** Ближайшая проходимая клетка в радиусе radius клеток (по кольцам), иначе null. */
export function nearestPassable(g: RouteGrid, mask: Uint8Array, c: Cell, radius: number): Cell | null {
  for (let r = 0; r <= radius; r++) {
    let best: Cell | null = null;
    let bestD = Infinity;
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue;
        const col = c.col + dc;
        const row = c.row + dr;
        if (col < 0 || row < 0 || col >= g.width || row >= g.height || !mask[row * g.width + col]) continue;
        const d = dc * dc + dr * dr;
        if (d < bestD) {
          bestD = d;
          best = { col, row };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** Штраф за крутизну: на ровном 1, у порога 3. */
export function slopePenalty(slopeDeg: number, maxSlopeDeg: number): number {
  const k = Math.max(0, slopeDeg) / Math.max(1, maxSlopeDeg);
  return 1 + 2 * k * k;
}

/**
 * A*: стоимость шага = расстояние × штраф крутизны клетки, куда шагаем.
 * Диагональ запрещена, если хоть одна из двух боковых клеток непроходима
 * (не срезаем угол и не протискиваемся между блоками). Старт считается проходимым.
 * Возвращает клетки от старта до цели или null.
 */
export function findPath(g: RouteGrid, mask: Uint8Array, start: Cell, goal: Cell, maxSlopeDeg: number, maxNodes = 4_000_000): Cell[] | null {
  const { width: w, height: h, cellM } = g;
  const n = w * h;
  const inside = (c: Cell) => c.col >= 0 && c.row >= 0 && c.col < w && c.row < h;
  if (!inside(start) || !inside(goal)) return null;
  const s = start.row * w + start.col;
  const t = goal.row * w + goal.col;
  if (!mask[t]) return null;
  const open = (i: number) => i === s || mask[i] === 1;
  const gCost = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();
  const hEst = (i: number) => {
    const dc = Math.abs((i % w) - goal.col);
    const dr = Math.abs(((i / w) | 0) - goal.row);
    return cellM * (Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr));
  };
  gCost[s] = 0;
  heap.push(s, hEst(s));
  let expanded = 0;
  while (heap.size) {
    const i = heap.pop();
    if (closed[i]) continue;
    if (i === t) break;
    closed[i] = 1;
    if (++expanded > maxNodes) return null;
    const col = i % w;
    const row = (i / w) | 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const c2 = col + dc;
        const r2 = row + dr;
        if (c2 < 0 || r2 < 0 || c2 >= w || r2 >= h) continue;
        const j = r2 * w + c2;
        if (closed[j] || !open(j)) continue;
        if (dr && dc && (!open(row * w + c2) || !open(r2 * w + col))) continue;
        const step = (dr && dc ? Math.SQRT2 : 1) * cellM * slopePenalty(g.slope[j], maxSlopeDeg);
        const ng = gCost[i] + step;
        if (ng < gCost[j]) {
          gCost[j] = ng;
          parent[j] = i;
          heap.push(j, ng + hEst(j));
        }
      }
    }
  }
  if (!Number.isFinite(gCost[t])) return null;
  const out: Cell[] = [];
  for (let i = t; i !== -1; i = parent[i]) out.push({ col: i % w, row: (i / w) | 0 });
  return out.reverse();
}

/** Отрезок между центрами клеток проходит только по проходимым клеткам (шаг ¼ клетки). */
export function lineClear(g: RouteGrid, mask: Uint8Array, a: Cell, b: Cell): boolean {
  const d = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
  const n = Math.max(1, Math.ceil(d * 4));
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    const col = Math.round(a.col + (b.col - a.col) * u);
    const row = Math.round(a.row + (b.row - a.row) * u);
    const i = row * g.width + col;
    if (!mask[i] && !(col === a.col && row === a.row)) return false;
  }
  return true;
}

/** Спрямление: от каждой опорной клетки тянемся вперёд, пока прямая свободна. */
export function simplifyPath(g: RouteGrid, mask: Uint8Array, path: Cell[]): Cell[] {
  if (path.length <= 2) return path.slice();
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = i + 1;
    while (j + 1 < path.length && lineClear(g, mask, path[i], path[j + 1])) j++;
    out.push(path[j]);
    i = j;
  }
  return out;
}

export interface XZ {
  x: number;
  z: number;
}

/** Длина ломаной в плане, м. */
export function routeLength(pts: XZ[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return s;
}

/**
 * Время пешком, с: ломаная режется на куски ≤ stepM, скорость по уклону вдоль куска.
 * Куски без данных идут с минимальной скоростью модели (speed(NaN)).
 */
export function routeWalkTime(pts: XZ[], heightAt: (x: number, z: number) => number, speed: (slopeDeg: number) => number, stepM = 2): number {
  let time = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / stepM));
    let h0 = heightAt(a.x, a.z);
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const h1 = heightAt(a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u);
      const d = len / n;
      const slope = Number.isFinite(h0) && Number.isFinite(h1) && d > 0 ? (Math.atan2(h1 - h0, d) * 180) / Math.PI : NaN;
      const dz = Number.isFinite(h0) && Number.isFinite(h1) ? h1 - h0 : 0;
      time += Math.hypot(d, dz) / speed(slope);
      h0 = h1;
    }
  }
  return time;
}

/** Двоичная куча по приоритету; при равенстве — меньший индекс (детерминированно). */
class MinHeap {
  private ids: number[] = [];
  private pr: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  private less(a: number, b: number): boolean {
    return this.pr[a] < this.pr[b] || (this.pr[a] === this.pr[b] && this.ids[a] < this.ids[b]);
  }
  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.pr[a], this.pr[b]] = [this.pr[b], this.pr[a]];
  }
  push(id: number, p: number): void {
    this.ids.push(id);
    this.pr.push(p);
    let i = this.ids.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (!this.less(i, up)) break;
      this.swap(i, up);
      i = up;
    }
  }
  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastP = this.pr.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.pr[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.less(l, m)) m = l;
        if (r < this.ids.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}
