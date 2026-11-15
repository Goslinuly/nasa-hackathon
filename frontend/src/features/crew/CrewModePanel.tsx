// Боковая панель режима «Экипаж». Оболочка рисует заголовок и кнопку выхода сама,
// отсюда только содержимое: расчёты по человеку из shared/eva/crew.ts.

import type { ModeContext } from '@/app/modeContract';

import { CrewPanel } from './CrewPanel';

export default function CrewModePanel(_ctx: ModeContext) {
  return (
    <>
      <p className="crew-intro">
        Что происходит с человеком на поверхности: сколько он весит и как прыгает, сколько ест,
        сколько тепла надо отвести, сколько кислорода стоит маршрут и какую дозу он набирает.
        Рядом с каждым числом стоит, измерение это, модель или принятое правило.
      </p>
      <CrewPanel />
    </>
  );
}
