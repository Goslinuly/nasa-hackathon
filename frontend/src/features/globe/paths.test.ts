import { describe, expect, it } from 'vitest';

import { densifyPath } from './paths';

describe('densifyPath', () => {
  it('не трогает короткие отрезки', () => {
    const points = [
      { lon: 137.38, lat: -4.79 },
      { lon: 137.39, lat: -4.8 },
    ];
    expect(densifyPath(points, 0.5)).toEqual(points);
  });

  it('добавляет точки на длинном отрезке и сохраняет концы', () => {
    const out = densifyPath([{ lon: 0, lat: 0 }, { lon: 10, lat: 0 }], 1);
    expect(out).toHaveLength(11);
    expect(out[0]).toEqual({ lon: 0, lat: 0 });
    expect(out[10]).toEqual({ lon: 10, lat: 0 });
    expect(out[5].lon).toBeCloseTo(5, 6);
    expect(out[5].lat).toBeCloseTo(0, 6);
  });

  it('идёт по дуге большого круга через полюс', () => {
    const out = densifyPath([{ lon: 0, lat: 80 }, { lon: 180, lat: 80 }], 5);
    const top = Math.max(...out.map((p) => p.lat));
    expect(top).toBeGreaterThan(85);
  });

  it('пропускает нечисловые точки', () => {
    expect(densifyPath([{ lon: NaN, lat: 0 }, { lon: 1, lat: 1 }], 1)).toEqual([{ lon: 1, lat: 1 }]);
  });
});
