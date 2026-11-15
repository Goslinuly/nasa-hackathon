import { describe, expect, it } from 'vitest';
import { lonLatToEqc, makeFrame } from './geo';
import { formatLatLon, interpretInertia, isTap, lon180, pointLonLat, rayMarchTerrain } from './surfacePoint';

describe('точка на поверхности', () => {
  it('луч до плоскости и до склона', () => {
    const flat = () => 0;
    const down = { x: 0, y: -Math.SQRT1_2, z: -Math.SQRT1_2 };
    const hit = rayMarchTerrain({ x: 0, y: 10, z: 0 }, down, flat, 1000)!;
    expect(hit.y).toBeCloseTo(0, 3);
    expect(hit.z).toBeCloseTo(-10, 3);
    // Склон поднимается к северу (z < 0): точка ближе, чем на плоскости.
    const slope = (_x: number, z: number) => -z * 0.5;
    const h2 = rayMarchTerrain({ x: 0, y: 10, z: 0 }, down, slope, 1000)!;
    expect(h2.z).toBeCloseTo(-20 / 3, 2);
    expect(h2.y).toBeCloseTo(10 / 3, 2);
  });

  it('луч в небо и над пустотой — нет точки', () => {
    expect(rayMarchTerrain({ x: 0, y: 10, z: 0 }, { x: 0, y: 1, z: 0 }, () => 0, 500)).toBeNull();
    expect(rayMarchTerrain({ x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: 0 }, () => NaN, 500)).toBeNull();
  });

  it('широта и долгота точки сцены', () => {
    const c = lonLatToEqc(137.4, -4.8);
    const f = makeFrame([c.x - 1000, c.y - 1000, c.x + 1000, c.y + 1000], 1, 2000, 2000);
    const p0 = pointLonLat(f, 0, 0);
    expect(p0.lat).toBeCloseTo(-4.8, 6);
    expect(p0.lonEast).toBeCloseTo(137.4, 6);
    // 1 км на север (z = -1000) ≈ 0,01687° широты на сфере 3396,19 км.
    expect(pointLonLat(f, 0, -1000).lat - p0.lat).toBeCloseTo(1000 / 3396190 * 180 / Math.PI, 6);
    expect(lon180(331.371)).toBeCloseTo(-28.629, 6);
    expect(lon180(77.24)).toBeCloseTo(77.24, 6);
    expect(formatLatLon(-4.80421, 137.382525, 'ru')).toBe('4,8042° ю. ш., 137,3825° в. д.');
    expect(formatLatLon(18.435, 77.24, 'en')).toBe('18.4350° N, 77.2400° E');
  });

  it('тепловая инерция → грунт', () => {
    expect(interpretInertia(null)).toBeNull();
    expect(interpretInertia(0)).toBeNull();
    expect(interpretInertia(80)!.cls).toBe('fine');
    expect(interpretInertia(150)!.cls).toBe('sand');
    expect(interpretInertia(400)!.cls).toBe('sand');
    expect(interpretInertia(401)!.cls).toBe('coarse');
  });

  it('касание и протяжка', () => {
    expect(isTap(3, 4, 120)).toBe(true);
    expect(isTap(8, 0, 120)).toBe(false);
    expect(isTap(0, 0, 300)).toBe(false);
  });
});
