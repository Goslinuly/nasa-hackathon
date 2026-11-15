import { describe, expect, it } from 'vitest';

import { buildTrackPath, headingAlong, nearestOnPath, pointAt } from './trackPath';

// Г-образный путь: 10 м на север (−Z), затем 10 м на восток (+X).
const path = buildTrackPath([
  { x: 0, z: 0 },
  { x: 0, z: -10 },
  { x: 0, z: -10 },
  { x: 10, z: -10 },
]);

describe('трек ровера как путь', () => {
  it('длина вдоль пути и дубли точек', () => {
    expect(path.pts).toHaveLength(3);
    expect(path.length).toBeCloseTo(20);
  });

  it('ближайшая точка: дистанция вдоль пути и расстояние до него', () => {
    const n = nearestOnPath(path, 2, -5);
    expect(n.s).toBeCloseTo(5);
    expect(n.dist).toBeCloseTo(2);
    const m = nearestOnPath(path, 4, -12);
    expect(m.s).toBeCloseTo(14);
    expect(m.dist).toBeCloseTo(2);
  });

  it('точка на дистанции ограничена концами пути', () => {
    expect(pointAt(path, 15)).toMatchObject({ x: 5, z: -10 });
    expect(pointAt(path, -3)).toMatchObject({ x: 0, z: 0 });
    expect(pointAt(path, 99)).toMatchObject({ x: 10, z: -10 });
  });

  it('курс: вперёд сцены (−Z) на первом отрезке, на восток (+X) на втором', () => {
    const north = headingAlong(path, 1, 2);
    expect(-Math.sin(north)).toBeCloseTo(0);
    expect(-Math.cos(north)).toBeCloseTo(-1);
    const east = headingAlong(path, 12, 2);
    expect(-Math.sin(east)).toBeCloseTo(1);
    expect(-Math.cos(east)).toBeCloseTo(0);
  });
});
