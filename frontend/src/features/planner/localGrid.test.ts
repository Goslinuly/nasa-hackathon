// Тесты сетки участка: границы (в том числе через 0° в. д.) и согласованность разрешения.

import { describe, expect, it } from 'vitest';

import { MARS_RADIUS_KM } from '@/features/globe/tiles';

import { assertConsistent, findCoveringSite, pixelsPerDegreeOf, siteContains, type SiteManifestBounds } from './localGrid';
import { setLang } from '@/shared/i18n/lang';

// Тексты проверяются на русском; английские — отдельными проверками.
setLang('ru');

function site(id: string, west: number, south: number, east: number, north: number, pixelM = 1, w?: number, h?: number) {
  const ppd = pixelsPerDegreeOf(pixelM);
  const span = (((east - west) % 360) + 360) % 360;
  return {
    id,
    bounds_lonlat: { west, south, east, north },
    height: { width: w ?? Math.round(span * ppd), height: h ?? Math.round((north - south) * ppd), pixel_m: pixelM },
  } as unknown as SiteManifestBounds;
}

describe('siteContains', () => {
  const m = site('a', 331.35, 31.36, 331.39, 31.4);

  it('внутри и на границах', () => {
    expect(siteContains(m, { lon: 331.37, lat: 31.38 })).toBe(true);
    expect(siteContains(m, { lon: 331.35, lat: 31.36 })).toBe(true);
    expect(siteContains(m, { lon: 331.39, lat: 31.4 })).toBe(true);
  });

  it('снаружи', () => {
    expect(siteContains(m, { lon: 331.4, lat: 31.38 })).toBe(false);
    expect(siteContains(m, { lon: 331.37, lat: 31.41 })).toBe(false);
  });

  it('западные долготы приводятся к 0–360', () => {
    expect(siteContains(m, { lon: 331.37 - 360, lat: 31.38 })).toBe(true);
  });

  it('участок через 0° в. д.', () => {
    const wrap = site('w', 359.99, -1, 0.01, 1);
    expect(siteContains(wrap, { lon: 0, lat: 0 })).toBe(true);
    expect(siteContains(wrap, { lon: 359.995, lat: 0 })).toBe(true);
    expect(siteContains(wrap, { lon: -0.005, lat: 0 })).toBe(true);
    expect(siteContains(wrap, { lon: 0.5, lat: 0 })).toBe(false);
  });
});

describe('findCoveringSite', () => {
  const index = [
    { id: 'a', title: 'A', center: { lat: 0, lon_east: 0 } },
    { id: 'b', title: 'B', center: { lat: 0, lon_east: 0 } },
  ];
  const manifests = new Map([
    ['a', site('a', 10, 0, 11, 1)],
    ['b', site('b', 20, 0, 21, 1)],
  ]);

  it('находит участок, содержащий все точки', () => {
    const pts = [
      { lon: 20.2, lat: 0.2 },
      { lon: 20.8, lat: 0.8 },
    ];
    expect(findCoveringSite(index, manifests, pts)?.id).toBe('b');
  });

  it('null, если точки в разных участках или список пуст', () => {
    expect(findCoveringSite(index, manifests, [{ lon: 10.5, lat: 0.5 }, { lon: 20.5, lat: 0.5 }])).toBeNull();
    expect(findCoveringSite(index, manifests, [])).toBeNull();
  });
});

describe('согласованность сетки', () => {
  it('pixelsPerDegree не округляется и равен длине градуса / шаг', () => {
    expect(pixelsPerDegreeOf(1)).toBeCloseTo((MARS_RADIUS_KM * 1000 * Math.PI) / 180, 6);
  });

  it('допускает расхождение до 2 пикселей', () => {
    const ok = site('ok', 10, 0, 10.03, 0.03, 1);
    const h = ok.height;
    expect(assertConsistent({ ...ok, height: { ...h, width: h.width + 2 } })).toBeCloseTo(pixelsPerDegreeOf(1), 6);
  });

  it('при большем расхождении бросает понятную ошибку', () => {
    const bad = site('bad', 10, 0, 10.03, 0.03, 1, 1000, 1000);
    expect(() => assertConsistent(bad)).toThrow(/не согласованы/);
  });
});
