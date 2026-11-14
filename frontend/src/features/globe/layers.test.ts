// Тесты каталога слоёв глобуса.
import { describe, expect, it } from 'vitest';

import {
  CTX_REGION_BOUNDS,
  MERCATOR_MAX_LAT,
  SPECTRA,
  ctxTileUrl,
  lonLatToMercatorTile,
  mercatorRowLat,
  mercatorTileBounds,
  trekTileUrl,
} from './layers';

describe('Web Mercator', () => {
  it('край сетки — ±85.05°, экватор посередине', () => {
    expect(mercatorRowLat(3, 0)).toBeCloseTo(MERCATOR_MAX_LAT, 5);
    expect(mercatorRowLat(3, 4)).toBeCloseTo(0, 9);
    expect(mercatorRowLat(3, 8)).toBeCloseTo(-MERCATOR_MAX_LAT, 5);
  });

  it('точка попадает в свой тайл', () => {
    for (const [lon, lat] of [[77.45, 18.44], [-134, 18.5], [137.4, -4.6], [179.9, -60]]) {
      const { x, y } = lonLatToMercatorTile(12, lon, lat);
      const b = mercatorTileBounds(12, x, y);
      expect(lon).toBeGreaterThanOrEqual(b.west);
      expect(lon).toBeLessThan(b.east);
      expect(lat).toBeGreaterThanOrEqual(b.south);
      expect(lat).toBeLessThan(b.north);
    }
  });

  it('адрес CTX в TMS: строки от юга', () => {
    expect(ctxTileUrl('E000_E016_N08_N20', 1, 1, 0)).toBe('/ctx/E000_E016_N08_N20/1/1/1.png');
  });
});

describe('регионы CTX', () => {
  it('покрывают планету ячейками 20°×16° без пропусков по долготе', () => {
    expect(CTX_REGION_BOUNDS).toHaveLength(198);
    const equator = CTX_REGION_BOUNDS.filter((r) => r.bounds.south <= 0 && r.bounds.north > 0);
    expect(equator).toHaveLength(18);
    const jezero = CTX_REGION_BOUNDS.find((r) => r.name === 'E060_E076_N08_N20')!;
    expect(jezero.bounds).toEqual({ west: 60, east: 80, south: 8, north: 24 });
  });
});

const NEW_SPECTRA = ['tes-albedo', 'tes-dust', 'tes-inertia', 'tes-pyroxene', 'tes-plagioclase', 'tes-silicates'] as const;

describe('спектры TES', () => {
  it.each(NEW_SPECTRA)('%s: тайл Trek WMTS, кредит и подпись вида данных', (id) => {
    const layer = SPECTRA[id];
    expect(trekTileUrl(layer.color, 1, 2, 0)).toMatch(
      /^\/trek\/Mars\/EQ\/[\w-]+\/1\.0\.0\/default\/default028mm\/1\/0\/2\.png$/,
    );
    expect(layer.credit).toMatch(/NASA/);
    expect(layer.kind.length).toBeGreaterThan(0);
    expect(layer.fallback).toBe('natural');
    expect(layer.maxNativeZoom).toBe(layer.color.maxZoom);
  });

  it.each(NEW_SPECTRA)('%s: легенда с величиной и подписанными концами', (id) => {
    const legend = SPECTRA[id].legend!;
    expect(legend.gradient).toMatch(/^linear-gradient\(/);
    expect(legend.quantity.length).toBeGreaterThan(0);
    expect(legend.low).not.toBe(legend.high);
  });

  it('покрывает не менее трёх видов данных вместе с прежними слоями', () => {
    const kinds = new Set(Object.values(SPECTRA).map((layer) => layer.kind.split(' ')[0]));
    for (const kind of ['оптический', 'топографический', 'тепловой', 'спектральный', 'термофизический', 'пылевой', 'химический']) {
      expect(kinds.has(kind)).toBe(true);
    }
  });
});
