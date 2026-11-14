// Автокачество прогулки: по частоте кадров меняется только разрешение рендера.
// Тени и художественная детализация — выбор пользователя, их регулятор не трогает.
//
// Раз в секунду приходит замер кадров/с. Два плохих замера подряд — ступень ниже,
// шесть хороших подряд — ступень выше. Разрыв между порогами не даёт качеству «дрожать».

/** Доли от базовой плотности пикселей, от лучшей к худшей. */
export const RENDER_SCALES = [1, 0.85, 0.7, 0.55] as const;

export interface QualityOptions {
  /** Ниже этого кадров/с — снижаем. */
  lowFps?: number;
  /** Выше этого кадров/с — можно повышать. */
  highFps?: number;
  /** Сколько плохих замеров подряд нужно для снижения. */
  downAfter?: number;
  /** Сколько хороших замеров подряд нужно для повышения. */
  upAfter?: number;
}

export class QualityGovernor {
  private level = 0;
  private bad = 0;
  private good = 0;
  private readonly lowFps: number;
  private readonly highFps: number;
  private readonly downAfter: number;
  private readonly upAfter: number;

  constructor(opts: QualityOptions = {}) {
    this.lowFps = opts.lowFps ?? 40;
    this.highFps = opts.highFps ?? 56;
    this.downAfter = opts.downAfter ?? 2;
    this.upAfter = opts.upAfter ?? 6;
  }

  /** Текущая доля разрешения. */
  get scale(): number {
    return RENDER_SCALES[this.level];
  }

  /** Новый замер кадров/с. Возвращает true, если доля разрешения изменилась. */
  sample(fps: number): boolean {
    if (!Number.isFinite(fps) || fps <= 0) return false;
    if (fps < this.lowFps) {
      this.good = 0;
      if (++this.bad >= this.downAfter && this.level < RENDER_SCALES.length - 1) {
        this.level++;
        this.bad = 0;
        return true;
      }
    } else if (fps > this.highFps) {
      this.bad = 0;
      if (++this.good >= this.upAfter && this.level > 0) {
        this.level--;
        this.good = 0;
        return true;
      }
    } else {
      this.bad = 0;
      this.good = 0;
    }
    return false;
  }

  /** После паузы (вкладка скрыта, меню) замеры недостоверны — начинаем счёт заново. */
  reset(): void {
    this.bad = 0;
    this.good = 0;
  }
}
