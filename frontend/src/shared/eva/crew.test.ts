// Золотые значения модуля физиологии. Посчитаны независимо по тем же формулам
// (см. docs/PHYSICS.md и tools/crew/README.md) и закрепляют числа, которые показывает панель.

import { describe, expect, it } from 'vitest';

import {
  ALBEDO_SHARE,
  CAREER_DOSE_LIMIT_MSV,
  DEFAULT_CREW,
  G_EARTH,
  G_MARS,
  basalMetabolicRateKcal,
  crewReport,
  jump,
  nutrition,
  radiation,
  routeCost,
  thermal,
  type Leg,
} from './crew';

const LEGS: Leg[] = [
  { lengthM: 900, slopeDeg: 6 },
  { lengthM: 700, slopeDeg: 0 },
  { lengthM: 900, slopeDeg: -6 },
];

describe('прыжок', () => {
  const j = jump({ bodyKg: 70, loadKg: 45, earthJumpM: 0.4 });

  it('работа ног равна m·g·h на Земле', () => {
    expect(j.workJ).toBeCloseTo(70 * G_EARTH * 0.4, 6);
  });

  it('в скафандре 0,64 м, без скафандра 1,05 м', () => {
    expect(j.heightM).toBeCloseTo(0.6417, 3);
    expect(j.freeHeightM).toBeCloseTo(1.0543, 3);
  });

  it('без скафандра это ровно земной прыжок × g_E/g_M', () => {
    const free = jump({ bodyKg: 70, loadKg: 0, earthJumpM: 0.4 });
    expect(free.heightM).toBeCloseTo(0.4 * (G_EARTH / G_MARS), 9);
    expect(free.ratio).toBeCloseTo(G_EARTH / G_MARS, 9);
  });

  it('скорость приземления равна скорости отрыва', () => {
    expect(j.landingMs).toBeCloseTo(j.takeoffMs, 12);
    expect(j.takeoffMs).toBeCloseTo(2.1853, 3);
    expect(j.flightS).toBeCloseTo(1.1746, 3);
  });

  it('тяжёлому человеку один и тот же скафандр мешает относительно меньше', () => {
    const light = jump({ bodyKg: 55, loadKg: 45, earthJumpM: 0.4 });
    const heavy = jump({ bodyKg: 95, loadKg: 45, earthJumpM: 0.4 });
    expect(heavy.ratio).toBeGreaterThan(light.ratio);
  });
});

describe('основной обмен', () => {
  it('Миффлин–Сан Жеор, разница между полами 166 ккал', () => {
    expect(basalMetabolicRateKcal('female', 36, 170, 70)).toBeCloseTo(1421.5, 6);
    expect(basalMetabolicRateKcal('male', 36, 170, 70)).toBeCloseTo(1587.5, 6);
  });
});

describe('маршрут', () => {
  const r = routeCost(LEGS, { surface: 'firm', crewKg: 70, loadKg: 45 });

  it('время, кислород и набор высоты', () => {
    expect(r.seconds).toBeCloseTo(3348.79, 1);
    expect(r.o2L).toBeCloseTo(31.47, 1);
    expect(r.ascentM).toBeCloseTo(94.59, 1);
    expect(r.descentM).toBeCloseTo(94.59, 1);
    expect(r.distanceM).toBe(2500);
  });

  it('энергия пересчитывается из кислорода', () => {
    expect(r.kcal).toBeCloseTo(157.2, 0);
  });

  it('подъём дороже спуска той же длины и крутизны', () => {
    const up = routeCost([{ lengthM: 1000, slopeDeg: 8 }]);
    const down = routeCost([{ lengthM: 1000, slopeDeg: -8 }]);
    expect(up.o2L).toBeGreaterThan(down.o2L);
    expect(up.seconds).toBeGreaterThan(down.seconds);
  });

  it('ноги круче ±20° помечаются выходом за область модели', () => {
    const steep = routeCost([{ lengthM: 100, slopeDeg: 25 }]);
    expect(steep.legs[0].outsideModel).toBe(true);
  });
});

