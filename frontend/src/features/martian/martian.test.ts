// Тесты маршрута «Марсианина»: форма route.json, профиль высот и геометрия SVG.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { mainStops, nearestProfileIndex, niceTicks, profileGeometry, routeLines, type RouteFile } from './data';

const route = JSON.parse(
  readFileSync(new URL('../../../public/data/martian/route.json', import.meta.url), 'utf-8'),
) as RouteFile;

describe('route.json', () => {
  it('остановки по порядку романа и координаты из источников', () => {
    expect(mainStops(route).map(s => s.id)).toEqual(['ares3', 'mawrth', 'meridiani', 'schiaparelli-rim', 'ares4']);
    const ares3 = route.stops.find(s => s.id === 'ares3')!;
    expect(ares3.lat).toBeCloseTo(31.38, 3);
    expect(ares3.lon).toBeCloseTo(331.371, 3);
    expect(ares3.walk_site).toBe('ares3');
    const rim = route.stops.find(s => s.id === 'schiaparelli-rim')!;
    expect(rim.lat).toBeCloseTo(-0.882761, 5);
    for (const stop of route.stops) {
      expect(stop.coord_source).toMatch(/^https:\/\//);
      expect(stop.lon).toBeGreaterThanOrEqual(0);
      expect(stop.lon).toBeLessThan(360);
      expect(stop.novel.length).toBeGreaterThan(10);
    }
  });

  it('боковая поездка к Pathfinder не входит в основной профиль', () => {
    const side = route.stops.find(s => s.side_trip)!;
    expect(side.id).toBe('pathfinder');
    expect(side.route_km).toBeNull();
    expect(side.side_trip_km).toBeGreaterThan(500);
  });

  it('профиль: расстояние растёт, ~3500 км, высоты в пределах Марса', () => {
    const pts = route.profile.points;
    expect(pts[0][0]).toBe(0);
    expect(pts.every((p, i) => i === 0 || p[0] > pts[i - 1][0])).toBe(true);
    expect(route.profile.total_km).toBeGreaterThan(3300);
    expect(route.profile.total_km).toBeLessThan(3700);
    expect(pts[pts.length - 1][0]).toBeCloseTo(route.profile.total_km, 0);
    expect(pts.every(p => p[1] > -8200 && p[1] < 21300)).toBe(true);
    // Ares 3 в низинах Ацидалии, вал Скиапарелли выше.
    expect(pts[0][1]).toBeLessThan(-3500);
    expect(route.profile.max_m).toBeGreaterThan(0);
    expect(pts).toHaveLength(route.line.length);
  });

  it('км остановок совпадают с точками профиля', () => {
    for (const stop of mainStops(route)) {
      const i = nearestProfileIndex(route.profile.points, stop.route_km!);
      expect(Math.abs(route.profile.points[i][0] - stop.route_km!)).toBeLessThan(0.2);
    }
  });

  it('подпись и цитата HiRISE на месте', () => {
    expect(route.note).toBe('Маршрут из романа. Проходимость по обзорному рельефу не оценивается');
    expect(route.hirise_remark.url).toBe('https://www.uahirise.org/anaglyph/ESP_049017_2060_ESP_048595_2060_RED');
  });

  it('линии для глобуса: основная и пунктир к Pathfinder', () => {
    const lines = routeLines(route);
    expect(lines).toHaveLength(2);
    expect(lines[1].dashed).toBe(true);
  });
});

describe('геометрия профиля', () => {
  it('крайние точки ложатся на края области графика', () => {
    const geo = profileGeometry(
      [
        [0, -100],
        [50, 100],
        [100, 0],
      ],
      200,
      100,
      { top: 0, right: 0, bottom: 0, left: 0 },
    );
    expect(geo.x(0)).toBe(0);
    expect(geo.x(100)).toBe(200);
    expect(geo.y(100)).toBe(0);
    expect(geo.y(-100)).toBe(100);
    expect(geo.path.startsWith('M0.0,100.0')).toBe(true);
    expect(geo.area.endsWith('Z')).toBe(true);
  });

  it('niceTicks даёт круглые деления', () => {
    expect(niceTicks(-4203, 802, 4)).toEqual([-4000, -2000, 0]);
    expect(niceTicks(0, 3495, 4)).toEqual([0, 1000, 2000, 3000]);
  });
});

describe('определение режима', () => {
  it('id, порядок и боковая панель', async () => {
    const { mode } = await import('./mode');
    expect(mode.id).toBe('martian');
    expect(mode.order).toBe(30);
    expect(mode.fullscreen).toBe(false);
    expect(mode.Panel).toBeTruthy();
  });
});
