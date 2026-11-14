// Тесты источников тайлов плоской карты.
import { describe, expect, it } from 'vitest';
import { MAP_LAYERS, mapTileUrl, visibleTiles } from './mapTiles';

describe('planetary WMS tiles', () => {
  it('uses the unrotated JMARS projection and east-longitude bounds', () => {
    const p = new URLSearchParams(mapTileUrl('ctx', 1, 2, 0).split('?')[1]);
    expect(p.get('SRS')).toBe('JMARS:1,180,90');
    expect(p.get('BBOX')).toBe('0,0,90,90');
    expect(p.get('LAYERS')).toBe('mars_ctx_global_mosaic_v1_m4');
  });
  it('wraps requests across the longitude seam without out of range bboxes', () => {
    expect(mapTileUrl('ctx', 1, -1, 0)).toBe(mapTileUrl('ctx', 1, 3, 0));
    expect(mapTileUrl('ctx', 1, 4, 0)).toBe(mapTileUrl('ctx', 1, 0, 0));
  });
  it('caps source zoom while magnifying existing pixels, including at poles', () => {
    const tiles = visibleTiles(179.999, 90, 18, 1000, 600, 13);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThan(10);
    expect(tiles.every(t => t.z === 13 && t.size === 8192 && t.y >= 0 && t.y < 8192)).toBe(true);
  });
});

describe('Trek spectral atlas layers', () => {
  it('requests wrapped Trek WMTS tiles and starts hidden under the overview mosaic', () => {
    expect(mapTileUrl('tes-albedo', 1, -1, 0)).toBe(mapTileUrl('tes-albedo', 1, 3, 0));
    expect(mapTileUrl('tes-inertia', 1, 2, 0)).toBe('/trek/Mars/EQ/TES_Thermal_Inertia/1.0.0/default/default028mm/1/0/2.png');
    const ids = MAP_LAYERS.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MAP_LAYERS.filter(l => l.id.startsWith('tes-')).every(l => !l.visible && l.nativeZoom <= 2)).toBe(true);
    expect(ids.indexOf('tes-dust')).toBeLessThan(ids.indexOf('viking'));
  });
});
