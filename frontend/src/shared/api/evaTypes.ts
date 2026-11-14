// Типы запросов и ответов API безопасности выхода (EVA): коридоры, возврат, уклоны, радиация, живые данные.

export type EvaSurface = 'firm' | 'sand';

export interface Provenance {
  source: string;
  status: string;
  units: string;
  note?: string;
}

export interface UnitCorridor {
  low: number;
  high: number;
  unit: string;
}

export interface EvaPoint {
  distance_m: number;
  slope_deg: number;
}

export type SlopeLevel = 'comfortable' | 'caution' | 'excluded_by_planner' | 'extreme';

export interface SlopeClass {
  slope_deg: number;
  level: SlopeLevel;
  label: string;
  notes: string[];
  provenance: Provenance;
}

export interface MobilitySegment {
  length_m: number;
  slope_deg: number;
  speed_m_s: number;
  status: string;
  power_w: UnitCorridor;
  o2_rate_lpm: UnitCorridor;
  speed_info: Record<string, unknown>;
  slope_class: SlopeClass;
}

export interface MobilityProfileRequest {
  points: EvaPoint[];
  crew_kg: number;
  load_kg: number;
  surface: EvaSurface;
}

export interface MobilityProfileResponse {
  segments: MobilitySegment[];
  totals: { time_s: number; o2_l: UnitCorridor };
  inputs: { crew_kg: number; load_kg: number; surface: EvaSurface };
  provenance: { speed: Provenance; terrain: Provenance; power: Provenance; oxygen: Provenance; time_note: string };
}

export interface WalkbackRequest {
  points: { distance_from_base_m: number }[];
  o2_remaining_l: number;
}

export interface WalkbackPoint {
  distance_from_base_m: number;
  allowed: boolean;
  t_return_min: number;
  o2_need_l: number;
  margin_l: number;
}

export interface WalkbackResponse {
  points: WalkbackPoint[];
  farthest_allowed_m: number | null;
  provenance: Provenance;
}

export interface DoseCorridor {
  low: number;
  mid: number;
  high: number;
  range_low: number;
  range_high: number;
  units: string;
  provenance: Provenance;
}

export interface QualityFactor {
  low: number;
  mid: number;
  high: number;
  label: string;
  default: boolean;
  provenance: Provenance;
}

export interface RadiationResponse {
  dose_corridor: DoseCorridor;
  quality_factors: QualityFactor[];
  solar_event_facts: string[];
  elevation_correction?: { delta_h_m: number; delta_ugy_per_sol: number; status: string; provenance: Provenance };
}

export interface SlopeThreshold {
  key: string;
  low_deg: number;
  high_deg: number;
  nature: string;
  label: string;
}

export interface SlopeFact {
  key: string;
  text: string;
  status: string;
}

export interface SlopesResponse {
  thresholds: SlopeThreshold[];
  facts: SlopeFact[];
}

export interface SourceUnavailable {
  status: 'source_unavailable';
  detail: string;
}

export interface GaleConditionsOk {
  status: 'ok';
  source: string;
  url: string;
  units: Record<string, string>;
  latest: {
    sol: number;
    terrestrial_date: string;
    season: string;
    ls_deg: number;
    min_temp_c: number;
    max_temp_c: number;
    pressure_pa: number;
    atmo_opacity: string;
    sunrise: string;
    sunset: string;
  };
  previous: unknown[];
  caveat: string;
}

export interface RadLiveOk {
  status: 'ok';
  source: string;
  dataset: string;
  url: string;
  days: number;
  unit: string;
  count: number;
  series: {
    time: string;
    dose_ugy_per_sol: number;
    dose_msv_per_sol: number;
    dose_msv_low: number;
    dose_msv_high: number;
  }[];
  caveat: string;
  quality_factor: number;
  quality_factor_status: string;
  dose_msv_unit: string;
}

export interface SolarEvent {
  type: 'FLR' | 'CMEAnalysis' | 'SEP' | string;
  time: string;
  link?: string;
  class?: string;
  speed_km_s?: number;
}

export interface SolarEventsOk {
  status: 'ok';
  source: string;
  days: number;
  count: number;
  events: SolarEvent[];
  caveat: string;
  applicable_to_mars_map: boolean;
}

export type GaleConditions = GaleConditionsOk | SourceUnavailable;
export type RadLiveResponse = RadLiveOk | SourceUnavailable;
export type SolarEventsResponse = SolarEventsOk | SourceUnavailable;
