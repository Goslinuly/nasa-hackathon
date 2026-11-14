// Типы ответов API /api/v1 (временно вручную, до генерации из OpenAPI).
import type { MarsPoint } from '@/shared/coordinates/mars';

export type DataLevel = 'local_dtm' | 'orbital_overview' | 'unassessed';

export interface CoverageProduct {
  title: string;
  product_id: string | null;
  kind: string;
  resolution_m: number | null;
  registration_error_m: number | null;
  verification_status: string;
  license: string | null;
  credit: string | null;
}

export interface RegionCoverageCandidate {
  slug: string;
  name_ru: string;
  name_en: string;
  dtm_count: number;
  best_dtm_resolution_m: number | null;
  footprints_verified: boolean;
  verification_status: string;
  note: string | null;
}

export interface CoverageResponse {
  point: MarsPoint;
  data_level: DataLevel;
  explanation: string;
  overview_candidates: CoverageProduct[];
  published_overview: CoverageProduct[];
  local_candidates: RegionCoverageCandidate[];
  published_local: CoverageProduct[];
}

export interface RegionOut {
  slug: string;
  name_ru: string;
  name_en: string;
  description: string | null;
  coverage_status: string;
  bounds_verified: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
