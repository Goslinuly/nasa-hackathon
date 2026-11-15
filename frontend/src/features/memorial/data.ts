// Данные режима «Памятные места»: завершённые миссии на поверхности Марса и свечи зрителя.
import type { GlobeMarker } from '@/app/modeContract';
import { getLang, locale, pick, tr } from '@/shared/i18n/lang';

export interface Mission {
  id: string;
  name: string;
  name_en?: string;
  agency: string;
  kind: string;
  kind_en?: string;
  lat: number;
  lon: number;
  place: string;
  place_en?: string;
  landed: string;
  last_contact: string;
  mission_end?: string;
  first_flight?: string;
  distance_km?: number;
  flights?: number;
  legacy: string;
  legacy_en?: string;
  note?: string;
  note_en?: string;
  quote_note?: string;
  quote_note_en?: string;
  sources: string[];
}

export interface MissionsFile {
  fetched_utc: string;
  coordinates: string;
  note: string;
  note_en?: string;
  missions: Mission[];
}

export const MISSIONS_URL = '/data/memorial/missions.json';
export const MEMORIAL_COLOR = '#d9d2c3';

export async function loadMissions(signal?: AbortSignal): Promise<MissionsFile> {
  const response = await fetch(MISSIONS_URL, { signal });
  if (!response.ok) throw new Error(tr(`Не удалось загрузить список миссий: ${response.status}`, `Could not load the mission list: ${response.status}`));
  return (await response.json()) as MissionsFile;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ошибки в записи миссии; пустой список — запись в порядке. */
export function missionProblems(m: Mission): string[] {
  const problems: string[] = [];
  if (!m.id || !m.name) problems.push('нет id или имени');
  if (!(m.lat >= -90 && m.lat <= 90)) problems.push('широта вне диапазона');
  if (!(m.lon >= 0 && m.lon < 360)) problems.push('долгота вне 0–360');
  for (const key of ['landed', 'last_contact', 'mission_end', 'first_flight'] as const) {
    const value = m[key];
    if (value !== undefined && !ISO_DATE.test(value)) problems.push(`${key}: не дата`);
  }
  if (m.last_contact < m.landed) problems.push('последняя связь раньше посадки');
  if (!m.sources.length || !m.sources.every(s => /^https:\/\//.test(s))) problems.push('нет источников https');
  if (!m.legacy) problems.push('нет описания');
  return problems;
}

export function missionMarkers(missions: Mission[]): GlobeMarker[] {
  return missions.map(m => ({
    id: m.id,
    lon: m.lon,
    lat: m.lat,
    label: pick(m.name, m.name_en),
    kind: 'memorial',
    color: MEMORIAL_COLOR,
  }));
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «2004-01-25» → «25 января 2004» (по-английски — «January 25, 2004»). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  if (getLang() === 'en') {
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Сколько земных дней прошло между двумя датами ISO. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// --- Свечи: только в браузере зрителя ------------------------------------------------------

const CANDLES_KEY = 'martian-map:memorial-candles';

export function readCandles(storage: Pick<Storage, 'getItem'> | null): Set<string> {
  try {
    const raw = storage?.getItem(CANDLES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function writeCandles(storage: Pick<Storage, 'setItem'> | null, candles: Set<string>): void {
  try {
    storage?.setItem(CANDLES_KEY, JSON.stringify([...candles]));
  } catch {
    // Хранилище недоступно (приватное окно) — свеча горит до перезагрузки.
  }
}

export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
