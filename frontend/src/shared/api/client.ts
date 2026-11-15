// HTTP-клиент API /api/v1.
//
// Каждый запрос несёт ?lang= текущего языка интерфейса: тексты API (пояснения, подписи,
// ошибки) приходят на нём же, компонентам ничего передавать не нужно.
import type { MarsPoint } from '@/shared/coordinates/mars';
import { getLang, tr } from '@/shared/i18n/lang';

import type {
  RadAnalysisResponse,
  ResearchRoute,
  ScienceIntake,
} from './scienceTypes';
import type {
  GaleConditions,
  MobilityProfileRequest,
  MobilityProfileResponse,
  RadLiveResponse,
  RadiationResponse,
  RouteDoseResponse,
  RoverPhotosResponse,
  RoverPositionsResponse,
  SlopesResponse,
  SolarEventsResponse,
  SpaceWeatherSummary,
  WalkbackRequest,
  WalkbackResponse,
} from './evaTypes';
import type { CoverageResponse } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Адрес эндпоинта с параметрами и языком интерфейса (?lang=ru|en). */
export function apiUrl(path: string, params?: Record<string, string | number>): URL {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(`${API_BASE}${path}`, origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set('lang', getLang());
  return url;
}

// Ответ nginx при недоступном backend приходит только по-русски: он не знает языка интерфейса.
function errorMessage(code: string, message: string): string {
  if (code === 'api_unreachable') {
    return tr(
      message,
      'The API is unreachable. Check the API_HOST variable of the frontend service ' +
        '(private host:port or https://public-domain) and the backend status.',
    );
  }
  return message;
}

async function getJson<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const response = await fetch(apiUrl(path, params));
  if (!response.ok) {
    let code = 'http_error';
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
    }
    throw new ApiError(code, errorMessage(code, message), response.status);
  }
  return (await response.json()) as T;
}

export function fetchCoverage(latDeg: number, lonDeg: number): Promise<CoverageResponse> {
  return getJson<CoverageResponse>('/coverage', { lat: latDeg, lon: lonDeg });
}

export function fetchRadAnalysis(params: {
  start?: string;
  end?: string;
  include_flagged: string;
}): Promise<RadAnalysisResponse> {
  const defined = Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  return getJson<RadAnalysisResponse>('/science/rad', defined);
}

export function fetchScienceIntake(): Promise<ScienceIntake> {
  return getJson<ScienceIntake>('/science/intake');
}

export async function fetchResearchRoute(
  points: MarsPoint[],
  corridorM: number,
): Promise<ResearchRoute> {
  const response = await fetch(apiUrl('/science/research/along-route'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points, corridor_m: corridorM }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const code = body?.error?.code ?? 'http_error';
    throw new ApiError(
      code,
      errorMessage(
        code,
        body?.error?.message ??
          tr(
            `Ошибка поиска исследований: HTTP ${response.status}`,
            `Research search failed: HTTP ${response.status}`,
          ),
      ),
      response.status,
    );
  }
  return (await response.json()) as ResearchRoute;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    const code = failure?.error?.code ?? 'http_error';
    throw new ApiError(
      code,
      errorMessage(
        code,
        failure?.error?.message ??
          tr(`Ошибка EVA: HTTP ${response.status}`, `EVA request failed: HTTP ${response.status}`),
      ),
      response.status,
    );
  }
  return (await response.json()) as T;
}

export const fetchMobilityProfile = (request: MobilityProfileRequest) =>
  postJson<MobilityProfileResponse>('/eva/mobility-profile', request);

export const fetchWalkback = (request: WalkbackRequest) => postJson<WalkbackResponse>('/eva/walkback', request);

export const fetchEvaRadiation = (deltaHM: number) =>
  getJson<RadiationResponse>('/eva/radiation', { delta_h_m: Math.round(deltaHM) });

export const fetchEvaSlopes = () => getJson<SlopesResponse>('/eva/slopes');

export const fetchEvaConditions = () => getJson<GaleConditions>('/eva/conditions');

export const fetchEvaRadLive = (days = 30) => getJson<RadLiveResponse>('/eva/rad-live', { days });

export const fetchEvaSolarEvents = (days = 14) => getJson<SolarEventsResponse>('/eva/solar-events', { days });

export const fetchEvaSpaceWeather = () => getJson<SpaceWeatherSummary>('/eva/space-weather');

export const fetchRouteDose = (seconds: number, deltaHM: number | null) =>
  postJson<RouteDoseResponse>('/eva/route-dose', {
    seconds,
    ...(deltaHM != null ? { delta_h_m: deltaHM } : {}),
  });

export const fetchRoverPhotos = (rover: string, sol: number, limit = 6) =>
  getJson<RoverPhotosResponse>('/rovers/photos', { rover, sol, limit });

export const fetchRoverPositions = () => getJson<RoverPositionsResponse>('/rovers/positions');
