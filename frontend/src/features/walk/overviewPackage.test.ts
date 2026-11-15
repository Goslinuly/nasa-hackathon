import { describe, expect, it } from 'vitest';
import { MARS_R } from './geo';
import { decodeMola, gridSize, OVERVIEW_MAX_CELLS, OVERVIEW_MIN_CELL_M, routeBox, sampleMola } from './overviewPackage';

const DEG = Math.PI / 180;

describe('обзорный пакет', () => {
  it('рамка через шов 0/360 непрерывна и с полями', () => {
    const b = routeBox([
      { lat: 10, lonEast: 359.5 },
      { lat: 10.5, lonEast: 0.5 },
    ]);
    expect(b.west).toBeLessThan(-0.5);
    expect(b.east).toBeGreaterThan(0.5);
    expect(b.east - b.west).toBeLessThan(2);
    expect(b.south).toBeLessThan(10);
    expect(b.north).toBeGreaterThan(10.5);
  });

  it('поле не меньше 2 км', () => {
    const b = routeBox([
      { lat: -13, lonEast: 300 },
      { lat: -13, lonEast: 300.01 },
    ]);
    expect((-13 - b.south) * DEG * MARS_R).toBeGreaterThanOrEqual(1999);
    expect(b.west).toBeCloseTo(-60 - 2000 / (MARS_R * Math.cos(13 * DEG)) / DEG, 6);
  });

  it('сетка не больше 1024 и шаг не мельче 30 м', () => {
    const big = gridSize(800_000, 300_000);
    expect(big.cols).toBeLessThanOrEqual(OVERVIEW_MAX_CELLS);
    expect(big.rows).toBeLessThanOrEqual(OVERVIEW_MAX_CELLS);
    expect(big.cell).toBeCloseTo(800_000 / 1024, 6);
    const small = gridSize(5000, 4000);
    expect(small.cell).toBe(OVERVIEW_MIN_CELL_M);
    expect(small.cols).toBe(167);
  });

  it('высота MOLA в центре пикселя и интерполяция через 0/360', () => {
    // Сетка 4×2 при 1 px/град: формула та же, что у настоящей (R,G — единицы, B = 0).
    const units = [8192, 8193, 8194, 8195, 8200, 8200, 8200, 8200];
    const px: number[] = [];
    for (const u of units) px.push(u >> 8, u & 255, 0);
    const g = decodeMola(px, 3, 4, 2, 8192, 4, 1);
    expect(g.data[1]).toBe(4);
    // Центр пикселя (столбец 1, строка 0): lon 1.5, lat 89.5.
    expect(sampleMola(g, 1.5, 89.5)).toBeCloseTo(4, 6);
    // Между последним и первым столбцом.
    expect(sampleMola(g, 0, 89.5)).toBeCloseTo(6, 6);
    expect(sampleMola(g, 360, 89.5)).toBeCloseTo(6, 6);
  });
});
