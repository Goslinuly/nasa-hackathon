// Режим «Маршрут „Марсианина“»: путь Марка Уотни от Ares 3 до Ares 4 на глобусе.
import { lazy } from 'react';

import type { ModeDefinition } from '@/app/modeContract';

export const mode: ModeDefinition = {
  id: 'martian',
  title: 'Маршрут „Марсианина“',
  description: 'Путь Марка Уотни из романа и рельеф под ним',
  order: 30,
  fullscreen: false,
  Panel: lazy(() => import('./MartianPanel')),
};
