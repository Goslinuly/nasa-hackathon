import { describe, expect, it } from 'vitest';

import { QualityGovernor, RENDER_SCALES } from './quality';

describe('автокачество прогулки', () => {
  it('снижает разрешение после двух медленных секунд и не ниже последней ступени', () => {
    const q = new QualityGovernor();
    expect(q.sample(25)).toBe(false);
    expect(q.sample(25)).toBe(true);
    expect(q.scale).toBe(RENDER_SCALES[1]);
    for (let i = 0; i < 20; i++) q.sample(10);
    expect(q.scale).toBe(RENDER_SCALES[RENDER_SCALES.length - 1]);
  });

  it('повышает только после шести быстрых секунд подряд; средняя частота сбрасывает счёт', () => {
    const q = new QualityGovernor();
    q.sample(20);
    q.sample(20);
    expect(q.scale).toBeLessThan(1);
    for (let i = 0; i < 5; i++) expect(q.sample(60)).toBe(false);
    q.sample(50);
    for (let i = 0; i < 5; i++) q.sample(60);
    expect(q.scale).toBeLessThan(1);
    expect(q.sample(60)).toBe(true);
    expect(q.scale).toBe(1);
  });

  it('один провал и сброс после паузы не меняют разрешение', () => {
    const q = new QualityGovernor();
    q.sample(20);
    q.reset();
    expect(q.sample(20)).toBe(false);
    expect(q.scale).toBe(1);
    expect(q.sample(Number.NaN)).toBe(false);
  });
});
