import type { MarsPoint } from '@/shared/coordinates/mars';

import type {
  RadAnalysisResponse,
  ResearchRoute,
  ResearchStudy,
  ScienceIntake,
} from './scienceTypes';
import type { CoverageResponse, RegionOut } from './types';

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

async function getJson<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url);
  if (!response.ok) {
    let code = 'http_error';
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // тело не JSON — оставляем HTTP-статус
    }
    throw new ApiError(code, message, response.status);
  }
  return (await response.json()) as T;
}

export function fetchCoverage(latDeg: number, lonDeg: number): Promise<CoverageResponse> {
  return getJson<CoverageResponse>('/coverage', { lat: latDeg, lon: lonDeg });
}

export function fetchRegions(): Promise<RegionOut[]> {
  return getJson<RegionOut[]>('/regions');
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

export function fetchResearchCatalog(): Promise<{
  total: number;
  measurement_count: number;
  studies: ResearchStudy[];
}> {
  return getJson('/science/research');
}

/**
 * Исследования рядом с путём. Коридор — обзорный поиск по сфере Марса,
 * а не подтверждение проходимости: маршрут планировщика считается по MOLA.
 */
export async function fetchResearchRoute(
  points: MarsPoint[],
  corridorM: number,
): Promise<ResearchRoute> {
  const response = await fetch(`${API_BASE}/science/research/along-route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points, corridor_m: corridorM }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      body?.error?.code ?? 'http_error',
      body?.error?.message ?? `Ошибка поиска исследований: HTTP ${response.status}`,
      response.status,
    );
  }
  return (await response.json()) as ResearchRoute;
}