describe('теплоотдача', () => {
  const t = thermal({
    bodyKg: 70, loadKg: 45, speedMs: 0.75, slopeDeg: 0,
    surface: 'firm', feedwaterKg: 4, oxygenL: 420,
  });

  it('мощность, расход воды и ресурс ранца', () => {
    expect(t.powerLowW).toBeCloseTo(126.08, 1);
    expect(t.powerMidW).toBeCloseTo(167.18, 1);
    expect(t.waterKgH).toBeCloseTo(0.2407, 3);
    expect(t.waterHours).toBeCloseTo(16.62, 1);
    expect(t.oxygenHours).toBeCloseTo(14.58, 1);
    expect(t.limiting).toBe('oxygen');
  });

  it('сверка с ранцем Apollo: 350 Вт — это 0,5 кг воды в час', () => {
    expect((350 * 3600) / 2.5e6).toBeCloseTo(0.504, 3);
  });

  it('на ровном месте полезной работы нет, всё тепло', () => {
    expect(t.climbW).toBe(0);
    expect(t.heatW).toBeCloseTo(t.powerMidW, 9);
  });

  it('на подъёме часть мощности уходит в набор высоты', () => {
    const up = thermal({
      bodyKg: 70, loadKg: 45, speedMs: 0.69, slopeDeg: 6,
      surface: 'firm', feedwaterKg: 4, oxygenL: 420,
    });
    expect(up.climbW).toBeGreaterThan(0);
    expect(up.heatW).toBeLessThan(up.powerMidW);
  });
});

describe('питание', () => {
  it('выход добавляется к обмену, а не заменяет его', () => {
    const n = nutrition({
      sex: 'female', ageYears: 36, heightCm: 170, bodyKg: 70,
      evaHours: 3348.79 / 3600, evaPowerW: 167.18,
    });
    expect(n.bmrKcal).toBeCloseTo(1421.5, 6);
    expect(n.totalKcal).toBeGreaterThan(n.bmrKcal);
    expect(n.totalKcal).toBeCloseTo(1910, -1);
    expect(n.proteinG).toBeCloseTo(112, 0);
  });
});

describe('радиация', () => {
  const r = radiation({ evaSeconds: 3348.79, skyViewFraction: 0.75, ascentM: 94.6, surfaceSols: 500 });

  it('доза за выход и доля карьерного предела', () => {
    expect(r.openMSv).toBeCloseTo(0.0248, 4);
    expect(r.shieldFraction).toBeCloseTo(0.8025, 4);
    expect(r.missionMSv).toBeCloseTo(328.8, 1);
    expect(r.careerPercent).toBeCloseTo((328.8 / CAREER_DOSE_LIMIT_MSV) * 100, 1);
  });

  it('полностью закрытое небо не убирает альбедную долю', () => {
    const closed = radiation({ evaSeconds: 3600, skyViewFraction: 0, ascentM: 0, surfaceSols: 1 });
    expect(closed.shieldFraction).toBeCloseTo(ALBEDO_SHARE, 9);
  });
});

describe('сводный отчёт', () => {
  it('набор по умолчанию считается целиком и даёт советы', () => {
    const report = crewReport(DEFAULT_CREW);
    expect(report.route.distanceM).toBe(2500);
    expect(report.jump.heightM).toBeGreaterThan(0);
    expect(report.nutrition.totalKcal).toBeGreaterThan(0);
    expect(report.advice.length).toBeGreaterThan(0);
  });

  it('если маршрут длиннее ресурса ранца — это опасность, а не предупреждение', () => {
    const report = crewReport({
      ...DEFAULT_CREW,
      legs: [{ lengthM: 40000, slopeDeg: 4 }],
      oxygenL: 300,
      feedwaterKg: 1,
    });
    expect(report.advice.some((a) => a.level === 'danger')).toBe(true);
  });
});
