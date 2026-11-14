import { describe, expect, it } from 'vitest';

import {
  formatMarsPoint,
  makeMarsPoint,
  normalizeLongitudeEast,
  signedLongitudeDelta,
} from './mars';

describe('normalizeLongitudeEast', () => {
  it('оставляет нормализованную долготу', () => {
    expect(normalizeLongitudeEast(77.43)).toBeCloseTo(77.43, 10);
  });

  it('переводит отрицательную долготу', () => {
    expect(normalizeLongitudeEast(-90)).toBe(270);
  });

  it('-180 и 180 — один меридиан', () => {
    expect(normalizeLongitudeEast(-180)).toBe(normalizeLongitudeEast(180));
  });

  it('360 сворачивается в 0 без -0', () => {
    expect(normalizeLongitudeEast(360)).toBe(0);
    expect(Object.is(normalizeLongitudeEast(-360), -0)).toBe(false);
  });
});

describe('signedLongitudeDelta', () => {
  it('через шов 359° -> 1° даёт +2°', () => {
    expect(signedLongitudeDelta(359, 1)).toBeCloseTo(2, 10);
    expect(signedLongitudeDelta(1, 359)).toBeCloseTo(-2, 10);
  });
});

describe('makeMarsPoint', () => {
  it('нормализует долготу и помечает тело', () => {
    const point = makeMarsPoint(18.44, -282.57);
    expect(point.body).toBe('Mars');
    expect(point.longitude_deg).toBeCloseTo(77.43, 10);
  });

  it('отклоняет широту вне диапазона', () => {
    expect(() => makeMarsPoint(91, 0)).toThrow(RangeError);
  });
});

describe('formatMarsPoint', () => {
  it('показывает полушарие широты и восточную долготу', () => {
    expect(formatMarsPoint(makeMarsPoint(-4.5, 137.4))).toBe('4.50°S, 137.40°E');
  });
});
