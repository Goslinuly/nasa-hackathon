// Режим «Слои» для оболочки.
import { lazy } from 'react';

import type { ModeDefinition } from '@/app/modeContract';

export const mode: ModeDefinition = {
  id: 'layers',
  title: 'Слои',
  description: 'Спектр подложки, снимки CTX и HiRISE, рельеф',
  order: 90,
  fullscreen: false,
  Panel: lazy(() => import('./LayersPanel')),
};
