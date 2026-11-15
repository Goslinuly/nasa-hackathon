import { describe, expect, it } from 'vitest';
import { findPath, passableMask, routeLength, routeWalkTime, simplifyPath, type RouteGrid } from './gridRoute';

/** Сетка из строк: '.' — ровно, '#' — круто, '?' — нет данных. */
function grid(rows: string[]): RouteGrid {
  const width = rows[0].length;
  const height = rows.length;
  const slope = new Float32Array(width * height);
  rows.forEach((r, y) => [...r].forEach((ch, x) => (slope[y * width + x] = ch === '#' ? 40 : ch === '?' ? NaN : 2)));
  return { width, height, cellM: 1, slope };
}

describe('gridRoute', () => {
  it('находит путь по проходимым клеткам в обход стены', () => {
    const g = grid(['.....', '.###.', '.#...', '.#.#.', '...#.']);
    const mask = passableMask(g, 20);
    const p = findPath(g, mask, { col: 0, row: 0 }, { col: 2, row: 2 }, 20);
    expect(p).not.toBeNull();
    for (const c of p!) expect(mask[c.row * g.width + c.col]).toBe(1);
    expect(p![0]).toEqual({ col: 0, row: 0 });
    expect(p![p!.length - 1]).toEqual({ col: 2, row: 2 });
  });

  it('не протискивается по диагонали между двумя заблокированными клетками', () => {
    const g = grid(['.#', '#.']);
    const mask = passableMask(g, 20);
    expect(findPath(g, mask, { col: 0, row: 0 }, { col: 1, row: 1 }, 20)).toBeNull();
  });

  it('NoData непроходима, пути нет', () => {
    const g = grid(['.?.', '.?.', '.?.']);
    const mask = passableMask(g, 20);
    expect(findPath(g, mask, { col: 0, row: 1 }, { col: 2, row: 1 }, 20)).toBeNull();
  });

  it('порог крутизны меняет проходимость', () => {
    const g = grid(['.#.']);
    expect(findPath(g, passableMask(g, 20), { col: 0, row: 0 }, { col: 2, row: 0 }, 20)).toBeNull();
    expect(findPath(g, passableMask(g, 45), { col: 0, row: 0 }, { col: 2, row: 0 }, 45)).toHaveLength(3);
  });

  it('детерминирован и спрямляет прямой коридор до двух точек', () => {
    const g = grid(['......', '......', '......']);
    const mask = passableMask(g, 20);
    const a = findPath(g, mask, { col: 0, row: 0 }, { col: 5, row: 2 }, 20);
    const b = findPath(g, mask, { col: 0, row: 0 }, { col: 5, row: 2 }, 20);
    expect(a).toEqual(b);
    expect(simplifyPath(g, mask, a!)).toHaveLength(2);
  });

  it('спрямление не режет угол через стену', () => {
    const g = grid(['...', '##.', '...']);
    const mask = passableMask(g, 20);
    const p = findPath(g, mask, { col: 0, row: 0 }, { col: 0, row: 2 }, 20)!;
    const s = simplifyPath(g, mask, p);
    expect(s.length).toBeGreaterThan(2);
  });

  it('длина и время маршрута', () => {
    const pts = [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 40 }];
    expect(routeLength(pts)).toBeCloseTo(70);
    const time = routeWalkTime(pts, () => 0, () => 0.5);
    expect(time).toBeCloseTo(140);
  });
});
