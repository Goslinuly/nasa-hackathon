import { describe, expect, it } from 'vitest';
import { G_MARS, jump } from '@/shared/eva/crew';
import { DEFAULT_PROFILE, normalizeProfile, PROFILE_LIMITS } from '@/shared/eva/crewProfile';
import { ballistic, eyeHeightM, stepJump, type Airborne } from './jump';

describe('профиль', () => {
  it('мусор даёт значения по умолчанию', () => {
    expect(normalizeProfile(null)).toEqual(DEFAULT_PROFILE);
    expect(normalizeProfile({ heightCm: 'x', bodyKg: NaN })).toEqual(DEFAULT_PROFILE);
  });
  it('значения ограничены пределами', () => {
    const p = normalizeProfile({ heightCm: 500, bodyKg: 1, loadKg: -5, earthJumpM: 0.5 });
    expect(p.heightCm).toBe(PROFILE_LIMITS.heightCm[1]);
    expect(p.bodyKg).toBe(PROFILE_LIMITS.bodyKg[0]);
    expect(p.loadKg).toBe(0);
    expect(p.earthJumpM).toBe(0.5);
  });
});

describe('высота глаз', () => {
  it('0,936 роста', () => {
    expect(eyeHeightM(170)).toBeCloseTo(1.591, 3);
    expect(eyeHeightM(NaN)).toBeCloseTo(1.591, 3);
  });
});

describe('полёт', () => {
  const j = jump({ bodyKg: 70, loadKg: 45, earthJumpM: 0.4 });

  it('шаги по кадрам дают высоту и время из jump()', () => {
    let a: Airborne | null = { y: 0, vy: j.takeoffMs };
    let t = 0;
    let top = 0;
    const dt = 1 / 60;
    while (a && t < 10) {
      a = stepJump(a, dt, G_MARS, 0);
      t += dt;
      if (a) top = Math.max(top, a.y);
    }
    expect(a).toBeNull();
    expect(top).toBeCloseTo(j.heightM, 2);
    expect(Math.abs(t - j.flightS)).toBeLessThan(dt * 1.01);
    const b = ballistic(j.takeoffMs, G_MARS);
    expect(b.heightM).toBeCloseTo(j.heightM, 6);
    expect(b.flightS).toBeCloseTo(j.flightS, 6);
  });

  it('на подъёме рельеф выше не прерывает прыжок, над NoData не приземляемся', () => {
    expect(stepJump({ y: 0, vy: 1 }, 0.01, G_MARS, 0.5)).not.toBeNull();
    expect(stepJump({ y: 0, vy: -1 }, 0.01, G_MARS, NaN)).not.toBeNull();
    expect(stepJump({ y: 0, vy: -1 }, 0.01, G_MARS, 0)).toBeNull();
  });
});
