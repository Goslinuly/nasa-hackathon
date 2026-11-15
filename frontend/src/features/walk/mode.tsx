// Режим прогулки от первого лица по рельефу HiRISE (ТЗ первого лица, разделы 2–5).
import { lazy } from 'react';
import type { ModeDefinition } from '@/app/modeContract';

export const mode: ModeDefinition = {
  id: 'walk',
  title: 'От первого лица',
  titleEn: 'First person',
  description: 'Прогулка по реальному рельефу HiRISE там, где есть подробная DTM',
  descriptionEn: 'Walk on real HiRISE terrain where a detailed DTM exists',
  order: 10,
  // Без участка — панель выбора над шаром (камера летает между участками), с участком — вся сцена.
  fullscreen: (params) => Boolean(params.site),
  paramKey: 'site',
  Panel: lazy(() => import('./WalkPanel')),
};
