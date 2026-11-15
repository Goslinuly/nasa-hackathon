import { describe, expect, it } from 'vitest';
import { nextTimeScale } from './compact';

describe('nextTimeScale', () => {
  const scales = [1, 10, 60, 600];
  it('идёт по кругу и после ×600 возвращается к ×1', () => {
    expect(nextTimeScale(scales, 1)).toBe(10);
    expect(nextTimeScale(scales, 60)).toBe(600);
    expect(nextTimeScale(scales, 600)).toBe(1);
  });
  it('неизвестное значение — к первому за ×1', () => {
    expect(nextTimeScale(scales, 5)).toBe(1);
  });
});
