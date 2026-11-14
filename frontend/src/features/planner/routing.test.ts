// Тесты A* маршрутизации на синтетических сетках высот.
import { describe, expect, it } from 'vitest';

import { findRoute, greatCircleM, type HeightGrid } from './routing';

function grid(heightAt: (lon: number, lat: number) => number): HeightGrid {
  const width = 360;
  const height = 180;
  const heights = new Float32Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const lon = col + 0.5;
      heights[row * width + col] = heightAt(lon > 180 ? lon - 360 : lon, 90 - (row + 0.5));
    }
  }
  return { width, height, pixelsPerDegree: 1, heights };
}

describe('findRoute', () => {
  it('на ровной поверхности идёт почти по дуге большого круга', () => {
    const result = findRoute(grid(() => 0), { lon: 10.5, lat: 0.5 }, { lon: 40.5, lat: 20.5 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.lengthM).toBeGreaterThanOrEqual(result.greatCircleM * 0.99);
    expect(result.lengthM).toBeLessThan(result.greatCircleM * 1.1);
    expect(result.ascentM).toBe(0);
  });

  it('переходит через шов 0°/360°, а не огибает планету', () => {
    const result = findRoute(grid(() => 0), { lon: 175.5, lat: 0.5 }, { lon: -175.5, lat: 0.5 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.lengthM).toBeLessThan(greatCircleM({ lon: 0, lat: 0 }, { lon: 12, lat: 0 }));
  });

  it('обходит слишком крутую стену через проход', () => {
    const wall = grid((lon, lat) => (Math.abs(lon - 20) < 1 && Math.abs(lat - 30.5) > 1 ? 50_000 : 0));
    const result = findRoute(wall, { lon: 10.5, lat: 0.5 }, { lon: 30.5, lat: 0.5 }, { maxSlopeDeg: 15, slopeWeight: 3 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.maxHeightM).toBe(0);
    expect(result.points.some((p) => Math.abs(p.lat - 30.5) < 1.5 && Math.abs(p.lon - 20) < 1.5)).toBe(true);
  });

  it('сообщает о недостижимой цели вместо пути через обрыв', () => {
    const island = grid((lon, lat) => (Math.hypot(lon - 50, lat) < 5 ? 0 : -50_000));
    const result = findRoute(island, { lon: 50.5, lat: 0.5 }, { lon: 100.5, lat: 0.5 });
    expect(result.status).toBe('unreachable');
  });
});

describe('концы маршрута', () => {
  it('начинается точно в A и заканчивается точно в Б, даже внутри одной ячейки', () => {
    const a = { lon: 10.2, lat: 0.3 };
    const b = { lon: 10.7, lat: 0.8 };
    const result = findRoute(grid(() => 0), a, b);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.points[0]).toMatchObject(a);
    expect(result.points[result.points.length - 1]).toMatchObject(b);
    expect(result.lengthM).toBeCloseTo(greatCircleM(a, b), 0);
  });
});
