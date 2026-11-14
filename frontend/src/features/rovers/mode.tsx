// Режим «Маршруты роверов»: треки Perseverance и Curiosity, текущие позиции и Ingenuity.
import { lazy } from 'react';

import type { ModeDefinition } from '@/app/modeContract';

export const mode: ModeDefinition = {
  id: 'rovers',
  title: 'Маршруты роверов',
  description: 'Пути Perseverance и Curiosity и где они сейчас',
  order: 20,
  fullscreen: false,
  Panel: lazy(() => import('./RoversPanel')),
};
