// Сборка параметров поиска маршрута из состояния панели и подписи модельных величин выхода.
import { formatCorridor, formatDuration } from '@/features/eva/evaProfile';
import { DEFAULT_TRAVERSE, type TraverseParams } from '@/shared/eva/traverse';

import type { DataLevel, RouteOptions } from './routing';

export type CostModel = 'distance' | 'eva';

export const CREW_RANGE_KG = { min: 50, max: 150 } as const;
export const LOAD_RANGE_KG = { min: 0, max: 100 } as const;

export const EVA_DEFAULT_TRAVERSE = DEFAULT_TRAVERSE;

export const EVA_PROVENANCE =
  'Модель Санти с поправкой спуска, коэффициент грунта, коридор двух трактовок марсианской тяжести; расход у людей плохо предсказуем заранее.';

export function clampMass(value: number, range: { min: number; max: number }, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

export function buildRouteOptions(
  base: RouteOptions,
  costModel: CostModel,
  traverse: TraverseParams,
  surfaceFromData = true,
): RouteOptions {
  const rest: RouteOptions = { maxSlopeDeg: base.maxSlopeDeg, slopeWeight: base.slopeWeight };
  if (!surfaceFromData) rest.surfaceFromData = false;
  return costModel === 'eva' ? { ...rest, costModel: 'eva', traverse: { ...traverse } } : rest;
}

export function formatModelTime(seconds: number): string {
  return formatDuration(seconds);
}

export function formatOxygenCorridor(lowL: number, highL: number): string {
  return formatCorridor(lowL, highL, 'л');
}

export function outsideModelWarning(count: number): string | null {
  if (count <= 0) return null;
  const last = count % 10;
  const tail = count % 100;
  const word = last === 1 && tail !== 11 ? 'участок' : last >= 2 && last <= 4 && (tail < 10 || tail >= 20) ? 'участка' : 'участков';
  return `${count} ${word} маршрута вышли за область определения модели скорости (уклон за ±20°): для них оценка экстраполирована.`;
}

export function formatDistanceKm(m: number): string {
  return `${(m / 1000).toLocaleString('ru-RU', { maximumFractionDigits: m < 100_000 ? 1 : 0 })} км`;
}

export function formatSand(sandM: number): string {
  return `Песок: ${formatDistanceKm(sandM)}`;
}

export function formatUnknownSurface(unknownM: number): string | null {
  return unknownM > 0 ? `Без данных грунта: ${formatDistanceKm(unknownM)}` : null;
}

export function formatBlockedCells(count: number, maxRuggedDeg: number): string | null {
  if (count <= 0) return null;
  const last = count % 10;
  const tail = count % 100;
  const word = last === 1 && tail !== 11 ? 'ячейку' : last >= 2 && last <= 4 && (tail < 10 || tail >= 20) ? 'ячейки' : 'ячеек';
  return `Поиск обошёл ${count} ${word} с изрезанностью круче ${maxRuggedDeg}°`;
}

export function formatDataLevel(level: DataLevel): { label: string; tone: 'good' | 'warn' } {
  return level === 'local_dtm'
    ? { label: 'детальный DTM участка', tone: 'good' }
    : { label: 'орбитальный обзор MOLA ~7.4 км', tone: 'warn' };
}

export function dataLevelNote(level: DataLevel, pixelM: number | null, maxSlopeDeg: number): string {
  if (level === 'local_dtm') {
    const step = pixelM != null ? `${pixelM} м/пикс` : 'метровым шагом';
    return `Расчёт по сетке участка (${step}). Участки круче ${maxSlopeDeg}° исключены, но камни мельче шага сетки всё равно не видны.`;
  }
  return `Обзорная оценка по MOLA ~7.4 км/пикс. Участки круче ${maxSlopeDeg}° исключены, но обрывы, камни и кратеры мельче ~7 км не учтены.`;
}

export function formatStopsCount(count: number): string | null {
  if (count <= 0) return null;
  const last = count % 10;
  const tail = count % 100;
  const word = last === 1 && tail !== 11 ? 'остановку' : last >= 2 && last <= 4 && (tail < 10 || tail >= 20) ? 'остановки' : 'остановок';
  return `через ${count} ${word}`;
}

export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return items;
  const next = items.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
