// Тесты чистых функций EVA: уклоны профиля, прореживание, подписи и уровни уклона.
import { describe, expect, it } from 'vitest';

import { buildEvaPoints, levelBadge, formatCorridor, formatDuration, slopeBadge } from './evaProfile';

const thresholds = [
  { key: 'conservative_plan', low_deg: -15, high_deg: 15, nature: 'a', label: 'a' },
  { key: 'planning_tool_limit', low_deg: -20, high_deg: 20, nature: 'b', label: 'b' },
];

describe('buildEvaPoints', () => {
  it('плоский профиль даёт нулевой уклон', () => {
    const points = buildEvaPoints([
      { distanceM: 0, heightM: 100 },
      { distanceM: 500, heightM: 100 },
    ]);
    expect(points).toEqual([{ distance_m: 500, slope_deg: 0 }]);
  });

  it('подъём 100 м на 1000 м даёт около 5.71°', () => {
    const [point] = buildEvaPoints([
      { distanceM: 0, heightM: 0 },
      { distanceM: 1000, heightM: 100 },
    ]);
    expect(point.slope_deg).toBeCloseTo(5.71, 2);
  });

  it('прореживает длинный профиль до лимита', () => {
    const profile = Array.from({ length: 5000 }, (_, i) => ({ distanceM: i * 10, heightM: i }));
    const points = buildEvaPoints(profile);
    expect(points.length).toBeLessThanOrEqual(499);
    expect(points.reduce((s, p) => s + p.distance_m, 0)).toBeCloseTo(49_990, 5);
  });
});

describe('подписи', () => {
  it('форматирует коридор', () => {
    expect(formatCorridor(4.2, 5.1, 'ч')).toBe('4,2–5,1 ч');
  });

  it('форматирует время', () => {
    expect(formatDuration(3600 * 4 + 60 * 12)).toBe('4 ч 12 мин');
    expect(formatDuration(1800)).toBe('30 мин');
  });
});

describe('slopeBadge', () => {
  it('делит уклоны по порогам', () => {
    expect(slopeBadge(5, thresholds)).toBe('ok');
    expect(slopeBadge(-17, thresholds)).toBe('warn');
    expect(slopeBadge(25, thresholds)).toBe('limit');
  });

  it('сопоставляет уровни API с бейджами', () => {
    expect(levelBadge('comfortable')).toBe('ok');
    expect(levelBadge('caution')).toBe('warn');
    expect(levelBadge('excluded_by_planner')).toBe('limit');
    expect(levelBadge('extreme')).toBe('limit');
  });
});
