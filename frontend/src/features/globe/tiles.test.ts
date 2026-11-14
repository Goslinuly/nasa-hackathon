import { describe, expect, it } from 'vitest';

import { ancestorRect, dataResolutionM, tileBounds, tileResolutionM } from './tiles';

describe('dataResolutionM', () => {
  it('не обещает разрешение лучше исходного продукта', () => {
    expect(tileResolutionM(8)).toBeLessThan(200);
    expect(dataResolutionM(200, 8)).toBe(200);
    expect(dataResolutionM(200, 3)).toBeCloseTo(tileResolutionM(3));
  });
});

describe('ancestorRect', () => {
  it('для того же уровня — весь тайл', () => {
    expect(ancestorRect(5, 7, 3, 5)).toEqual({ x: 7, y: 3, repeat: 1, offsetX: 0, offsetY: 0 });
  });

  it('северо-восточная четверть предка уровнем выше', () => {
    // Тайл (z=4, x=5, y=2) — правый верхний внутри (z=3, x=2, y=1); v=1 — север.
    expect(ancestorRect(4, 5, 2, 3)).toEqual({ x: 2, y: 1, repeat: 0.5, offsetX: 0.5, offsetY: 0.5 });
  });

  it('под-прямоугольник совпадает с границами тайла в градусах', () => {
    const child = tileBounds(6, 41, 13);
    const rect = ancestorRect(6, 41, 13, 3);
    const parent = tileBounds(3, rect.x, rect.y);
    const span = parent.east - parent.west;
    expect(parent.west + rect.offsetX * span).toBeCloseTo(child.west);
    expect(parent.south + rect.offsetY * span).toBeCloseTo(child.south);
    expect(rect.repeat * span).toBeCloseTo(child.east - child.west);
  });
});
