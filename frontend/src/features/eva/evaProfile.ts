// Чистые функции EVA: профиль маршрута в сегменты уклонов, подписи коридоров и уровень уклона.
import type { EvaPoint, SlopeLevel as SlopeClassLevel, SlopeThreshold } from '@/shared/api/evaTypes';

export interface ProfileSample {
  distanceM: number;
  heightM: number;
}

export type SlopeLevel = 'ok' | 'warn' | 'limit';

export const MAX_EVA_POINTS = 500;

function thin<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  const step = (items.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => items[Math.round(index * step)]);
}

export function buildEvaPoints(profile: ProfileSample[], limit = MAX_EVA_POINTS): EvaPoint[] {
  const kept = thin(profile, limit);
  const result: EvaPoint[] = [];
  for (let i = 1; i < kept.length; i += 1) {
    const run = kept[i].distanceM - kept[i - 1].distanceM;
    if (!(run > 0)) continue;
    const rise = kept[i].heightM - kept[i - 1].heightM;
    result.push({ distance_m: run, slope_deg: (Math.atan(rise / run) * 180) / Math.PI });
  }
  return result;
}

export function cumulativeDistances(points: EvaPoint[]): number[] {
  let total = 0;
  return points.map((point) => (total += point.distance_m));
}

export function elevationGain(profile: ProfileSample[]): number {
  if (profile.length === 0) return 0;
  return Math.max(...profile.map((p) => p.heightM)) - profile[0].heightM;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} мин`;
  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`;
}

export function formatLiters(liters: number): string {
  return `${liters.toLocaleString('ru-RU', { maximumFractionDigits: liters < 10 ? 2 : 0 })} л`;
}

export function formatCorridor(low: number, high: number, unit: string): string {
  const fmt = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  return `${fmt(low)}–${fmt(high)} ${unit}`;
}

const LEVEL_BADGE: Record<SlopeClassLevel, SlopeLevel> = {
  comfortable: 'ok',
  caution: 'warn',
  excluded_by_planner: 'limit',
  extreme: 'limit',
};

export function levelBadge(level: SlopeClassLevel): SlopeLevel {
  return LEVEL_BADGE[level] ?? 'limit';
}

export function slopeBadge(slopeDeg: number, thresholds: SlopeThreshold[]): SlopeLevel {
  const abs = Math.abs(slopeDeg);
  const warn = thresholds.find((t) => t.key === 'conservative_plan')?.high_deg ?? 15;
  const limit = thresholds.find((t) => t.key === 'planning_tool_limit')?.high_deg ?? 20;
  if (abs > limit) return 'limit';
  if (abs >= warn) return 'warn';
  return 'ok';
}
