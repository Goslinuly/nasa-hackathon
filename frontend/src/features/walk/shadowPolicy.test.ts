import { describe, expect, it } from 'vitest';

import { SHADOW_MAX_AGE_S, SHADOW_MOVE_WALK_M, SHADOW_SUN_DEG, shadowNeedsRefresh } from './shadowPolicy';

const cosDeg = (d: number) => Math.cos((d * Math.PI) / 180);
const base = { movedM: 0, sunDot: 1, ageS: 0.1, vehicle: 'walk' as const };

describe('перерисовка карты теней прогулки', () => {
  it('пешком: стоим — не перерисовываем; прошли 1,5 м — перерисовываем', () => {
    expect(shadowNeedsRefresh(base)).toBe(false);
    expect(shadowNeedsRefresh({ ...base, movedM: SHADOW_MOVE_WALK_M - 0.1 })).toBe(false);
    expect(shadowNeedsRefresh({ ...base, movedM: SHADOW_MOVE_WALK_M })).toBe(true);
  });

  it('на ровере модель отбрасывает тень: любое движение перерисовывает', () => {
    expect(shadowNeedsRefresh({ ...base, vehicle: 'rover', movedM: 0.1 })).toBe(true);
    expect(shadowNeedsRefresh({ ...base, vehicle: 'rover', movedM: 0 })).toBe(false);
  });

  it('поворот солнца больше порога и старая карта перерисовываются', () => {
    expect(shadowNeedsRefresh({ ...base, sunDot: cosDeg(SHADOW_SUN_DEG / 2) })).toBe(false);
    expect(shadowNeedsRefresh({ ...base, sunDot: cosDeg(SHADOW_SUN_DEG * 2) })).toBe(true);
    expect(shadowNeedsRefresh({ ...base, ageS: SHADOW_MAX_AGE_S })).toBe(true);
  });
});
