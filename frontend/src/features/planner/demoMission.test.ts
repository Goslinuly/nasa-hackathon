// Демо-миссия обязана попадать в участок детального рельефа Гейла и идти через остановку.
import { describe, expect, it } from 'vitest';

import { distanceM } from '@/shared/rovers/nearTrack';

import { DEMO_MISSION } from './demoMission';

const GALE_BOXWORK_BOUNDS = { west: 137.367341, south: -4.824455, east: 137.397709, north: -4.783965 };

describe('демо-миссия boxwork', () => {
  it('все точки внутри участка HiRISE DTM gale-boxwork', () => {
    for (const p of [DEMO_MISSION.a, ...DEMO_MISSION.stops, DEMO_MISSION.b]) {
      expect(p.lon).toBeGreaterThan(GALE_BOXWORK_BOUNDS.west);
      expect(p.lon).toBeLessThan(GALE_BOXWORK_BOUNDS.east);
      expect(p.lat).toBeGreaterThan(GALE_BOXWORK_BOUNDS.south);
      expect(p.lat).toBeLessThan(GALE_BOXWORK_BOUNDS.north);
    }
  });

  it('есть научная остановка, и ноги маршрута короче пешего дня', () => {
    expect(DEMO_MISSION.stops.length).toBeGreaterThan(0);
    const legs = [DEMO_MISSION.a, ...DEMO_MISSION.stops, DEMO_MISSION.b];
    for (let i = 1; i < legs.length; i++) {
      expect(distanceM(legs[i - 1], legs[i])).toBeLessThan(5000);
    }
  });

  it('расстояние по сфере Марса считается правдоподобно', () => {
    expect(distanceM({ lon: 0, lat: 0 }, { lon: 0, lat: 1 })).toBeCloseTo(59160, -3);
  });
});
