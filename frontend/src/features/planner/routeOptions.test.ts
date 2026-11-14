// Тесты сборки параметров маршрута и подписей модельного времени и кислорода.
import { describe, expect, it } from 'vitest';

import { DEFAULT_TRAVERSE } from '@/shared/eva/traverse';

import {
  CREW_RANGE_KG,
  LOAD_RANGE_KG,
  buildRouteOptions,
  clampMass,
  dataLevelNote,
  formatBlockedCells,
  formatDataLevel,
  formatSand,
  formatStopsCount,
  formatUnknownSurface,
  moveItem,
  formatModelTime,
  formatOxygenCorridor,
  outsideModelWarning,
} from './routeOptions';
import { DEFAULT_ROUTE_OPTIONS } from './routing';

describe('buildRouteOptions', () => {
  it('по расстоянию не добавляет модель и параметры выхода', () => {
    const options = buildRouteOptions(DEFAULT_ROUTE_OPTIONS, 'distance', DEFAULT_TRAVERSE);
    expect(options).toEqual(DEFAULT_ROUTE_OPTIONS);
    expect('costModel' in options).toBe(false);
  });

  it('по расходу задаёт модель и копию параметров, возвращая новый объект', () => {
    const traverse = { surface: 'sand' as const, crewKg: 90, loadKg: 10 };
    const options = buildRouteOptions({ ...DEFAULT_ROUTE_OPTIONS, maxSlopeDeg: 20 }, 'eva', traverse);
    expect(options).toMatchObject({ maxSlopeDeg: 20, costModel: 'eva', traverse });
    expect(options.traverse).not.toBe(traverse);
    expect(options).not.toBe(DEFAULT_ROUTE_OPTIONS);
  });

  it('возврат к расстоянию убирает следы расхода', () => {
    const eva = buildRouteOptions(DEFAULT_ROUTE_OPTIONS, 'eva', DEFAULT_TRAVERSE);
    expect(buildRouteOptions(eva, 'distance', DEFAULT_TRAVERSE).costModel).toBeUndefined();
  });
});

describe('clampMass', () => {
  it('ограничивает диапазоном и округляет', () => {
    expect(clampMass(10, CREW_RANGE_KG, 80)).toBe(50);
    expect(clampMass(500, CREW_RANGE_KG, 80)).toBe(150);
    expect(clampMass(-5, LOAD_RANGE_KG, 45)).toBe(0);
    expect(clampMass(72.6, CREW_RANGE_KG, 80)).toBe(73);
  });

  it('нечисло заменяет запасным значением', () => {
    expect(clampMass(Number.NaN, CREW_RANGE_KG, 80)).toBe(80);
  });
});

describe('подписи', () => {
  it('время по модели в часах и минутах', () => {
    expect(formatModelTime(3 * 3600 + 25 * 60)).toBe('3 ч 25 мин');
    expect(formatModelTime(40 * 60)).toBe('40 мин');
  });

  it('кислород коридором', () => {
    expect(formatOxygenCorridor(12.34, 20)).toBe('12,3–20 л');
  });

  it('предупреждение о выходе за область модели', () => {
    expect(outsideModelWarning(0)).toBeNull();
    expect(outsideModelWarning(1)).toContain('1 участок маршрута');
    expect(outsideModelWarning(3)).toContain('3 участка');
    expect(outsideModelWarning(7)).toContain('7 участков');
    expect(outsideModelWarning(11)).toContain('11 участков');
  });
});

describe('слои проходимости и остановки', () => {
  it('грунт из данных по умолчанию не пишется, выключение пишет false', () => {
    expect('surfaceFromData' in buildRouteOptions(DEFAULT_ROUTE_OPTIONS, 'distance', DEFAULT_TRAVERSE, true)).toBe(false);
    expect(buildRouteOptions(DEFAULT_ROUTE_OPTIONS, 'eva', DEFAULT_TRAVERSE, false).surfaceFromData).toBe(false);
  });

  it('песок и грунт без данных', () => {
    expect(formatSand(12_300)).toBe('Песок: 12,3 км');
    expect(formatUnknownSurface(0)).toBeNull();
    expect(formatUnknownSurface(2_000)).toBe('Без данных грунта: 2 км');
  });

  it('обойдённые ячейки со склонением', () => {
    expect(formatBlockedCells(0, 20)).toBeNull();
    expect(formatBlockedCells(1, 20)).toBe('Поиск обошёл 1 ячейку с изрезанностью круче 20°');
    expect(formatBlockedCells(3, 20)).toContain('3 ячейки');
    expect(formatBlockedCells(12, 20)).toContain('12 ячеек');
  });

  it('уровень данных и заметка', () => {
    expect(formatDataLevel('local_dtm')).toEqual({ label: 'детальный DTM участка', tone: 'good' });
    expect(formatDataLevel('orbital_overview').tone).toBe('warn');
    expect(dataLevelNote('local_dtm', 1, 15)).toContain('1 м/пикс');
    expect(dataLevelNote('local_dtm', 1, 15)).toContain('камни мельче шага сетки');
    expect(dataLevelNote('orbital_overview', null, 15)).toContain('MOLA ~7.4 км/пикс');
  });

  it('подпись остановок и перестановка', () => {
    expect(formatStopsCount(0)).toBeNull();
    expect(formatStopsCount(1)).toBe('через 1 остановку');
    expect(formatStopsCount(2)).toBe('через 2 остановки');
    expect(formatStopsCount(5)).toBe('через 5 остановок');
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });
});
