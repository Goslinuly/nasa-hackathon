// Режим «Маршруты роверов»: треки Perseverance и Curiosity, текущие позиции и Ingenuity.
import { lazy } from 'react';

import type { ModeDefinition } from '@/app/modeContract';

export const mode: ModeDefinition = {
  id: 'rovers',
  title: 'Маршруты роверов',
  titleEn: 'Rover routes',
  description: 'Пути Perseverance и Curiosity и где они сейчас',
  descriptionEn: 'Perseverance and Curiosity paths and where they are now',
  order: 20,
  fullscreen: false,
  Panel: lazy(() => import('./RoversPanel')),
};
