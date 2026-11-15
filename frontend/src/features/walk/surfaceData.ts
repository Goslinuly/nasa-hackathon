// Данные для карточки точки на поверхности: загружаются при первом касании и кэшируются.
// Любая ошибка — null («нет данных»), прогулка от этого не ломается.

import { loadHazardGrid, thermalInertiaAt, type HazardBundle } from '@/features/planner/hazard';
import { regionAt, type RegionInfo } from '@/shared/regions/regionAt';
import { fetchSiteIndex, type SiteIndexEntry } from './sitePackage';

let hazard: Promise<HazardBundle | null> | null = null;
let siteIndex: Promise<SiteIndexEntry[] | null> | null = null;

export interface InertiaSample {
  /** Дж м^-2 К^-1 с^-1/2; null — в ячейке нет данных. */
  value: number | null;
  units: string;
  source: string;
}

/** Тепловая инерция TES под точкой; null — слой не загрузился. */
export async function inertiaAt(lonEast: number, lat: number): Promise<InertiaSample | null> {
  hazard ??= loadHazardGrid().catch(() => null);
  const h = await hazard;
  if (!h) return null;
  return {
    value: thermalInertiaAt(h.grid, lonEast, lat),
    units: h.manifest.thermal_inertia.units ?? '',
    source: h.manifest.thermal_inertia.source ?? 'MGS TES',
  };
}

/** Единица геологической карты SIM 3292 и регион IAU под точкой. */
export async function geologyAt(lonEast: number, lat: number): Promise<RegionInfo | null> {
  try {
    return await regionAt(lonEast, lat);
  } catch {
    return null;
  }
}

/** Что известно о породах участка из index.json; null — нет описания. */
export async function siteGeology(siteId: string): Promise<{ ru: string; en?: string } | null> {
  siteIndex ??= fetchSiteIndex().catch(() => null);
  const list = await siteIndex;
  const e = list?.find((s) => s.id === siteId);
  return e?.geology ? { ru: e.geology, en: e.geology_en } : null;
}
