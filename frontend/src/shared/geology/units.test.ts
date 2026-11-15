import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { matchUnit } from '@/shared/regions/regionAt';
import { parseGeologyLegend } from '@/features/map/geology';
import { formatEraAge, likelyRock, parseUnitEra, UNIT_NAMES_RU, unitKind } from './units';

const legend = parseGeologyLegend(JSON.parse(readFileSync('public/data/geology/legend.json', 'utf8')));

describe('единицы SIM 3292', () => {
  it('русское название и эпоха есть у всех 44 единиц легенды', () => {
    expect(legend.units).toHaveLength(44);
    for (const u of legend.units) {
      expect(UNIT_NAMES_RU[u.unit], u.unit).toBeTruthy();
      expect(parseUnitEra(u.unit), u.unit).not.toBeNull();
      expect(unitKind(u.label), u.label).not.toBe('unknown');
    }
  });

  it('эпоха и возраст по коду', () => {
    const lHv = parseUnitEra('lHv')!;
    expect(lHv.part).toBe('l');
    expect(lHv.en).toBe('Late Hesperian');
    expect(formatEraAge(lHv, 'ru')).toBe('~3,7–3,0 млрд лет');
    const ahi = parseUnitEra('AHi')!;
    expect(ahi.periods).toEqual(['A', 'H']);
    expect(ahi.ru).toBe('амазонский и гесперийский');
    expect(formatEraAge(ahi, 'en')).toBe('~3.7 Ga and younger');
    expect(formatEraAge(parseUnitEra('Aa')!, 'ru')).toBe('моложе ~3,0 млрд лет');
    const hn = parseUnitEra('HNhu')!;
    expect([hn.fromGa, hn.toGa]).toEqual([4.1, 3.0]);
    expect(parseUnitEra('eNhm')!.ru).toBe('ранний нойский');
    expect(parseUnitEra('xyz')).toBeNull();
  });

  it('тип пород по типу единицы (трактовка)', () => {
    expect(likelyRock('Late Amazonian polar dunes unit')!.en).toBe('dark basaltic sand');
    expect(likelyRock('Hesperian polar edifice unit')!.en).toMatch(/ice/);
    expect(likelyRock('Amazonian volcanic edifice')!.en).toMatch(/basaltic lava/);
    expect(likelyRock('Amazonian and Hesperian impact unit')!.en).toMatch(/breccia/);
    expect(likelyRock('Hesperian transition outflow unit')!.en).toBe('sedimentary deposits');
    expect(likelyRock('Middle Noachian highland massif unit')!.en).toMatch(/crust/);
    expect(likelyRock('Amazonian apron unit')!.en).toMatch(/ice-rich/);
  });

  it('поиск единицы по цвету: точный и чуть сдвинутый цвет, фон', () => {
    for (const u of legend.units) expect(matchUnit(legend, ...u.color)?.unit).toBe(u.unit);
    expect(matchUnit(legend, 83 + 3, 26 - 2, 137 + 4)?.unit).toBe('lNv');
    expect(matchUnit(legend, 0, 0, 0)).toBeNull();
  });
});
