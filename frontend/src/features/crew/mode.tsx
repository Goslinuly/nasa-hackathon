// Режим «Экипаж»: физиология выхода — прыжок, рацион, теплоотдача, кислород, доза.
import { lazy } from 'react';

import type { ModeDefinition } from '@/app/modeContract';

export const mode: ModeDefinition = {
  id: 'crew',
  title: 'Экипаж',
  titleEn: 'Crew',
  description: 'Прыжок, рацион, теплоотдача, кислород и доза по весу и маршруту',
  descriptionEn: 'Jump, ration, heat load, oxygen and dose from body mass and route',
  order: 50,
  fullscreen: false,
  Panel: lazy(() => import('./CrewModePanel')),
};
