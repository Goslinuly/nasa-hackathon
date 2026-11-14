// Тесты A* маршрутизации на синтетических сетках высот.
import { describe, expect, it } from 'vitest';

import { segmentCost } from '@/shared/eva/traverse';

import { DEFAULT_ROUTE_OPTIONS, findRoute, greatCircleM, type HazardGrid, type HeightGrid } from './routing';

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

describe('маршрут по расходу выхода', () => {
  const evaOptions = {
    ...DEFAULT_ROUTE_OPTIONS,
    costModel: 'eva' as const,
    traverse: { surface: 'firm' as const, crewKg: 80, loadKg: 45 },
  };

  it('возвращает время и коридор кислорода', () => {
    const result = findRoute(grid(() => 0), { lon: 10.5, lat: 0.5 }, { lon: 14.5, lat: 0.5 }, evaOptions);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.eva).toBeDefined();
    const eva = result.eva!;
    expect(eva.seconds).toBeCloseTo(result.lengthM / 0.75, 0);
    expect(eva.o2LowL).toBeGreaterThan(0);
    expect(eva.o2HighL).toBeGreaterThan(eva.o2LowL);
    expect(eva.outsideModelSegments).toBe(0);
    expect(eva.surface).toBe('firm');
  });

  it('по умолчанию расход не считается: цена прежняя, в метрах', () => {
    const result = findRoute(grid(() => 0), { lon: 10.5, lat: 0.5 }, { lon: 14.5, lat: 0.5 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.eva).toBeUndefined();
  });

  it('песок дороже плотного грунта на том же пути', () => {
    const a = { lon: 10.5, lat: 0.5 };
    const b = { lon: 14.5, lat: 0.5 };
    const firm = findRoute(grid(() => 0), a, b, evaOptions);
    const sand = findRoute(grid(() => 0), a, b, { ...evaOptions, traverse: { ...evaOptions.traverse, surface: 'sand' } });
    expect(firm.status).toBe('ok');
    expect(sand.status).toBe('ok');
    if (firm.status !== 'ok' || sand.status !== 'ok') return;
    expect(sand.eva!.o2LowL).toBeGreaterThan(firm.eva!.o2LowL * 1.5);
    expect(sand.eva!.seconds).toBeCloseTo(firm.eva!.seconds, 0);
  });

  it('через крутой подъём не дороже, чем маршрут по расстоянию', () => {
    const ppd = 4;
    const width = 360 * ppd;
    const height = 180 * ppd;
    const heights = new Float32Array(width * height);
    for (let row = 0; row < height; row++) {
      const lat = 90 - (row + 0.5) / ppd;
      for (let col = 0; col < width; col++) {
        const lon = (col + 0.5) / ppd;
        heights[row * width + col] = lon > 21 && lon < 23 && lat > -3 && lat < 3 ? 3000 : 0;
      }
    }
    const ridge: HeightGrid = { width, height, pixelsPerDegree: ppd, heights };
    const a = { lon: 19.0, lat: 0.1 };
    const b = { lon: 25.0, lat: 0.1 };
    const byDistance = findRoute(ridge, a, b, { ...DEFAULT_ROUTE_OPTIONS, maxSlopeDeg: 20 });
    const byEva = findRoute(ridge, a, b, { ...evaOptions, maxSlopeDeg: 20 });
    expect(byDistance.status).toBe('ok');
    expect(byEva.status).toBe('ok');
    if (byDistance.status !== 'ok' || byEva.status !== 'ok') return;

    const oxygenOf = (points: typeof byDistance.points) => {
      let litres = 0;
      for (let i = 1; i < points.length; i++) {
        const run = points[i].distanceM - points[i - 1].distanceM;
        if (run <= 0) continue;
        const rise = points[i].heightM - points[i - 1].heightM;
        litres += segmentCost(run, (Math.atan(rise / run) * 180) / Math.PI, evaOptions.traverse).o2MidL;
      }
      return litres;
    };
    // На сетке MOLA ~7 км/пикс уклоны пологие, поэтому геометрия часто совпадает;
    // гарантируется лишь то, что путь по модели не дороже пути по расстоянию.
    expect(oxygenOf(byEva.points)).toBeLessThanOrEqual(oxygenOf(byDistance.points) * 1.000001);
    expect(byEva.eva!.o2LowL).toBeLessThan(byEva.eva!.o2HighL);
  });

  it('тяжёлый груз не меняет время, но поднимает расход кислорода', () => {
    const a = { lon: 10.5, lat: 0.5 };
    const b = { lon: 14.5, lat: 0.5 };
    const light = findRoute(grid(() => 0), a, b, { ...evaOptions, traverse: { surface: 'firm', crewKg: 80, loadKg: 10 } });
    const heavy = findRoute(grid(() => 0), a, b, { ...evaOptions, traverse: { surface: 'firm', crewKg: 80, loadKg: 60 } });
    if (light.status !== 'ok' || heavy.status !== 'ok') return;
    expect(heavy.eva!.o2LowL).toBeGreaterThan(light.eva!.o2LowL);
    expect(heavy.eva!.seconds).toBeCloseTo(light.eva!.seconds, 0);
  });
});

