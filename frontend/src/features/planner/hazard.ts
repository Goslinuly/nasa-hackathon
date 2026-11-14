// Слои проходимости (изрезанность и тепловая инерция) для маршрута: опциональны, без них маршрут считается как раньше.

import { decodePng } from '@/features/walk/png';

import type { HazardGrid } from './routing';

export interface HazardLayerMeta {
  file: string;
  width: number;
  height: number;
  step: number;
  units?: string;
  source?: string;
  status?: string;
  note?: string;
}

export interface HazardManifest {
  pixels_per_degree: number;
  slope: HazardLayerMeta;
  thermal_inertia: HazardLayerMeta;
  surface_from_inertia: { sand_below: number; status?: string; note?: string };
  credit?: string;
  retrieved?: string;
}

export interface HazardBundle {
  grid: HazardGrid;
  manifest: HazardManifest;
}

function isLayer(value: unknown): value is HazardLayerMeta {
  const m = value as HazardLayerMeta | null;
  return (
    !!m &&
    typeof m.file === 'string' &&
    Number.isInteger(m.width) &&
    Number.isInteger(m.height) &&
    m.width > 0 &&
    m.height > 0 &&
    Number.isFinite(m.step) &&
    m.step > 0
  );
}

/** Проверка формы hazard.json; при расхождении — null. */
export function parseHazardManifest(raw: unknown): HazardManifest | null {
  const m = raw as HazardManifest | null;
  if (!m || !Number.isFinite(m.pixels_per_degree) || m.pixels_per_degree <= 0) return null;
  if (!isLayer(m.slope) || !isLayer(m.thermal_inertia)) return null;
  if (!Number.isFinite(m.surface_from_inertia?.sand_below)) return null;
  return m;
}

function firstChannel(png: { width: number; height: number; channels: number; data: Uint8Array }): Uint8Array {
  if (png.channels === 1) return png.data;
  const out = new Uint8Array(png.width * png.height);
  for (let i = 0; i < out.length; i++) out[i] = png.data[i * png.channels];
  return out;
}

async function loadLayer(base: string, meta: HazardLayerMeta, signal?: AbortSignal): Promise<Uint8Array> {
  const res = await fetch(base + meta.file, { signal });
  if (!res.ok) throw new Error(`Слой ${meta.file} недоступен (${res.status})`);
  const png = await decodePng(await res.arrayBuffer());
  if (png.width !== meta.width || png.height !== meta.height) throw new Error(`Размер ${meta.file} не совпадает с паспортом`);
  return firstChannel(png);
}

/** Собирает HazardGrid из манифеста и двух байтовых слоёв. */
export function buildHazardGrid(manifest: HazardManifest, slope: Uint8Array, inertia: Uint8Array): HazardGrid {
  return {
    width: manifest.slope.width,
    height: manifest.slope.height,
    pixelsPerDegree: manifest.pixels_per_degree,
    ruggedSlope: slope,
    slopeStepDeg: manifest.slope.step,
    inertia,
    inertiaStep: manifest.thermal_inertia.step,
    sandBelowTiu: manifest.surface_from_inertia.sand_below,
  };
}

/** Загрузка слоёв; null при любой ошибке сети или формата. */
export async function loadHazardGrid(signal?: AbortSignal): Promise<HazardBundle | null> {
  try {
    const base = `${import.meta.env.BASE_URL}data/hazard/`;
    const res = await fetch(`${base}hazard.json`, { signal });
    if (!res.ok) return null;
    const manifest = parseHazardManifest(await res.json());
    if (!manifest) return null;
    if (manifest.slope.width !== manifest.thermal_inertia.width || manifest.slope.height !== manifest.thermal_inertia.height) {
      return null;
    }
    const [slope, inertia] = await Promise.all([
      loadLayer(base, manifest.slope, signal),
      loadLayer(base, manifest.thermal_inertia, signal),
    ]);
    return { grid: buildHazardGrid(manifest, slope, inertia), manifest };
  } catch {
    return null;
  }
}

function pixelIndex(grid: HazardGrid, lon: number, lat: number): number {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) return -1;
  const east = ((lon % 360) + 360) % 360;
  const col = Math.min(grid.width - 1, Math.floor(east * grid.pixelsPerDegree));
  const row = Math.min(grid.height - 1, Math.floor((90 - lat) * grid.pixelsPerDegree));
  return row * grid.width + col;
}

/** Изрезанность на масштабе ~200 м в ячейке под точкой, градусы; не уклон под ногами. */
export function ruggedSlopeAt(grid: HazardGrid, lon: number, lat: number): number | null {
  const i = pixelIndex(grid, lon, lat);
  return i < 0 ? null : grid.ruggedSlope[i] * grid.slopeStepDeg;
}

/** Тепловая инерция в ячейке, Дж м^-2 К^-1 с^-1/2; null — нет данных. */
export function thermalInertiaAt(grid: HazardGrid, lon: number, lat: number): number | null {
  const i = pixelIndex(grid, lon, lat);
  if (i < 0 || grid.inertia[i] === 0) return null;
  return grid.inertia[i] * grid.inertiaStep;
}
