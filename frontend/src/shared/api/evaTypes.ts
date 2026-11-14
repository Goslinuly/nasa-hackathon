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

export interface SpaceWeatherMarsOk {
  status: 'ok';
  latest_ugy_per_sol: number;
  latest_time: string;
  median_30d_ugy_per_sol: number;
  ratio_to_median: number;
  source?: string;
  note: string;
}

export interface SpaceWeatherEarthOk {
  status: 'ok';
  source: string;
  caveat: string;
  proton_flux_10mev_pfu: number;
  proton_flux_10mev_max24h_pfu: number;
  proton_time_utc: string;
  s_scale_now: number;
  s_scale_max24h: number;
  xray_flux_wm2: number;
  xray_class: string;
  xray_time_utc: string;
  noaa_scales_now: { R: string | null; S: string | null; G: string | null };
}

export interface SpaceWeatherSummary {
  mars_measured: SpaceWeatherMarsOk | SourceUnavailable;
  earth_measured: SpaceWeatherEarthOk | SourceUnavailable;
  events:
    | { status: 'ok'; events: { type: string; start_utc: string; summary: string; link: string }[] }
    | SourceUnavailable;
  advisory: {
    level: 'calm' | 'elevated' | 'event_at_earth';
    reasons: string[];
    provenance: Provenance;
  };
}

export interface RouteDoseResponse {
  dose_msv: { low: number; mid: number; high: number; units: string };
  fraction_of_sol: number;
  rate_corridor: { low: number; mid: number; high: number };
  elevation_correction: { delta_h_m: number; delta_ugy_per_sol: number; status: string } | null;
  provenance: Provenance;
}

export interface RoverPhoto {
  sol: number;
  instrument: string;
  time_utc: string | null;
  url: string;
}

export interface RoverPhotosOk {
  status: 'ok';
  rover: string;
  sol: number;
  count: number;
  photos: RoverPhoto[];
  source: string;
  credit: string;
  caveat: string;
}

export type RoverPhotosResponse = RoverPhotosOk | SourceUnavailable;
