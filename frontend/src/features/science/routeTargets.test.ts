import { describe, expect, it } from 'vitest';

import { findRouteTargets, MAX_TARGETS, type RouteSample } from './routeTargets';

const OPTIONS = { sandBelow: 150, dataLevel: 'orbital_overview' as const };

interface Part {
  inertia?: number | null;
  slopeDeg?: number;
  heightM?: number;
  unit?: string;
}

/** Ровный путь с шагом 100 м, на который накладываются признаки. */
function samples(count: number, at: (index: number) => Part = () => ({})): RouteSample[] {
  return Array.from({ length: count }, (_, index) => {
    const part = at(index);
    return {
      lon: 100 + index * 0.001,
      lat: 10,
      alongM: index * 100,
      heightM: part.heightM ?? 0,
      slopeDeg: part.slopeDeg ?? 0,
      geology: part.unit ? { unit: part.unit, label: `unit ${part.unit}` } : null,
      inertia: part.inertia === undefined ? 220 : part.inertia,
    } satisfies RouteSample;
  });
}

describe('научные цели по маршруту', () => {
  it('контакт геологических единиц попадает между точками смены', () => {
    const found = findRouteTargets(
      samples(20, (i) => ({ unit: i < 10 ? 'Nh1' : 'Ah3' })),
      OPTIONS,
    );
    const contact = found.find((target) => target.kind === 'geology_contact');
    expect(contact?.title[0]).toBe('Контакт единиц Nh1 и Ah3');
    expect(contact?.title[1]).toBe('Contact of units Nh1 and Ah3');
    expect(contact?.alongM).toBe(950);
    expect(contact?.evidence[0]).toContain('SIM 3292');
  });

  it('названия единиц в русском тексте берутся из таблицы SIM 3292, в английском — из легенды', () => {
    const highland = { unit: 'eHh', label: 'Early Hesperian highland unit' };
    const volcanic = { unit: 'eHv', label: 'Early Hesperian volcanic unit' };
    const found = findRouteTargets(
      samples(20).map((sample, index) => ({
        ...sample,
        geology: index < 10 ? highland : volcanic,
      })),
      OPTIONS,
    );
    const contact = found.find((target) => target.kind === 'geology_contact');
    expect(contact?.why[0]).toContain('Раннегесперийская нагорная единица');
    expect(contact?.why[0]).toContain('Раннегесперийская вулканическая единица');
    expect(contact?.why[0]).not.toContain('Early Hesperian');
    expect(contact?.why[0]).toContain('Ожидаемые породы: древняя кратерированная кора');
    expect(contact?.why[1]).toContain('Early Hesperian highland unit');
    expect(contact?.why[1]).toContain('Rocks to expect: ancient cratered crust');
  });

  it('одна и та же пара единиц не повторяется', () => {
    const found = findRouteTargets(
      samples(40, (i) => ({ unit: Math.floor(i / 5) % 2 === 0 ? 'Nh1' : 'Ah3' })),
      OPTIONS,
    );
    expect(found.filter((target) => target.kind === 'geology_contact')).toHaveLength(1);
  });

  it('пик тепловой инерции даёт скальный выход, а провал — песок', () => {
    const found = findRouteTargets(
      samples(40, (i) => {
        if (i === 10) return { inertia: 520 };
        if (i >= 25 && i <= 35) return { inertia: 90 };
        return {};
      }),
      OPTIONS,
    );
    const bedrock = found.find((target) => target.kind === 'bedrock');
    const dunes = found.find((target) => target.kind === 'dunes');
    expect(bedrock?.title[0]).toBe('Плотный грунт, инерция 520');
    expect(bedrock?.alongM).toBe(1000);
    expect(dunes?.title[1]).toBe('Loose material, 1 km');
    expect(dunes?.evidence[1]).toContain('TES thermal inertia');
  });

  it('короткий песчаный участок не отмечается', () => {
    const found = findRouteTargets(
      samples(30, (i) => (i === 10 || i === 11 ? { inertia: 90 } : {})),
      OPTIONS,
    );
    expect(found.some((target) => target.kind === 'dunes')).toBe(false);
  });

  it('уступ и обзорная точка берутся из профиля, а подпись слоя — из уровня данных', () => {
    const shape = (i: number): Part =>
      i === 12 ? { slopeDeg: -14 } : i === 30 ? { heightM: 120 } : { heightM: 0 };
    const overview = findRouteTargets(samples(40, shape), OPTIONS);
    const scarp = overview.find((target) => target.kind === 'scarp');
    const vantage = overview.find((target) => target.kind === 'vantage');
    expect(scarp?.title[0]).toBe('Уступ, уклон 14.0°');
    expect(scarp?.evidence[0]).toContain('MOLA');
    expect(vantage?.title[1]).toBe('Vantage point, +120 m');

    const local = findRouteTargets(samples(40, shape), { ...OPTIONS, dataLevel: 'local_dtm' });
    expect(local.find((target) => target.kind === 'scarp')?.evidence[0]).toContain('HiRISE');
  });

  it('пологий подъём обзорной точкой не считается', () => {
    const found = findRouteTargets(
      samples(40, (i) => ({ heightM: i === 20 ? 30 : 0 })),
      OPTIONS,
    );
    expect(found.some((target) => target.kind === 'vantage')).toBe(false);
  });

  it('цели не слипаются и отдаются по ходу движения', () => {
    const found = findRouteTargets(
      samples(60, (i) => ({
        unit: i < 30 ? 'Nh1' : 'Ah3',
        inertia: i === 29 || i === 31 ? 600 : 220,
        slopeDeg: i === 30 ? 20 : 0,
      })),
      OPTIONS,
    );
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('geology_contact');
  });

  it('длинный путь ограничен числом целей и сортирован по расстоянию', () => {
    const found = findRouteTargets(
      samples(400, (i) => ({ inertia: i % 20 === 0 ? 400 + i : 220 })),
      OPTIONS,
    );
    expect(found.length).toBeLessThanOrEqual(MAX_TARGETS);
    expect(found.map((target) => target.alongM)).toEqual(
      [...found.map((target) => target.alongM)].sort((a, b) => a - b),
    );
  });

  it('пустой и слишком короткий путь ничего не дают', () => {
    expect(findRouteTargets([], OPTIONS)).toEqual([]);
    expect(findRouteTargets(samples(2), OPTIONS)).toEqual([]);
  });

  it('без данных тепловой инерции остаются цели по геологии и рельефу', () => {
    const found = findRouteTargets(
      samples(40, (i) => ({ inertia: null, unit: i < 20 ? 'Nh1' : 'Ah3' })),
      OPTIONS,
    );
    expect(found.map((target) => target.kind)).toEqual(['geology_contact']);
  });
});
