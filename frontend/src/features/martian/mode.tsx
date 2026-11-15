// Режим «Маршрут „Марсианина“»: путь Марка Уотни от Ares 3 до Ares 4 на глобусе.
import { lazy } from 'react';

import type { ModeDefinition } from '@/app/modeContract';

export const mode: ModeDefinition = {
  id: 'martian',
  title: 'Маршрут „Марсианина“',
  titleEn: 'The Martian route',
  description: 'Путь Марка Уотни из романа и рельеф под ним',
  descriptionEn: "Mark Watney's path from the novel and the terrain beneath it",
  order: 30,
  fullscreen: false,
  Panel: lazy(() => import('./MartianPanel')),
};
