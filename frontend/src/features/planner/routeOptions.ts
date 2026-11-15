// Сборка параметров поиска маршрута из состояния панели и подписи модельных величин выхода.
import { formatCorridor, formatDuration } from '@/features/eva/evaProfile';
import { DEFAULT_TRAVERSE, type TraverseParams } from '@/shared/eva/traverse';
import { getLang, locale, tr } from '@/shared/i18n/lang';

import type { DataLevel, RouteOptions } from './routing';

export type CostModel = 'distance' | 'eva';

export const CREW_RANGE_KG = { min: 50, max: 150 } as const;
export const LOAD_RANGE_KG = { min: 0, max: 100 } as const;

export const EVA_DEFAULT_TRAVERSE = DEFAULT_TRAVERSE;

export const EVA_PROVENANCE_RU =
  'Модель Санти с поправкой спуска, коэффициент грунта, коридор двух трактовок марсианской тяжести; расход у людей плохо предсказуем заранее.';
export const EVA_PROVENANCE_EN =
  'Santee model with a downhill correction, a terrain factor, and a corridor between two readings of Martian gravity; human consumption is hard to predict in advance.';

/** Подпись модели расхода на текущем языке. */
export function evaProvenance(): string {
  return tr(EVA_PROVENANCE_RU, EVA_PROVENANCE_EN);
}

/** Сохранено для старых импортов: русская подпись. */
export const EVA_PROVENANCE = EVA_PROVENANCE_RU;

/** Причины отказа поиска приходят из воркера по-русски; здесь — их английские версии. */
const REASON_EN: Record<string, string> = {
  'Нужны хотя бы старт и финиш': 'At least a start and a finish are needed',
  'Карта высот ещё не загружена': 'The height map is not loaded yet',
  'Размер сетки не совпадает': 'Grid size does not match',
  'Некорректные координаты': 'Invalid coordinates',
  'Точка вне участка детального рельефа': 'Point is outside the detailed terrain site',
  'Точка попала в область без данных рельефа': 'Point falls in an area with no terrain data',
};

export function routeReasonText(reason: string): string {
  return getLang() === 'en' ? (REASON_EN[reason] ?? reason) : reason;
}

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
  return formatCorridor(lowL, highL, tr('л', 'L'));
}

export function outsideModelWarning(count: number): string | null {
  if (count <= 0) return null;
  const last = count % 10;
  const tail = count % 100;
  if (getLang() === 'en') {
    return `${count} route ${count === 1 ? 'segment is' : 'segments are'} outside the speed model's valid range (slope beyond ±20°): the estimate there is extrapolated.`;
  }
  const word = last === 1 && tail !== 11 ? 'участок' : last >= 2 && last <= 4 && (tail < 10 || tail >= 20) ? 'участка' : 'участков';
  return `${count} ${word} маршрута вышли за область определения модели скорости (уклон за ±20°): для них оценка экстраполирована.`;
}

export function formatDistanceKm(m: number): string {
  return `${(m / 1000).toLocaleString(locale(), { maximumFractionDigits: m < 100_000 ? 1 : 0 })} ${tr('км', 'km')}`;
}

export function formatSand(sandM: number): string {
  return `${tr('Песок', 'Sand')}: ${formatDistanceKm(sandM)}`;
}

export function formatUnknownSurface(unknownM: number): string | null {
  return unknownM > 0 ? `${tr('Без данных грунта', 'No surface data')}: ${formatDistanceKm(unknownM)}` : null;
}

export function formatBlockedCells(count: number, maxRuggedDeg: number): string | null {
  if (count <= 0) return null;
  const last = count % 10;
  const tail = count % 100;
  if (getLang() === 'en') return `The search avoided ${count} ${count === 1 ? 'cell' : 'cells'} with ruggedness steeper than ${maxRuggedDeg}°`;
  const word = last === 1 && tail !== 11 ? 'ячейку' : last >= 2 && last <= 4 && (tail < 10 || tail >= 20) ? 'ячейки' : 'ячеек';
  return `Поиск обошёл ${count} ${word} с изрезанностью круче ${maxRuggedDeg}°`;
}

export function formatDataLevel(level: DataLevel): { label: string; tone: 'good' | 'warn' } {
  return level === 'local_dtm'
    ? { label: tr('детальный DTM участка', 'detailed site DTM'), tone: 'good' }
    : { label: tr('орбитальный обзор MOLA ~7.4 км', 'MOLA orbital overview ~7.4 km'), tone: 'warn' };
}

export function dataLevelNote(level: DataLevel, pixelM: number | null, maxSlopeDeg: number): string {
  if (getLang() === 'en') {
    if (level === 'local_dtm') {
      const step = pixelM != null ? `${pixelM} m/px` : 'metre steps';
      return `Computed on the site grid (${step}). Areas steeper than ${maxSlopeDeg}° are excluded, but rocks smaller than the grid step are still not visible.`;
    }
    return `Overview estimate on MOLA ~7.4 km/px. Areas steeper than ${maxSlopeDeg}° are excluded, but cliffs, rocks and craters smaller than ~7 km are not taken into account.`;
  }
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
  if (getLang() === 'en') return `via ${count} ${count === 1 ? 'stop' : 'stops'}`;
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
