// Тесты закраски пикселей без данных.
import { describe, expect, it } from 'vitest';

import { SPECTRA } from './layers';
import { FALLBACK_BRIGHTNESS, NO_DATA_GLSL, composeNoData, muteFallback } from './noData';

describe('пиксели без данных', () => {
  it('непрозрачный пиксель слоя не меняется', () => {
    expect(composeNoData([0.2, 0.5, 0.9], 1, [1, 0, 0], 1)).toEqual([0.2, 0.5, 0.9]);
  });

  it('прозрачный пиксель берёт приглушённый запасной слой, а не чёрный', () => {
    const out = composeNoData([0, 0, 0], 0, [0.6, 0.3, 0.2], 1);
    expect(out).toEqual(muteFallback([0.6, 0.3, 0.2]));
    expect(Math.max(...out)).toBeGreaterThan(0.1);
  });

  it('край данных после фильтрации смешивается без тёмной каймы', () => {
    const grey: [number, number, number] = [0.5, 0.5, 0.5];
    const data = 0.5;
    // Половина пикселя с данными: RGB уже умножен на альфу.
    const out = composeNoData([data * 0.5, data * 0.5, data * 0.5], 0.5, grey, 1);
    const muted = 0.5 * FALLBACK_BRIGHTNESS;
    out.forEach((c) => expect(c).toBeCloseTo(data * 0.5 + muted * 0.5, 9));
  });

  it('пока запасной тайл не загрузился, ничего не подмешивается', () => {
    expect(composeNoData([0, 0, 0], 0, [1, 1, 1], 0)).toEqual([0, 0, 0]);
  });

  it('запасной слой приглушён: серый темнее, цвет бледнее', () => {
    const [r, g, b] = muteFallback([1, 0, 0]);
    expect(r).toBeLessThan(1);
    expect(g).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
  });

  it('шейдер использует те же униформы, что заводит движок', () => {
    for (const name of ['uFallbackMap', 'uFallbackRect', 'uFallbackStrength', 'vTileUv', 'diffuseColor']) {
      expect(NO_DATA_GLSL).toContain(name);
    }
  });

  it('у слоёв в PNG (с прозрачностью) есть запасной слой без собственных дыр', () => {
    for (const layer of Object.values(SPECTRA)) {
      if (layer.color.ext !== 'png') continue;
      expect(layer.fallback, layer.id).toBeDefined();
      expect(SPECTRA[layer.fallback!].color.ext, layer.id).toBe('jpg');
    }
  });
});
