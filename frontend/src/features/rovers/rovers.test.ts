// Тесты слоя роверов: упрощённые треки и текущие позиции из build_rover_layers.py.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { formatLatLon, roverItems, roverMarkers, traversePoints, type CurrentFile, type TraverseFile } from './data';
import { setLang } from '@/shared/i18n/lang';

// Тексты проверяются на русском; английские — отдельными проверками.
setLang('ru');

const read = <T,>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../../public/data/rovers/${name}`, import.meta.url), 'utf-8')) as T;

const traverses: Record<string, TraverseFile> = {
  perseverance: read('m20_traverse.geojson'),
  curiosity: read('msl_traverse.geojson'),
};
const current = read<CurrentFile>('current.json');

describe('упрощённые треки', () => {
  for (const [id, file] of Object.entries(traverses)) {
    it(`${id}: не больше 2000 точек, солы на каждую точку и по возрастанию`, () => {
      const feature = file.features[0];
      const coords = feature.geometry.coordinates;
      expect(coords.length).toBeGreaterThan(100);
      expect(coords.length).toBeLessThanOrEqual(2000);
      expect(feature.properties.sols).toHaveLength(coords.length);
      const sols = feature.properties.sols;
      expect(sols.every((s, i) => i === 0 || s >= sols[i - 1])).toBe(true);
      expect(file.source_url).toMatch(/^https:\/\/mars\.nasa\.gov\/mmgis-maps\//);
      expect(Number.isNaN(Date.parse(file.fetched_utc))).toBe(false);
    });

    it(`${id}: точки в пределах кратера, долгота восточная 0–360`, () => {
      const points = traversePoints(file);
      const lons = points.map(p => p.lon);
      const lats = points.map(p => p.lat);
      expect(Math.min(...lons)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...lons) - Math.min(...lons)).toBeLessThan(1);
      expect(Math.max(...lats) - Math.min(...lats)).toBeLessThan(1);
    });
  }

  it('MSL — из актуального файла Layers/json, а не устаревшего двойника 2020 года', () => {
    expect(traverses.curiosity.source_url).toContain('/MSL/Layers/json/MSL_waypoints.json');
    expect(traverses.curiosity.features[0].properties.sol_last).toBeGreaterThan(3000);
  });
});

describe('текущие позиции', () => {
  it('роверы и Ingenuity попадают в список и метки', () => {
    const items = roverItems(current);
    expect(items.map(i => i.id)).toEqual(['perseverance', 'curiosity', 'ingenuity']);
    for (const item of items) {
      expect(item.sol).toBeGreaterThan(0);
      expect(item.lat).toBeGreaterThan(-90);
      expect(item.lat).toBeLessThan(90);
      expect(item.lon).toBeGreaterThanOrEqual(0);
      expect(item.lon).toBeLessThan(360);
      expect(item.distanceKm).toBeGreaterThan(0);
    }
    expect(items.find(i => i.id === 'curiosity')?.walkSite).toBe('gale-boxwork');
    expect(items.find(i => i.id === 'perseverance')?.walkSite).toBe('jezero');
    expect(roverMarkers(items).every(m => m.kind === 'rover')).toBe(true);
  });

  it('последняя точка трека совпадает с текущей позицией ровера', () => {
    for (const rover of current.rovers) {
      const coords = traverses[rover.id].features[0].geometry.coordinates;
      const [lon, lat] = coords[coords.length - 1];
      expect(Math.abs(lat - rover.lat)).toBeLessThan(0.01);
      expect(Math.abs(lon - rover.lon)).toBeLessThan(0.01);
    }
  });

  it('у Ingenuity 72 полёта', () => {
    expect(current.ingenuity.flights_total).toBe(72);
  });
});

describe('formatLatLon', () => {
  it('южная широта и долгота 0–360', () => {
    expect(formatLatLon(-4.826, -222.6111, 2)).toBe('4.83° ю. ш., 137.39° в. д.');
    expect(formatLatLon(18.4, 77.2, 1)).toBe('18.4° с. ш., 77.2° в. д.');
    setLang('en');
    expect(formatLatLon(-4.826, -222.6111, 2)).toBe('4.83° S, 137.39° E');
    setLang('ru');
  });
});

describe('определение режима', () => {
  it('id, порядок и боковая панель', async () => {
    const { mode } = await import('./mode');
    expect(mode.id).toBe('rovers');
    expect(mode.order).toBe(20);
    expect(mode.fullscreen).toBe(false);
    expect(mode.Panel).toBeTruthy();
  });
});
