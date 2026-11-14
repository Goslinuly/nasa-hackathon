// Тесты загрузки слоёв проходимости: разбор манифеста, сборка HazardGrid, выборки по пикселям.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildHazardGrid, loadHazardGrid, parseHazardManifest, ruggedSlopeAt, thermalInertiaAt } from './hazard';

vi.mock('@/features/walk/png', () => ({
  decodePng: vi.fn(async (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf);
    return { width: 4, height: 2, channels: bytes.length === 8 ? 1 : 3, data: bytes };
  }),
}));

const MANIFEST = {
  pixels_per_degree: 1,
  slope: { file: 'slope.png', width: 4, height: 2, step: 0.5 },
  thermal_inertia: { file: 'thermal_inertia.png', width: 4, height: 2, step: 8 },
  surface_from_inertia: { sand_below: 150 },
  credit: 'тест',
};

afterEach(() => vi.unstubAllGlobals());

function stubFetch(slopeBytes: Uint8Array, inertiaBytes: Uint8Array, manifest: unknown = MANIFEST) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('hazard.json')) return { ok: true, json: async () => manifest };
      const bytes = url.endsWith('slope.png') ? slopeBytes : inertiaBytes;
      return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    }),
  );
}

describe('parseHazardManifest', () => {
  it('принимает корректный манифест и отвергает неполный', () => {
    expect(parseHazardManifest(MANIFEST)).not.toBeNull();
    expect(parseHazardManifest({ ...MANIFEST, slope: { file: 'x' } })).toBeNull();
    expect(parseHazardManifest(null)).toBeNull();
  });
});

describe('выборки', () => {
  const grid = buildHazardGrid(
    MANIFEST,
    new Uint8Array([0, 2, 4, 6, 8, 10, 12, 14]),
    new Uint8Array([0, 10, 20, 30, 40, 50, 60, 70]),
  );

  it('ruggedSlopeAt: байт × шаг; строка 0 — север, столбцы на восток от 0° в. д.', () => {
    expect(ruggedSlopeAt(grid, 1.5, 89.5)).toBe(1);
    expect(ruggedSlopeAt(grid, 2.5, 88.5)).toBe(6);
    expect(ruggedSlopeAt(grid, -357.5, 88.5)).toBe(6);
  });

  it('thermalInertiaAt: 0 — нет данных, иначе байт × шаг', () => {
    expect(thermalInertiaAt(grid, 0.5, 89.5)).toBeNull();
    expect(thermalInertiaAt(grid, 3.5, 88.5)).toBe(70 * 8);
  });

  it('вне широт — null', () => {
    expect(ruggedSlopeAt(grid, 0, 95)).toBeNull();
  });
});

describe('loadHazardGrid', () => {
  it('собирает сетку из серых PNG (1 канал)', async () => {
    stubFetch(new Uint8Array([0, 2, 4, 6, 8, 10, 12, 14]), new Uint8Array([0, 10, 20, 30, 40, 50, 60, 70]));
    const bundle = await loadHazardGrid();
    expect(bundle?.grid.sandBelowTiu).toBe(150);
    expect(bundle?.grid.slopeStepDeg).toBe(0.5);
    expect(bundle?.grid.ruggedSlope[3]).toBe(6);
  });

  it('берёт первый канал у RGB-PNG', async () => {
    const rgb = new Uint8Array(24);
    for (let i = 0; i < 8; i++) rgb[i * 3] = i + 1;
    stubFetch(rgb, rgb);
    const bundle = await loadHazardGrid();
    expect(Array.from(bundle?.grid.inertia ?? [])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('null при сетевой ошибке и при кривом манифесте', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await loadHazardGrid()).toBeNull();
    stubFetch(new Uint8Array(8), new Uint8Array(8), { pixels_per_degree: 1 });
    expect(await loadHazardGrid()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await loadHazardGrid()).toBeNull();
  });
});
