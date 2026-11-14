// Тесты декодирования и выборки карты высот.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HeightField, decodeHeights, loadHeightField, type HeightmapMeta } from './terrain';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('heightmap transport failures', () => {
  it('reports missing metadata before attempting image decode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(loadHeightField()).rejects.toThrow('HTTP 404');
  });
  it('rejects the SPA HTML fallback even when HTTP is 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } })));
    await expect(loadHeightField()).rejects.toThrow('не JSON');
  });
  it('ends stalled network requests with an actionable timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)))));
    const result = expect(loadHeightField()).rejects.toThrow('30 секунд');
    await vi.advanceTimersByTimeAsync(30000);
    await result;
  });
});

function meta(width: number, height: number): HeightmapMeta {
  return {
    offset_units: 8192,
    step_m: 4,
    width,
    height,
    pixels_per_degree: width / 360,
    first_row_north_edge_lat: 90,
    first_column_west_edge_lon_east: 0,
    min_m: 0,
    max_m: 0,
    source: { product_id: 'TEST', credit: 'test' },
  };
}

function rgba(units: number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(units.length * 4);
  units.forEach((u, i) => {
    data[i * 4] = u >> 8;
    data[i * 4 + 1] = u & 0xff;
    data[i * 4 + 3] = 255;
  });
  return data;
}

describe('decodeHeights', () => {
  it('восстанавливает отрицательные и положительные высоты', () => {
    const heights = decodeHeights(rgba([8192 - 2034, 8192, 8192 + 5290, 8192 + 1]), meta(4, 1));
    expect(Array.from(heights)).toEqual([-8136, 0, 21160, 4]);
  });

  it('отвергает изображение, испорченное цветокоррекцией', () => {
    const data = rgba([8192, 8192]);
    data[2] = 3;
    expect(() => decodeHeights(data, meta(2, 1))).toThrow();
  });
});

describe('HeightField.sample', () => {
  const field = new HeightField(meta(4, 2), new Float32Array([0, 100, 200, 300, 1000, 1100, 1200, 1300]));

  it('попадает в центр пикселя', () => {
    expect(field.sample(135, 45)).toBeCloseTo(100);
    expect(field.sample(315, -45)).toBeCloseTo(1300);
  });

  it('принимает долготу ±180 так же, как 0–360', () => {
    expect(field.sample(-45, 45)).toBeCloseTo(field.sample(315, 45));
    expect(field.sample(-135, -45)).toBeCloseTo(1200);
  });

  it('интерполирует через шов 0°/360°', () => {
    expect(field.sample(0, 45)).toBeCloseTo(150);
    expect(field.sample(360, 45)).toBeCloseTo(150);
  });

  it('не выходит за полюса', () => {
    expect(field.sample(45, 90)).toBeCloseTo(0);
    expect(field.sample(45, -90)).toBeCloseTo(1000);
  });
});
