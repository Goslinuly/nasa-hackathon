// Сборка параметров поиска маршрута из состояния панели и подписи модельных величин выхода.
import { formatCorridor, formatDuration } from '@/features/eva/evaProfile';
import { DEFAULT_TRAVERSE, type TraverseParams } from '@/shared/eva/traverse';

import type { RouteOptions } from './routing';

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

export function buildRouteOptions(base: RouteOptions, costModel: CostModel, traverse: TraverseParams): RouteOptions {
  const rest: RouteOptions = { maxSlopeDeg: base.maxSlopeDeg, slopeWeight: base.slopeWeight };
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
