import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bearingDeg, eqcToLonLat, gridToLocal, localToGrid, localToLonLat, lonLatToEqc, lonLatToLocal, makeFrame, MARS_R } from './geo';
import { decodeHeights, decodeHeightUnits, sampleBilinear, sourceCode, type HeightGrid } from './heightGrid';
import { directionalSlopeDeg, slopeFromSamples, stepBlocked, TerrainSampler, walkSpeed } from './motion';
import { decodePng } from './png';
import { dataLevelLabel, parseTrack, type SiteManifest } from './sitePackage';

const dataDir = (site: string) => fileURLToPath(new URL(`../../../public/data/local/${site}/`, import.meta.url));
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

describe('декодирование высот', () => {
  it('units=0 — NoData, иначе base + (units-1)*step', () => {
    expect(decodeHeightUnits(0, 0, -3860, 0.01)).toBeNaN();
    expect(decodeHeightUnits(0, 1, -3860, 0.01)).toBe(-3860);
    expect(decodeHeightUnits(92, 72, -3860, 0.01)).toBeCloseTo(-3623.77, 6);
  });

  it('gale height.png: известные пиксели и сверка с высотами трека из скрипта сборки', async () => {
    const dir = dataDir('gale-boxwork');
    const manifest: SiteManifest = readJson(dir + 'manifest.json');
    const png = await decodePng(readFileSync(dir + 'height.png'));
    expect(png.width).toBe(900);
    expect(png.height).toBe(1200);
    expect(png.channels).toBe(3);
    // Пиксели (col 450, row 600) и (123, 456), посчитаны отдельным декодером на Python.
    const px = (c: number, r: number) => Array.from(png.data.subarray((r * 900 + c) * 3, (r * 900 + c) * 3 + 3));
    expect(px(450, 600)).toEqual([92, 72, 0]);
    expect(px(123, 456)).toEqual([52, 46, 0]);

    const h = manifest.height;
    const grid = decodeHeights(png.data, png.channels, png.width, png.height, h.base_m, h.step_m);
    expect(grid.data[0]).toBeCloseTo(h.min_m, 2);
    expect(grid.data[600 * 900 + 450]).toBeCloseTo(-3623.77, 2);
    let max = -Infinity;
    for (const v of grid.data) if (v > max) max = v;
    expect(max).toBeCloseTo(h.max_m, 2);

    // Скрипт сборки записал в трек билинейную высоту DTM в точке — наша выборка должна совпасть.
    const frame = makeFrame(manifest.bounds_eqc_m, h.pixel_m, h.width, h.height);
    const sampler = new TerrainSampler(grid, frame);
    const track = parseTrack(readJson(dir + 'track.geojson'), 'MSL');
    expect(track.rover).toBe('Curiosity');
    expect(track.points.length).toBeGreaterThan(100);
    for (const p of track.points.slice(0, 40)) {
      const local = lonLatToLocal(frame, p.lonEast, p.lat);
      expect(sampler.heightAt(local.x, local.z)).toBeCloseTo(p.dtmHeightM!, 1);
    }
  });
});

describe('билинейная выборка', () => {
  const grid: HeightGrid = { width: 3, height: 2, data: new Float32Array([0, 10, 20, 100, 110, NaN]) };
  it('интерполирует внутри и точно в узлах', () => {
    expect(sampleBilinear(grid, 0, 0)).toBe(0);
    expect(sampleBilinear(grid, 0.5, 0)).toBe(5);
    expect(sampleBilinear(grid, 0.5, 0.5)).toBeCloseTo(55);
  });
  it('NaN вне сетки и рядом с NoData', () => {
    expect(sampleBilinear(grid, -0.1, 0)).toBeNaN();
    expect(sampleBilinear(grid, 0, 1.1)).toBeNaN();
    expect(sampleBilinear(grid, 1.5, 0.5)).toBeNaN();
  });
});

describe('координаты', () => {
  it('eqc ↔ lon/lat туда и обратно, долгота 0–360', () => {
    const e = lonLatToEqc(331.371, 31.38);
    expect(e.x).toBeLessThan(0);
    expect(e.x).toBeCloseTo(MARS_R * (-28.629 * Math.PI) / 180, 3);
    const back = eqcToLonLat(e.x, e.y);
    expect(back.lonEast).toBeCloseTo(331.371, 9);
    expect(back.lat).toBeCloseTo(31.38, 9);
  });

  it('центр пакета gale совпадает с центром из паспорта', () => {
    const m: SiteManifest = readJson(dataDir('gale-boxwork') + 'manifest.json');
    const f = makeFrame(m.bounds_eqc_m, m.height.pixel_m, m.height.width, m.height.height);
    const c = localToLonLat(f, 0, 0);
    expect(c.lat).toBeCloseTo(m.center.lat, 5);
    expect(c.lonEast).toBeCloseTo(m.center.lon_east, 5);
    // Северо-западный пиксель: центр в (0, 0), ось z на юг.
    const nw = gridToLocal(f, 0, 0);
    expect(nw.z).toBeLessThan(0);
    expect(nw.x).toBeLessThan(0);
    const g = localToGrid(f, nw.x, nw.z);
    expect(g.col).toBeCloseTo(0, 9);
    expect(g.row).toBeCloseTo(0, 9);
  });

  it('по x метры по земле: eqc сжимается на cos(широты)', () => {
    const f = makeFrame([0, 1859040, 2000, 1861040], 2, 1000, 1000);
    expect(f.kx).toBeCloseTo(Math.cos(1860040 / MARS_R), 9);
    expect(gridToLocal(f, 999.5, 0).x - gridToLocal(f, -0.5, 0).x).toBeCloseTo(2000 * f.kx, 6);
  });

  it('азимут от севера по часовой', () => {
    expect(bearingDeg(0, -1)).toBeCloseTo(0);
    expect(bearingDeg(1, 0)).toBeCloseTo(90);
    expect(bearingDeg(0, 1)).toBeCloseTo(180);
    expect(bearingDeg(-1, 0)).toBeCloseTo(270);
  });
});

