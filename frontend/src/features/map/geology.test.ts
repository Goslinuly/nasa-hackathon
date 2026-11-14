// Тесты разбора legend.json и привязки долготы/широты к пикселям геологической подложки.
import { describe, expect, it } from 'vitest';
import { geologyBackground, geologyPixel, parseGeologyLegend } from './geology';

const extent = { lon_min: -180, lon_max: 180, lat_min: -90, lat_max: 90 };
const valid = { title: 'T', credit: 'C', source: 'https://example.org', retrieved: '2026-11-14', status: 'S', extent,
  units: [{ unit: 'AHi', label: 'Impact', color: [255, 255, 0] }] };

describe('geology legend', () => {
  it('parses a valid legend', () => {
    const legend = parseGeologyLegend(valid);
    expect(legend.units[0]).toEqual({ unit: 'AHi', label: 'Impact', color: [255, 255, 0] });
    expect(legend.extent).toEqual(extent);
  });
  it('rejects malformed legends', () => {
    expect(() => parseGeologyLegend(null)).toThrow();
    expect(() => parseGeologyLegend({ ...valid, credit: '' })).toThrow();
    expect(() => parseGeologyLegend({ ...valid, units: [] })).toThrow();
    expect(() => parseGeologyLegend({ ...valid, units: [{ unit: 'A', label: 'B', color: [256, 0, 0] }] })).toThrow();
    expect(() => parseGeologyLegend({ ...valid, units: [{ unit: 'A', label: 'B', color: [1, 2] }] })).toThrow();
    expect(() => parseGeologyLegend({ ...valid, extent: { ...extent, lon_min: 180 } })).toThrow();
    expect(() => parseGeologyLegend({ ...valid, extent: { ...extent, lat_min: 'x' } })).toThrow();
  });
});

describe('geology pixel mapping', () => {
  it('maps extent corners and center on the 5760x2880 raster', () => {
    expect(geologyPixel(-180, 90, extent, 5760, 2880)).toMatchObject({ x: 0, y: 0, inside: true });
    expect(geologyPixel(0, 0, extent, 5760, 2880)).toMatchObject({ x: 2880, y: 1440, inside: true });
    expect(geologyPixel(180, -90, extent, 5760, 2880).inside).toBe(false);
  });
  it('places the raster in the map viewport', () => {
    const b = geologyBackground(extent, 0, 0, 2, 800, 600);
    expect(b).toMatchObject({ width: 720, height: 360, left: 40, top: 120, wrapsLongitude: true });
  });
});
