// Режим «Построить маршрут» для оболочки.
import { lazy } from 'react';

import type { ModeDefinition } from '@/app/modeContract';

export const mode: ModeDefinition = {
  id: 'route',
  title: 'Построить маршрут',
  titleEn: 'Plan a route',
  description: 'Путь A → Б по рельефу MOLA, профиль высот',
  descriptionEn: 'Path A → B over MOLA terrain, with an elevation profile',
  order: 10,
  fullscreen: false,
  Panel: lazy(() => import('./RoutePanel')),
};
