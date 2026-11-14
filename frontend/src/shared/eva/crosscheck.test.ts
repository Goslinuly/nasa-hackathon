// Страж моделей скафандра: на ровном и на подъёме числа обязаны совпадать, расхождение на спуске — открытый вопрос ТЗ.

import { describe, expect, it } from 'vitest';

import { SPEED_MODEL_MAX_SLOPE_DEG, walkSpeed as suitSpeed } from './suit';
import { walkSpeed as traverseSpeed } from './traverse';

describe('две модели скорости в скафандре', () => {
  it('на ровном месте дают 0.75 м/с', () => {
    expect(suitSpeed(0)).toBeCloseTo(0.75, 9);
    expect(traverseSpeed(0).speedMs).toBeCloseTo(0.75, 9);
  });

  it('на подъёме совпадают', () => {
    for (const slope of [1, 5, 10, 15, 20]) {
      expect(suitSpeed(slope)).toBeCloseTo(traverseSpeed(slope).speedMs, 9);
    }
  });

  it('за пределом ±20° обе отмечают выход за область определения', () => {
    expect(suitSpeed(SPEED_MODEL_MAX_SLOPE_DEG + 1)).toBeNull();
    expect(traverseSpeed(SPEED_MODEL_MAX_SLOPE_DEG + 1).status).toBe('outside_model_domain');
  });

  it('на спуске прочтения ТЗ расходятся: по модулю уклона против знакового', () => {
    const bySign = traverseSpeed(-10).speedMs;
    const byAbsolute = suitSpeed(-10);
    expect(bySign).toBeCloseTo(0.85, 9);
    expect(byAbsolute).toBeCloseTo(0.65, 9);
    expect(bySign).not.toBeCloseTo(byAbsolute as number, 2);
  });
});
