// Тесты диспетчеризации запроса маршрута: старая форма a/b, остановки, выбор сетки.

import { describe, expect, it } from 'vitest';

import { computeRoute } from './routeRequest';
import { DEFAULT_ROUTE_OPTIONS, type HeightGrid } from './routing';

function flat(ppd: number, extra: Partial<HeightGrid> = {}): HeightGrid {
  const width = Math.round(360 * ppd);
  const height = Math.round(180 * ppd);
  return { width, height, pixelsPerDegree: ppd, heights: new Float32Array(width * height), ...extra };
}

const A = { lon: 10.5, lat: 0.5 };
const B = { lon: 12.5, lat: 1.5 };
const C = { lon: 14.5, lat: 0.5 };
const base = { type: 'route' as const, id: 1, options: DEFAULT_ROUTE_OPTIONS };

describe('computeRoute', () => {
  it('старая форма a/b работает как stops=[a,b]', () => {
    const r = computeRoute({ ...base, a: A, b: B }, flat(1), undefined, null);
    expect(r.result.status).toBe('ok');
    expect(r.multi).toBeUndefined();
  });

  it('больше двух остановок возвращает сшитый маршрут и stopIndices', () => {
    const r = computeRoute({ ...base, stops: [A, B, C] }, flat(1), undefined, null);
    expect(r.result.status).toBe('ok');
    expect(r.multi?.stopIndices).toHaveLength(3);
  });

  it('useLocal без локальной сетки считает по глобальной', () => {
    const r = computeRoute({ ...base, stops: [A, B], useLocal: true }, flat(1), undefined, null);
    expect(r.result.status).toBe('ok');
  });

  it('useLocal с локальной сеткой: точка вне окна — invalid', () => {
    const local = flat(1, { width: 5, height: 5, heights: new Float32Array(25), lonWestDeg: 100, latNorthDeg: 5, dataLevel: 'local_dtm' });
    const r = computeRoute({ ...base, stops: [A, B], useLocal: true }, flat(1), undefined, local);
    expect(r.result.status).toBe('invalid');
  });

  it('меньше двух точек — invalid', () => {
    expect(computeRoute({ ...base, stops: [A] }, flat(1), undefined, null).result.status).toBe('invalid');
  });
});
