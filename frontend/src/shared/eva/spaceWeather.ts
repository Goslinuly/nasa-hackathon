// Космическая погода: события NASA DONKI через наш backend. Каталог описывает обстановку у Земли.
import { apiUrl } from '@/shared/api/client';

export type DonkiType = 'FLR' | 'CME' | 'SEP' | 'GST';

export interface DonkiEvent {
  type: DonkiType | string;
  start_utc: string;
  summary: string;
  link: string;
}

export interface SpaceWeather {
  source: string;
  fetched_utc: string;
  note: string;
  events: DonkiEvent[];
}

export const DONKI_TYPE_LABEL: Record<string, string> = {
  FLR: 'вспышка',
  CME: 'выброс массы',
  SEP: 'поток частиц',
  GST: 'геомагнитная буря',
};

/** Для радиации на поверхности важнее потоки частиц и выбросы, потом вспышки; бури — у Земли. */
const RELEVANCE: Record<string, number> = { SEP: 3, CME: 2, FLR: 1, GST: 0 };

/** Самое свежее событие, при равном времени — более важное для радиации. */
export function latestRelevantEvent(sw: SpaceWeather | null): DonkiEvent | null {
  if (!sw || !Array.isArray(sw.events)) return null;
  const valid = sw.events.filter(e => Number.isFinite(Date.parse(e.start_utc)) && e.type in RELEVANCE);
  if (!valid.length) return null;
  valid.sort((a, b) => {
    const dt = Date.parse(b.start_utc) - Date.parse(a.start_utc);
    return dt !== 0 ? dt : (RELEVANCE[b.type] ?? 0) - (RELEVANCE[a.type] ?? 0);
  });
  return valid[0];
}

const loading = new Map<string, Promise<SpaceWeather | null>>();

/** Один запрос на язык; 404/503/сеть → null, HUD показывает «нет данных». */
export function loadSpaceWeather(days = 7): Promise<SpaceWeather | null> {
  const url = apiUrl('/space-weather/events', { days });
  const key = url.toString();
  let pending = loading.get(key);
  if (!pending) {
    pending = fetch(url)
      .then(r => (r.ok ? (r.json() as Promise<SpaceWeather>) : null))
      .then(sw => (sw && Array.isArray(sw.events) ? sw : null))
      .catch(() => null);
    loading.set(key, pending);
  }
  return pending;
}
