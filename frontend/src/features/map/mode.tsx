// Режим «2D-атлас» для оболочки: плоская карта на весь экран.
import { lazy } from 'react';

import type { ModeDefinition } from '@/app/modeContract';

export const mode: ModeDefinition = {
  id: 'atlas',
  title: '2D-атлас',
  description: 'Плоская карта со слоями и покрытием точки',
  order: 80,
  fullscreen: true,
  Panel: lazy(() => import('./AtlasPage').then((m) => ({ default: m.AtlasMode }))),
};