describe('окно детального рельефа', () => {
  function windowGrid(): HeightGrid {
    const width = 100;
    const height = 80;
    const heights = new Float32Array(width * height);
    for (let i = 0; i < heights.length; i++) heights[i] = 0;
    return { width, height, pixelsPerDegree: 40, heights, lonWestDeg: 20, latNorthDeg: 10, dataLevel: 'local_dtm' };
  }

  it('строит маршрут внутри окна и помечает уровень данных', () => {
    const result = findRoute(windowGrid(), { lon: 20.2, lat: 9.8 }, { lon: 22.0, lat: 8.5 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.dataLevel).toBe('local_dtm');
    expect(result.lengthM).toBeGreaterThan(0);
  });

  it('точка вне окна даёт понятную ошибку', () => {
    const result = findRoute(windowGrid(), { lon: 20.2, lat: 9.8 }, { lon: 50, lat: 0 });
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') return;
    expect(result.reason).toContain('вне участка');
  });

  it('область NoData не проходится и не выбирается стартом', () => {
    const grid = windowGrid();
    for (let row = 0; row < grid.height; row++) {
      for (let col = 40; col < 44; col++) grid.heights[row * grid.width + col] = NaN;
    }
    const across = findRoute(grid, { lon: 20.2, lat: 9.8 }, { lon: 22.2, lat: 9.8 });
    expect(across.status).toBe('unreachable');
    const from = findRoute(grid, { lon: 21.02, lat: 9.8 }, { lon: 20.2, lat: 9.8 });
    expect(from.status).toBe('invalid');
  });
});

describe('сетка проходимости', () => {
  function hazardOf(fill: (lon: number, lat: number) => { rugged: number; ti: number }): HazardGrid {
    const ppd = 1;
    const width = 360;
    const height = 180;
    const ruggedSlope = new Uint8Array(width * height);
    const inertia = new Uint8Array(width * height);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const lon = col + 0.5;
        const lat = 90 - (row + 0.5);
        const cell = fill(lon, lat);
        ruggedSlope[row * width + col] = Math.round(cell.rugged / 0.125);
        inertia[row * width + col] = Math.round(cell.ti / 8);
      }
    }
    return { width, height, pixelsPerDegree: ppd, ruggedSlope, slopeStepDeg: 0.125, inertia, inertiaStep: 8, sandBelowTiu: 150 };
  }

  const evaOptions = {
    ...DEFAULT_ROUTE_OPTIONS,
    costModel: 'eva' as const,
    traverse: { surface: 'firm' as const, crewKg: 80, loadKg: 45 },
  };

  it('изрезанные ячейки запрещаются и путь ищет обход', () => {
    const hazard = hazardOf((lon, lat) => ({
      rugged: lon > 20 && lon < 22 && lat > -4 && lat < 4 ? 25 : 2,
      ti: 300,
    }));
    const flat = grid(() => 0);
    const blockedRoute = findRoute(flat, { lon: 17.5, lat: 0.5 }, { lon: 25.5, lat: 0.5 }, evaOptions, hazard);
    expect(blockedRoute.status).toBe('ok');
    if (blockedRoute.status !== 'ok') return;
    expect(blockedRoute.hazard!.blockedByRuggedness).toBeGreaterThan(0);
    const detoured = blockedRoute.points.some((p) => Math.abs(p.lat) > 4);
    expect(detoured).toBe(true);
  });

  it('грунт по тепловой инерции: песок удорожает путь и считается по метрам', () => {
    const sandBelt = hazardOf((lon) => ({ rugged: 1, ti: lon > 12 && lon < 14 ? 80 : 400 }));
    const noSand = hazardOf(() => ({ rugged: 1, ti: 400 }));
    const flat = grid(() => 0);
    const a = { lon: 10.5, lat: 0.5 };
    const b = { lon: 15.5, lat: 0.5 };
    const withSand = findRoute(flat, a, b, evaOptions, sandBelt);
    const withoutSand = findRoute(flat, a, b, evaOptions, noSand);
    expect(withSand.status).toBe('ok');
    expect(withoutSand.status).toBe('ok');
    if (withSand.status !== 'ok' || withoutSand.status !== 'ok') return;
    expect(withSand.eva!.surface).toBe('per_cell');
    expect(withSand.hazard!.sandM).toBeGreaterThan(0);
    expect(withoutSand.hazard!.sandM).toBe(0);
    expect(withSand.eva!.o2LowL).toBeGreaterThan(withoutSand.eva!.o2LowL);
  });

  it('перекаты изрезанности дорожают даже без запрета', () => {
    const rolling = hazardOf((lon) => ({ rugged: lon > 12 && lon < 14 ? 12 : 0, ti: 400 }));
    const smooth = hazardOf(() => ({ rugged: 0, ti: 400 }));
    const flat = grid(() => 0);
    const a = { lon: 10.5, lat: 0.5 };
    const b = { lon: 15.5, lat: 0.5 };
    const rough = findRoute(flat, a, b, { ...evaOptions, maxRuggedSlopeDeg: 20 }, rolling);
    const plain = findRoute(flat, a, b, { ...evaOptions, maxRuggedSlopeDeg: 20 }, smooth);
    if (rough.status !== 'ok' || plain.status !== 'ok') return;
    expect(rough.eva!.o2LowL).toBeGreaterThanOrEqual(plain.eva!.o2LowL);
    expect(rough.points.some((p) => (p.ruggedSlopeDeg ?? 0) > 10)).toBe(true);
  });
});
