// Типы ответов научных эндпоинтов API.
interface ChannelSummary {
  dose_microgy: number | null;
  weighted_mean_rate_microgy_h: number | null;
  min_rate_microgy_h: number | null;
  max_rate_microgy_h: number | null;
}

export interface RadAnalysisResponse {
  dataset: {
    source_file: string;
    source_sheet: string;
    source_columns: string;
    source_sha256: string;
    /** На языке запроса (?lang=); limitations_en — английский вариант всегда. */
    limitations: string[];
    limitations_en?: string[];
  };
  analysis: {
    status: 'observations_available' | 'no_observations';
    start_utc: string;
    end_utc: string;
    total_source_observations: number;
    selected_observations: number;
    excluded_flagged_observations: number;
    measured_duration_s: number;
    unmeasured_duration_s: number;
    coverage_fraction: number;
    b: ChannelSummary;
    e: ChannelSummary;
    observations: {
      source_row: number;
      interval_start_utc: string;
      qc: string;
      used_duration_s: number;
      rate_b_microgy_h: number;
      rate_e_microgy_h: number;
      dose_b_microgy: number;
      dose_e_microgy: number;
    }[];
  };
}

export interface ScienceIntake {
  sources: { filename: string; reason: string; reason_en?: string; duplicate_of?: string }[];
}

/** title/summary/position_evidence — на языке запроса; *_en — английский вариант, если есть. */
export interface ResearchStudy {
  id: number; external_id: string; title: string; summary: string;
  title_en?: string | null; summary_en?: string | null;
  mission: string | null; instrument: string | null; source_url: string | null;
  latitude_deg: number | null; longitude_deg: number | null;
  position_evidence: string | null; position_uncertainty_m: number | null;
  position_evidence_en?: string | null;
  verification_status: string;
}

export interface ResearchRoute {
  route_length_m: number; corridor_m: number; explanation: string;
  matched_total: number; unlocated_studies: number; truncated: boolean;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  studies: PlacedStudy[];
  nearby: PlacedStudy[];
  nearby_total: number;
}

export type RouteSide = 'left' | 'right' | 'on_line';

export type PlacedStudy = ResearchStudy & {
  distance_from_start_m: number;
  distance_from_route_m: number;
  side: RouteSide;
};
