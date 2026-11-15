// Параметры человека для прогулки: рост, вес, скафандр, прыжок на Земле.
// Хранятся в браузере; без сохранённых значений — DEFAULT_CREW.

import { useSyncExternalStore } from 'react';
import { DEFAULT_CREW } from './crew';

export interface CrewProfile {
  heightCm: number;
  bodyKg: number;
  /** Скафандр с ранцем, кг. */
  loadKg: number;
  /** Высота прыжка на Земле без скафандра, м. */
  earthJumpM: number;
}

export const DEFAULT_PROFILE: CrewProfile = {
  heightCm: DEFAULT_CREW.heightCm,
  bodyKg: DEFAULT_CREW.bodyKg,
  loadKg: DEFAULT_CREW.loadKg,
  earthJumpM: DEFAULT_CREW.earthJumpM,
};

/** Допустимые пределы полей: за ними модель теряет смысл. */
export const PROFILE_LIMITS: Record<keyof CrewProfile, [number, number]> = {
  heightCm: [120, 220],
  bodyKg: [35, 160],
  loadKg: [0, 150],
  earthJumpM: [0, 1.2],
};

/** Приводит любые данные к корректному профилю: нечисла — значения по умолчанию, остальное — в пределы. */
export function normalizeProfile(raw: unknown): CrewProfile {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_PROFILE };
  for (const key of Object.keys(PROFILE_LIMITS) as (keyof CrewProfile)[]) {
    const v = src[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const [lo, hi] = PROFILE_LIMITS[key];
    out[key] = Math.min(hi, Math.max(lo, v));
  }
  return out;
}

const KEY = 'martian-map-crew-profile';
const listeners = new Set<() => void>();

function load(): CrewProfile {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return normalizeProfile(JSON.parse(s));
  } catch {
    // Хранилище недоступно или запись испорчена — берём значения по умолчанию.
  }
  return { ...DEFAULT_PROFILE };
}

let current: CrewProfile = load();

export function getCrewProfile(): CrewProfile {
  return current;
}

export function setCrewProfile(patch: Partial<CrewProfile>): void {
  current = normalizeProfile({ ...current, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Не сохранилось — профиль всё равно действует до перезагрузки.
  }
  listeners.forEach((fn) => fn());
}

export function subscribeCrewProfile(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useCrewProfile(): CrewProfile {
  return useSyncExternalStore(subscribeCrewProfile, getCrewProfile, getCrewProfile);
}
