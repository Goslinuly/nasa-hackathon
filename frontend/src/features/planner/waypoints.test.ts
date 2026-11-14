// Тесты сшивки маршрута через промежуточные точки.

import { describe, expect, it } from 'vitest';

import { DEFAULT_ROUTE_OPTIONS, type HeightGrid } from './routing';
import { findRouteThrough } from './waypoints';

function flatGrid(): HeightGrid {
  const width = 360;
  const height = 180;
  return { width, height, pixelsPerDegree: 1, heights: new Float32Array(width * height) };
}

const EVA = {
  ...DEFAULT_ROUTE_OPTIONS,
  costModel: 'eva' as const,
  traverse: { surface: 'firm' as const, crewKg: 80, loadKg: 45 },
};

describe('findRouteThrough', () => {
  it('сшивает ноги в непрерывный маршрут с нарастающей дистанцией', () => {
    const stops = [
      { lon: 10.5, lat: 0.5 },
      { lon: 13.5, lat: 2.5 },
      { lon: 16.5, lat: 0.5 },
    ];
    const result = findRouteThrough(flatGrid(), stops, EVA);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.legs).toHaveLength(2);
    expect(result.stopIndices).toHaveLength(3);
    const { points } = result.route;
    for (let i = 1; i < points.length; i++) {
      expect(points[i].distanceM).toBeGreaterThanOrEqual(points[i - 1].distanceM);
    }
    expect(result.route.lengthM).toBeCloseTo(result.legs[0].lengthM + result.legs[1].lengthM, 6);
    expect(result.route.eva!.seconds).toBeCloseTo(result.legs[0].eva!.seconds + result.legs[1].eva!.seconds, 6);
    const middle = points[result.stopIndices[1]];
    expect(middle.lat).toBeCloseTo(2.5, 6);
    expect(middle.lon).toBeCloseTo(13.5, 6);
  });

  it('два стопа эквивалентны обычному маршруту', () => {
    const result = findRouteThrough(flatGrid(), [{ lon: 10.5, lat: 0.5 }, { lon: 14.5, lat: 0.5 }], EVA);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.legs).toHaveLength(1);
    expect(result.route.lengthM).toBeCloseTo(result.legs[0].lengthM, 9);
  });

  it('непроходимая нога называет себя и сохраняет пройденные', () => {
    const grid = flatGrid();
    const result = findRouteThrough(grid, [
      { lon: 10.5, lat: 0.5 },
      { lon: 12.5, lat: 0.5 },
      { lon: 50, lat: 95 },
    ], EVA);
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.legIndex).toBe(1);
    expect(result.completed).toHaveLength(1);
  });

  it('меньше двух точек — честная ошибка', () => {
    const result = findRouteThrough(flatGrid(), [{ lon: 10, lat: 0 }], EVA);
    expect(result.status).toBe('failed');
  });
});
