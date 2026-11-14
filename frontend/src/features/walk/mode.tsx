// Режим прогулки от первого лица по рельефу HiRISE (docs/TZ_First_Person.md, разделы 2–5).
import { lazy } from 'react';
import type { ModeDefinition } from '@/app/modeContract';

export const mode: ModeDefinition = {
  id: 'walk',
  title: 'От первого лица',
  description: 'Прогулка по реальному рельефу HiRISE там, где есть подробная DTM',
  order: 10,
  fullscreen: true,
  paramKey: 'site',
  Panel: lazy(() => import('./WalkPanel')),
};
