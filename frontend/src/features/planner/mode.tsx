// Режим «Построить маршрут» для оболочки.
import { lazy } from 'react';

import type { ModeDefinition } from '@/app/modeContract';

export const mode: ModeDefinition = {
  id: 'route',
  title: 'Построить маршрут',
  description: 'Путь A → Б по рельефу MOLA, профиль высот',
  order: 10,
  fullscreen: false,
  Panel: lazy(() => import('./RoutePanel')),
};
