// Показания карточки у марсохода: путь, время и кислород по модели выхода в точке, куда доехала анимация.
import { segmentCost, type Surface, type TraverseParams } from '@/shared/eva/traverse';
import { locale, tr } from '@/shared/i18n/lang';

const DEG = Math.PI / 180;

export interface ProfilePoint {
  distanceM: number;
  heightM: number;
  surface?: string;
}

export interface RoverModel extends TraverseParams {
  /** Грунт берётся из каждой точки профиля (песок/плотный), как в расчёте маршрута по данным. */
  perCell: boolean;
}

interface Segment {
  fromM: number;
  toM: number;
  /** Накопленные к началу участка время и кислород. */
  seconds: number;
  o2LowL: number;
  o2HighL: number;
  cost: ReturnType<typeof segmentCost>;
  slopeDeg: number;
}

export interface RoverTable {
  segments: Segment[];
  totalM: number;
  totalSeconds: number;
  totalO2LowL: number;
  totalO2HighL: number;
}

export interface RoverStats {
  distanceM: number;
  totalM: number;
  seconds: number;
  totalSeconds: number;
  o2LowL: number;
  o2HighL: number;
  totalO2LowL: number;
  totalO2HighL: number;
  speedMs: number;
  slopeDeg: number;
  /** Текущий расход кислорода, л/мин (вилка модели). */
  rateLowLpm: number;
  rateHighLpm: number;
}

/** Таблица по профилю маршрута: участки с той же ценой, что и в итогах планировщика. */
export function buildRoverTable(points: ProfilePoint[], model: RoverModel): RoverTable {
  const segments: Segment[] = [];
  let seconds = 0;
  let o2LowL = 0;
  let o2HighL = 0;
  for (let i = 1; i < points.length; i++) {
    const run = points[i].distanceM - points[i - 1].distanceM;
    if (!(run > 0)) continue;
    const slopeDeg = Math.atan((points[i].heightM - points[i - 1].heightM) / run) / DEG;
    const surface: Surface = model.perCell ? (points[i].surface === 'sand' ? 'sand' : 'firm') : model.surface;
    const cost = segmentCost(run, slopeDeg, { crewKg: model.crewKg, loadKg: model.loadKg, surface });
    segments.push({ fromM: points[i - 1].distanceM, toM: points[i].distanceM, seconds, o2LowL, o2HighL, cost, slopeDeg });
    seconds += cost.seconds;
    o2LowL += cost.o2LowL;
    o2HighL += cost.o2HighL;
  }
  const first = points[0]?.distanceM ?? 0;
  const last = points.at(-1)?.distanceM ?? 0;
  return { segments, totalM: Math.max(0, last - first), totalSeconds: seconds, totalO2LowL: o2LowL, totalO2HighL: o2HighL };
}

/** Показания в точке, где пройдена доля progress (0..1) длины маршрута. */
export function roverStatsAt(table: RoverTable, progress: number): RoverStats | null {
  const { segments } = table;
  if (!segments.length) return null;
  const share = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const start = segments[0].fromM;
  const at = start + share * table.totalM;
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].toM < at) lo = mid + 1;
    else hi = mid;
  }
  const segment = segments[lo];
  const span = segment.toM - segment.fromM;
  const f = Math.min(1, Math.max(0, (at - segment.fromM) / span));
  const { cost } = segment;
  const minutes = cost.seconds / 60;
  return {
    distanceM: at - start,
    totalM: table.totalM,
    seconds: segment.seconds + f * cost.seconds,
    totalSeconds: table.totalSeconds,
    o2LowL: segment.o2LowL + f * cost.o2LowL,
    o2HighL: segment.o2HighL + f * cost.o2HighL,
    totalO2LowL: table.totalO2LowL,
    totalO2HighL: table.totalO2HighL,
    speedMs: cost.speedMs,
    slopeDeg: segment.slopeDeg,
    rateLowLpm: minutes > 0 ? cost.o2LowL / minutes : 0,
    rateHighLpm: minutes > 0 ? cost.o2HighL / minutes : 0,
  };
}

const num = (value: number, digits: number) => value.toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function formatKmPair(doneM: number, totalM: number): string {
  const digits = totalM < 10_000 ? 2 : 1;
  return tr(`${num(doneM / 1000, digits)} из ${num(totalM / 1000, digits)} км`, `${num(doneM / 1000, digits)} of ${num(totalM / 1000, digits)} km`);
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const min = tr('мин', 'min');
  return hours === 0 ? `${minutes} ${min}` : `${hours} ${tr('ч', 'h')} ${String(minutes).padStart(2, '0')} ${min}`;
}

export function formatRange(low: number, high: number, digits: number, unit: string): string {
  const a = num(low, digits);
  const b = num(high, digits);
  return a === b ? `${a} ${unit}` : `${a}–${b} ${unit}`;
}

export interface RoverCardText {
  speed: string;
  rate: string;
  oxygen: string;
  time: string;
  distance: string;
}

export function roverCardText(stats: RoverStats): RoverCardText {
  return {
    speed: `${num(stats.speedMs * 3.6, 1)} ${tr('км/ч', 'km/h')}`,
    rate: formatRange(stats.rateLowLpm, stats.rateHighLpm, 2, tr('л/мин', 'L/min')),
    oxygen: formatRange(stats.o2LowL, stats.o2HighL, stats.o2HighL < 10 ? 1 : 0, tr('л', 'L')),
    time: formatClock(stats.seconds),
    distance: formatKmPair(stats.distanceM, stats.totalM),
  };
}
