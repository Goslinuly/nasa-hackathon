import { describe, expect, it } from 'vitest';

import {
  CTX_REGION_BOUNDS,
  MERCATOR_MAX_LAT,
  ctxTileUrl,
  lonLatToMercatorTile,
  mercatorRowLat,
  mercatorTileBounds,
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
