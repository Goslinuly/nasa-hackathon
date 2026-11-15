// Боковая панель режима «Экипаж». Оболочка рисует заголовок и кнопку выхода сама,
// отсюда только содержимое: расчёты по человеку из shared/eva/crew.ts.

import type { ModeContext } from '@/app/modeContract';
import { useT } from '@/shared/i18n/lang';

import { CrewPanel } from './CrewPanel';

export default function CrewModePanel(_ctx: ModeContext) {
  const t = useT();
  return (
    <>
      <p className="crew-intro">
        {t(
          'Что происходит с человеком на поверхности: сколько он весит и как прыгает, сколько ест, '
            + 'сколько тепла надо отвести, сколько кислорода стоит маршрут и какую дозу он набирает. '
            + 'Рядом с каждым числом стоит, измерение это, модель или принятое правило.',
          'What happens to a human on the surface: how much they weigh and how high they jump, how much '
            + 'they eat, how much heat must be removed, what the route costs in oxygen and what dose it '
            + 'adds. Every number is labelled as a measurement, a model or an accepted rule.',
        )}
      </p>
      <CrewPanel />
    </>
  );
}
