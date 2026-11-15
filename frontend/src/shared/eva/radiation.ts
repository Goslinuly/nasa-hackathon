// Радиация на выходе: модель эквивалентной дозы (ТЗ EVA 9.4) и архив RAD Curiosity из backend.
import { apiUrl } from '@/shared/api/client';
import { greatCircleKm } from '@/shared/time/mars24';

/** Типичная эквивалентная доза на поверхности, мЗв/сут (земные сутки), ТЗ EVA 9.4. */
export const DOSE_RATE_MSV_DAY = { typical: 0.64, sigma: 0.12, min: 0.25, max: 0.95 } as const;

export interface EvaDose {
  typicalMSv: number;
  lowMSv: number;
  highMSv: number;
  /** Диапазон по солнечному циклу. */
  cycleMinMSv: number;
  cycleMaxMSv: number;
}

/** Доза за выход = мощность × время выхода (модель). */
export function evaDose(evaSeconds: number): EvaDose {
  const days = Math.max(0, evaSeconds) / 86400;
  const r = DOSE_RATE_MSV_DAY;
  return {
    typicalMSv: r.typical * days,
    lowMSv: (r.typical - r.sigma) * days,
    highMSv: (r.typical + r.sigma) * days,
    cycleMinMSv: r.min * days,
    cycleMaxMSv: r.max * days,
  };
}

/** Кратер Гейл, место работы RAD на Curiosity. */
export const GALE = { lat: -4.6, lonEast: 137.4, radiusKm: 50 } as const;

export function distanceToGaleKm(lat: number, lonEast: number): number {
  return greatCircleKm(lat, lonEast, GALE.lat, GALE.lonEast);
}

export interface RadSummary {
  /** Средняя мощность поглощённой дозы, канал B, мкГр/ч. */
  rateMicroGyH: number;
  sol: number | null;
  startUtc: string;
  endUtc: string;
  observations: number;
  sourceFile: string;
  limitations: string[];
  kind?: 'live' | 'archive';
}

interface RadApiResponse {
  dataset?: { source_file?: string; limitations?: string[] };
  analysis?: {
    status?: string;
    start_utc?: string;
    end_utc?: string;
    selected_observations?: number;
    b?: { weighted_mean_rate_microgy_h?: number | null };
    observations?: { sol?: number }[];
  };
}

/** Разбор ответа /science/rad; null — измерений нет. */
export function parseRad(body: RadApiResponse | null): RadSummary | null {
  const a = body?.analysis;
  const rate = a?.b?.weighted_mean_rate_microgy_h;
  if (!a || a.status !== 'observations_available' || typeof rate !== 'number' || !Number.isFinite(rate)) {
    return null;
  }
  const sol = a.observations?.find(o => typeof o.sol === 'number')?.sol ?? null;
  return {
    rateMicroGyH: rate,
    sol,
    startUtc: a.start_utc ?? '',
    endUtc: a.end_utc ?? '',
    observations: a.selected_observations ?? 0,
    sourceFile: body?.dataset?.source_file ?? '',
    limitations: body?.dataset?.limitations ?? [],
  };
}

const radLoading = new Map<string, Promise<RadSummary | null>>();

const SOL_HOURS = 88775.244 / 3600;

interface RadLiveBody {
  status?: string;
  series?: { time?: string; dose_ugy_per_sol?: number; samples?: number }[];
  caveat?: string;
  dataset?: string;
}

/** Живой ряд ISWA → сводка в мкГр/ч; null — ряд пуст или не в нашем формате. */
export function parseRadLive(body: RadLiveBody | null): RadSummary | null {
  const last = body?.status === 'ok' ? body.series?.at(-1) : undefined;
  if (!last || typeof last.dose_ugy_per_sol !== 'number' || !Number.isFinite(last.dose_ugy_per_sol)) {
    return null;
  }
  return {
    rateMicroGyH: last.dose_ugy_per_sol / SOL_HOURS,
    sol: null,
    startUtc: last.time ?? '',
    endUtc: last.time ?? '',
    observations: last.samples ?? 0,
    sourceFile: body?.dataset ?? 'msl_rad_dosimetry',
    limitations: body?.caveat ? [body.caveat] : [],
    kind: 'live',
  };
}

/** Сначала живой ряд ISWA, при отказе — архив; один запрос за сессию на язык, ошибки → null. */
export function loadRad(): Promise<RadSummary | null> {
  const liveUrl = apiUrl('/eva/rad-live', { days: 30 });
  const archiveUrl = apiUrl('/science/rad');
  const key = liveUrl.toString();
  let pending = radLoading.get(key);
  if (!pending) {
    const archive = () =>
      fetch(archiveUrl)
        .then(r => (r.ok ? (r.json() as Promise<RadApiResponse>) : null))
        .then(parseRad)
        .catch(() => null);
    pending = fetch(liveUrl)
      .then(r => (r.ok ? (r.json() as Promise<RadLiveBody>) : null))
      .then(parseRadLive)
      .catch(() => null)
      .then(live => live ?? archive());
    radLoading.set(key, pending);
  }
  return pending;
}
