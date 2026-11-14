// Режим «Памятные места»: где остались завершённые миссии на поверхности Марса.
import { lazy } from 'react';

import type { ModeDefinition } from '@/app/modeContract';

export const mode: ModeDefinition = {
  id: 'memorial',
  title: 'Памятные места',
  description: 'Где остались роверы и станции, которые больше не выходят на связь',
  order: 40,
  fullscreen: false,
  Panel: lazy(() => import('./MemorialPanel')),
};
