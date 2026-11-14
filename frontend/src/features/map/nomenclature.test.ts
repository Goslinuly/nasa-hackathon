// Тесты конверсии долготы, порогов видимости подписей и отбора с лимитом и защитой от наложений.
import { describe, expect, it } from 'vitest';
import { eastToSigned, isLabelVisible, KM_PER_DEGREE, MAX_LABELS, parseNomenclature, selectLabels, type NamedFeature } from './nomenclature';

const feature = (name: string, lat: number, lon: number, d_km: number, type = 'Crater, craters'): NamedFeature => ({ name, lat, lon, d_km, type });

describe('nomenclature longitude', () => {
  it('converts east longitude 0..360 to -180..180', () => {
    expect(eastToSigned(0)).toBe(0);
    expect(eastToSigned(180)).toBe(180);
    expect(eastToSigned(270)).toBe(-90);
    expect(eastToSigned(354.8433)).toBeCloseTo(-5.1567, 4);
  });
  it('converts during parsing and drops malformed rows', () => {
    const parsed = parseNomenclature({ credit: 'IAU', features: [feature('A', 0, 300, 10), { name: 'bad' }] });
    expect(parsed.features).toHaveLength(1);
    expect(parsed.features[0].lon).toBe(-60);
    expect(() => parseNomenclature({})).toThrow();
  });
});

describe('label visibility', () => {
  const ppdFor = (kmPerPx: number) => KM_PER_DEGREE / kmPerPx;
  it('requires 30..3000 px on screen', () => {
    expect(isLabelVisible(300, ppdFor(10))).toBe(true);
    expect(isLabelVisible(200, ppdFor(10))).toBe(false);
    expect(isLabelVisible(40000, ppdFor(10))).toBe(false);
  });
  it('shows point features only when closer than 5 km/px', () => {
    expect(isLabelVisible(0, ppdFor(4))).toBe(true);
    expect(isLabelVisible(0, ppdFor(8))).toBe(false);
  });
});

describe('label selection', () => {
  const view = { centerLon: 0, centerLat: 0, pixelsPerDegree: 4, width: 1000, height: 600 };
  it('prefers larger features and skips overlapping labels', () => {
    const labels = selectLabels([feature('Small', 0, 0, 400), feature('Big', 0, 1, 1200)], view);
    expect(labels.map(l => l.name)).toEqual(['Big']);
  });
  it('uppercases large Terra/Planitia forms', () => {
    const [label] = selectLabels([feature('Noachis Terra', 0, 0, 1200, 'Terra, terrae')], view);
    expect(label).toMatchObject({ name: 'NOACHIS TERRA', major: true });
  });
  it('caps the number of labels', () => {
    const many = Array.from({ length: 300 }, (_, i) => feature('F' + i, -30 + (i % 20) * 3, -100 + Math.floor(i / 20) * 12, 300 + i));
    expect(selectLabels(many, { ...view, pixelsPerDegree: 10, width: 2000, height: 1000 }).length).toBeLessThanOrEqual(MAX_LABELS);
  });
  it('ignores features outside the viewport', () => {
    expect(selectLabels([feature('Far', 0, 170, 1200)], view)).toEqual([]);
  });
});
