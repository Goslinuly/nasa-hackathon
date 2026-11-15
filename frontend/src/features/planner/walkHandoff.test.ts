// Тесты передачи маршрута в прогулку: границы с отступом, переход через 0° в. д., выбор участка.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEMO_MISSION } from './demoMission';
import { findWalkSite, insideBounds, routeInsideBounds, toWalkPoints, type LonLatBounds } from './walkHandoff';

const box: LonLatBounds = { west: 331.35, south: 31.36, east: 331.39, north: 31.4 };
const wrap: LonLatBounds = { west: 359.99, south: -0.01, east: 0.01, north: 0.01 };

function manifestBounds(id: string): LonLatBounds {
  const path = resolve(__dirname, '../../../public/data/local', id, 'manifest.json');
  return JSON.parse(readFileSync(path, 'utf8')).bounds_lonlat as LonLatBounds;
}

describe('insideBounds', () => {
  it('внутри, снаружи и у самого края', () => {
    expect(insideBounds(box, { lon: 331.37, lat: 31.38 })).toBe(true);
    expect(insideBounds(box, { lon: 331.4, lat: 31.38 })).toBe(false);
    expect(insideBounds(box, { lon: 331.37, lat: 31.41 })).toBe(false);
    // На границе — внутри без отступа, снаружи с отступом 30 м.
    expect(insideBounds(box, { lon: 331.35, lat: 31.38 }, 0)).toBe(true);
    expect(insideBounds(box, { lon: 331.35, lat: 31.38 })).toBe(false);
    expect(insideBounds(box, { lon: 331.37, lat: 31.4 })).toBe(false);
  });

  it('западная долгота приводится к восточной', () => {
    expect(insideBounds(box, { lon: 331.37 - 360, lat: 31.38 })).toBe(true);
  });

  it('окно через 0° в. д.', () => {
    expect(insideBounds(wrap, { lon: 0, lat: 0 })).toBe(true);
    expect(insideBounds(wrap, { lon: 359.995, lat: 0 })).toBe(true);
    expect(insideBounds(wrap, { lon: -0.005, lat: 0 })).toBe(true);
    expect(insideBounds(wrap, { lon: 0.02, lat: 0 })).toBe(false);
    expect(insideBounds(wrap, { lon: 180, lat: 0 })).toBe(false);
  });

  it('нечисловые координаты — снаружи', () => {
    expect(insideBounds(box, { lon: Number.NaN, lat: 31.38 })).toBe(false);
  });
});

describe('routeInsideBounds и findWalkSite', () => {
  const sites = [
    { id: 'ares3', bounds: box },
    { id: 'zero', bounds: wrap },
  ];

  it('весь маршрут внутри одного участка', () => {
    const route = [
      { lon: 331.36, lat: 31.37 },
      { lon: 331.38, lat: 31.39 },
    ];
    expect(routeInsideBounds(box, route)).toBe(true);
    expect(findWalkSite(sites, route)).toBe('ares3');
  });

  it('одна точка снаружи — маршрут не годится', () => {
    const route = [
      { lon: 331.36, lat: 31.37 },
      { lon: 331.5, lat: 31.39 },
    ];
    expect(findWalkSite(sites, route)).toBeNull();
  });

  it('пустой маршрут не годится', () => {
    expect(routeInsideBounds(box, [])).toBe(false);
    expect(findWalkSite(sites, [])).toBeNull();
  });

  it('точки для прогулки в восточной долготе', () => {
    expect(toWalkPoints([{ lon: -10, lat: 5 }])).toEqual([{ lat: 5, lonEast: 350 }]);
  });
});

describe('демо-миссия в Гейле', () => {
  it('точки демо лежат внутри участка gale-boxwork с отступом', () => {
    const bounds = manifestBounds('gale-boxwork');
    const points = [DEMO_MISSION.a, ...DEMO_MISSION.stops, DEMO_MISSION.b];
    expect(routeInsideBounds(bounds, points)).toBe(true);
    expect(findWalkSite([{ id: 'gale-boxwork', bounds }], points)).toBe('gale-boxwork');
  });
});
