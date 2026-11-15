// Тесты показаний карточки марсохода: путь, время, кислород и скорость по доле пройденного маршрута.
import { describe, expect, it } from 'vitest';

import { DEFAULT_TRAVERSE, segmentCost, walkSpeed } from '@/shared/eva/traverse';

import { buildRoverTable, formatClock, formatKmPair, roverCardText, roverStatsAt } from './roverStats';

const firm = { ...DEFAULT_TRAVERSE, perCell: false };

// 1 км по ровному, затем 1 км с подъёмом 100 м.
const profile = [
  { distanceM: 0, heightM: 0 },
  { distanceM: 1000, heightM: 0 },
  { distanceM: 2000, heightM: 100 },
];

describe('buildRoverTable', () => {
  it('итоги совпадают с суммой цены участков', () => {
    const table = buildRoverTable(profile, firm);
    const flat = segmentCost(1000, 0);
    const up = segmentCost(1000, Math.atan(0.1) / (Math.PI / 180));
    expect(table.totalM).toBe(2000);
    expect(table.totalSeconds).toBeCloseTo(flat.seconds + up.seconds, 6);
    expect(table.totalO2LowL).toBeCloseTo(flat.o2LowL + up.o2LowL, 6);
    expect(table.totalO2HighL).toBeCloseTo(flat.o2HighL + up.o2HighL, 6);
  });

  it('пропускает участки нулевой длины', () => {
    const table = buildRoverTable([...profile.slice(0, 2), { distanceM: 1000, heightM: 5 }, profile[2]], firm);
    expect(table.segments).toHaveLength(2);
  });

  it('грунт по точкам: песок дороже плотного', () => {
    const sand = buildRoverTable(
      profile.map((p) => ({ ...p, surface: 'sand' })),
      { ...firm, perCell: true },
    );
    expect(sand.totalO2LowL).toBeGreaterThan(buildRoverTable(profile, firm).totalO2LowL);
  });
});

describe('roverStatsAt', () => {
  const table = buildRoverTable(profile, firm);
  const flat = segmentCost(1000, 0);

  it('в начале всё по нулям, скорость ровного участка', () => {
    const stats = roverStatsAt(table, 0)!;
    expect(stats.distanceM).toBe(0);
    expect(stats.seconds).toBe(0);
    expect(stats.o2LowL).toBe(0);
    expect(stats.speedMs).toBeCloseTo(walkSpeed(0).speedMs, 9);
  });

  it('на четверти пути — половина первого участка', () => {
    const stats = roverStatsAt(table, 0.25)!;
    expect(stats.distanceM).toBeCloseTo(500, 6);
    expect(stats.seconds).toBeCloseTo(flat.seconds / 2, 6);
    expect(stats.o2HighL).toBeCloseTo(flat.o2HighL / 2, 6);
    expect(stats.rateLowLpm).toBeCloseTo(flat.o2LowL / (flat.seconds / 60), 6);
  });

  it('на подъёме скорость ниже, а расход выше', () => {
    const before = roverStatsAt(table, 0.4)!;
    const after = roverStatsAt(table, 0.75)!;
    expect(after.slopeDeg).toBeGreaterThan(5);
    expect(after.speedMs).toBeLessThan(before.speedMs);
    expect(after.rateHighLpm).toBeGreaterThan(before.rateHighLpm);
    expect(after.seconds).toBeGreaterThan(flat.seconds);
  });

  it('в конце совпадает с итогами маршрута, доля за пределами обрезается', () => {
    const end = roverStatsAt(table, 1.7)!;
    expect(end.distanceM).toBeCloseTo(2000, 6);
    expect(end.seconds).toBeCloseTo(table.totalSeconds, 6);
    expect(end.o2LowL).toBeCloseTo(table.totalO2LowL, 6);
    expect(roverStatsAt(table, -1)!.distanceM).toBe(0);
    expect(roverStatsAt(table, Number.NaN)!.distanceM).toBe(0);
  });

  it('профиль, начинающийся не с нуля, считается от первой точки', () => {
    const shifted = buildRoverTable(profile.map((p) => ({ ...p, distanceM: p.distanceM + 300 })), firm);
    expect(roverStatsAt(shifted, 0.5)!.distanceM).toBeCloseTo(1000, 6);
  });

  it('пустой профиль — нет показаний', () => {
    expect(roverStatsAt(buildRoverTable([profile[0]], firm), 0.5)).toBeNull();
  });
});

describe('подписи', () => {
  it('км, время и диапазоны', () => {
    expect(formatKmPair(4200, 12500).replace(/\s/g, ' ')).toBe('4,2 из 12,5 км');
    expect(formatKmPair(420, 1500).replace(/\s/g, ' ')).toBe('0,42 из 1,50 км');
    expect(formatClock(59 * 60)).toBe('59 мин');
    expect(formatClock(3 * 3600 + 5 * 60)).toBe('3 ч 05 мин');
    const text = roverCardText(roverStatsAt(buildRoverTable(profile, firm), 0.5)!);
    expect(text.speed).toMatch(/км\/ч$/);
    expect(text.rate).toMatch(/л\/мин$/);
    expect(text.oxygen).toMatch(/ л$/);
  });
});