describe('модель ходьбы', () => {
  it('V = −0.01·θ + 0.75, не меньше 0.1', () => {
    expect(walkSpeed(0)).toBeCloseTo(0.75);
    expect(walkSpeed(20)).toBeCloseTo(0.55);
    expect(walkSpeed(-10)).toBeCloseTo(0.85);
    expect(walkSpeed(80)).toBeCloseTo(0.1);
    expect(walkSpeed(NaN)).toBeCloseTo(0.1);
  });

  it('уклон вдоль шага и крутизна', () => {
    expect(directionalSlopeDeg(0, 1, 1)).toBeCloseTo(45);
    expect(directionalSlopeDeg(0, -1, 1)).toBeCloseTo(-45);
    expect(directionalSlopeDeg(NaN, 1, 1)).toBeNaN();
    // Плоскость z = x·tan(30°): крутизна 30°.
    const t = Math.tan(Math.PI / 6);
    expect(slopeFromSamples(-t, t, 1, 0, 0, 1, 0)).toBeCloseTo(30);
    // С одной стороны NoData — односторонняя разность.
    expect(slopeFromSamples(NaN, t, 1, 0, 0, 1, 0)).toBeCloseTo(30);
    expect(slopeFromSamples(NaN, NaN, 1, 0, 0, 1, 0)).toBeNaN();
  });

  it('правило блокировки шага', () => {
    expect(stepBlocked(NaN, 5, 5, 20)).toBe('nodata');
    expect(stepBlocked(-3700, NaN, 5, 20)).toBe('nodata');
    expect(stepBlocked(-3700, 19, 5, 20)).toBeNull();
    expect(stepBlocked(-3700, 21, 5, 20)).toBe('slope');
    expect(stepBlocked(-3700, 21, 5, 25)).toBeNull();
    // Стоим на 30°, шаг на 24° — выбираемся, на 31° — нет.
    expect(stepBlocked(-3700, 24, 30, 20)).toBeNull();
    expect(stepBlocked(-3700, 31, 30, 20)).toBe('slope');
  });
});

describe('источник высот под ногами', () => {
  it('Езеро: метки канала B совпадают с манифестом, текущая позиция ровера — CTX', async () => {
    const manifest = JSON.parse(readFileSync(dataDir('jezero') + 'manifest.json', 'utf8')) as SiteManifest;
    const png = await decodePng(readFileSync(dataDir('jezero') + 'height.png'));
    const h = manifest.height;
    const grid = decodeHeights(png.data, png.channels, png.width, png.height, h.base_m, h.step_m);
    const counts = [0, 0, 0];
    for (const code of grid.source ?? []) counts[code] = (counts[code] ?? 0) + 1;
    const total = grid.width * grid.height;
    expect(counts[0] / total).toBeGreaterThan(0.15);
    expect(counts[1] / total).toBeGreaterThan(0.5);
    // Perseverance, sol 2022: 18.4356°N, 77.2332°E — HiRISE там нет.
    const frame = makeFrame(manifest.bounds_eqc_m, h.pixel_m, grid.width, grid.height);
    const local = lonLatToLocal(frame, 77.2332, 18.4356);
    const g = localToGrid(frame, local.x, local.z);
    expect(sourceCode(grid, g.col, g.row)).toBe(1);
    expect(dataLevelLabel(manifest, 1)).toContain('CTX');
    expect(dataLevelLabel(manifest, 0)).toContain('HiRISE');
  });

  it('пакет без канала источника подписывается как HiRISE', () => {
    const manifest = JSON.parse(readFileSync(dataDir('ares3') + 'manifest.json', 'utf8')) as SiteManifest;
    expect(dataLevelLabel(manifest, 0)).toBe('HiRISE DTM, сетка сцены 2 м');
  });

  it('procedural-пакет подписывается своим data_label, а не HiRISE', () => {
    const manifest = JSON.parse(readFileSync(dataDir('gale-procedural') + 'manifest.json', 'utf8')) as SiteManifest;
    expect(manifest.height.data_label).toBe('процедурная модель, шаг сетки 0.13 м');
    expect(dataLevelLabel(manifest, 0)).toBe(manifest.height.data_label);
    expect(dataLevelLabel(manifest, 0)).not.toContain('HiRISE');
  });
});
