// Попадание точки в именованные структуры газеттира и подбор юнита по цвету.
import { describe, expect, it } from 'vitest';

import { containingRegions, matchUnit } from './regionAt';

const FEATURES = [
  { name: 'Olympus Mons', lat: 18.65, lon: 226.2, d_km: 610, type: 'Mons, montes' },
  { name: 'Tharsis Montes', lat: 1.57, lon: 247.42, d_km: 2105, type: 'Mons, montes' },
  { name: 'Gale', lat: -5.37, lon: 137.81, d_km: 155, type: 'Crater, craters' },
];

describe('регион под точкой', () => {
  it('точка на склоне Олимпа попадает в Olympus Mons', () => {
    const hits = containingRegions(FEATURES, 226.0, 18.0);
    expect(hits[0]?.name).toBe('Olympus Mons');
  });

  it('точка в Гейле — кратер Гейл, без Олимпа', () => {
    const names = containingRegions(FEATURES, 137.4, -4.8).map((h) => h.name);
    expect(names).toContain('Gale');
    expect(names).not.toContain('Olympus Mons');
  });

  it('юнит подбирается по ближайшему цвету легенды, далёкий цвет — null', () => {
    const legend = {
      title: '', credit: '', source: '', retrieved: '', status: '',
      extent: { lon_min: -180, lon_max: 180, lat_min: -90, lat_max: 90 },
      units: [
        { unit: 'AHi', label: 'impact', color: [255, 255, 0] as [number, number, number] },
        { unit: 'lAv', label: 'volcanic', color: [200, 40, 40] as [number, number, number] },
      ],
    };
    expect(matchUnit(legend, 250, 250, 5)?.unit).toBe('AHi');
    expect(matchUnit(legend, 10, 10, 200)).toBeNull();
  });
});
