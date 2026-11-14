// Тесты прореживания маршрута и подписи смещения для поиска исследований.
import { describe, expect, it } from 'vitest';

import type { PlacedStudy } from '@/shared/api/scienceTypes';

import { formatOffset, sampleRoute } from './ResearchAlongRoute';

const path = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ lon: index * 0.1, lat: index * 0.05 }));

describe('прореживание маршрута для поиска исследований', () => {
  it('не трогает путь, который и так укладывается в лимит API', () => {
    const points = path(12);
    expect(sampleRoute(points)).toEqual(points);
  });

  it('держится лимита в 50 точек на длинном маршруте', () => {
    expect(sampleRoute(path(4000))).toHaveLength(50);
  });

  it('сохраняет старт и цель — коридор не должен обрезать концы пути', () => {
    const points = path(997);
    const sampled = sampleRoute(points);
    expect(sampled[0]).toEqual(points[0]);
    expect(sampled.at(-1)).toEqual(points.at(-1));
  });

  it('идёт по пути монотонно, без возвратов', () => {
    const sampled = sampleRoute(path(500));
    for (let index = 1; index < sampled.length; index += 1) {
      expect(sampled[index].lon).toBeGreaterThan(sampled[index - 1].lon);
    }
  });
});

describe('подсказка о том, что лежит в стороне от линии', () => {
  const study = (distance_from_route_m: number, side: 'left' | 'right' | 'on_line') =>
    ({ distance_from_route_m, side }) as PlacedStudy;

  it('называет сторону, а не только расстояние — иначе непонятно, куда смотреть', () => {
    expect(formatOffset(study(120_000, 'right'))).toBe('120 км справа от линии');
    expect(formatOffset(study(120_000, 'left'))).toBe('120 км слева от линии');
  });

  it('переходит на метры вблизи линии', () => {
    expect(formatOffset(study(640, 'left'))).toBe('640 м слева от линии');
  });

  it('не выдумывает сторону для точки на самой линии', () => {
    expect(formatOffset(study(0, 'on_line'))).toBe('0 м на самой линии');
  });
});
