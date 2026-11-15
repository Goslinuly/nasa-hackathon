// Научные цели вдоль маршрута: признаки выводятся из уже загруженных слоёв NASA
// (геология SIM 3292, тепловая инерция TES, профиль высот), а не из каталога исследований.
// Это подсказка, где остановиться, а не измерение и не подтверждённая находка.

export type TargetKind = 'geology_contact' | 'bedrock' | 'dunes' | 'scarp' | 'vantage';

export interface GeologyUnitRef {
  unit: string;
  label: string;
}

/** Точка маршрута со значениями слоёв под ней. */
export interface RouteSample {
  lon: number;
  lat: number;
  /** Расстояние от старта по маршруту, м. */
  alongM: number;
  heightM: number;
  slopeDeg: number;
  geology: GeologyUnitRef | null;
  /** Тепловая инерция, Дж·м⁻²·К⁻¹·с⁻¹ᐟ²; null — нет данных. */
  inertia: number | null;
}

export interface RouteTarget {
  id: string;
  kind: TargetKind;
  lon: number;
  lat: number;
  alongM: number;
  /** Заголовок, объяснение и происхождение признака: пара (русский, английский). */
  title: [string, string];
  why: [string, string];
  evidence: [string, string];
}

/** Выше этого порога грунт трактуется как камень, корка или крупные обломки. */
export const BEDROCK_TIU = 350;
/** Уступ в профиле: уклон на масштабе данных маршрута. */
export const SCARP_SLOPE_DEG = 8;
/** Насколько локальная вершина должна подниматься над соседями, м. */
export const VANTAGE_PROMINENCE_M = 60;
/** Минимальная длина песчаного участка, который стоит отмечать, м. */
export const DUNE_RUN_M = 300;
export const MAX_TARGETS = 8;

export interface TargetOptions {
  /** Порог рыхлого песка из hazard.json. */
  sandBelow: number;
  /** На каком рельефе построен маршрут: от этого зависит смысл уклона и высоты. */
  dataLevel: 'local_dtm' | 'orbital_overview';
  maxTargets?: number;
}

const GEOLOGY_EVIDENCE: [string, string] = [
  'Геологическая карта USGS SIM 3292 (Tanaka и др., 2014), упрощение 0,02° ≈ 1,2 км',
  'USGS geologic map SIM 3292 (Tanaka et al., 2014), simplified to 0.02° ≈ 1.2 km',
];

const INERTIA_EVIDENCE: [string, string] = [
  'Тепловая инерция TES (Putzig и др., 2005), ячейка около 3 км',
  'TES thermal inertia (Putzig et al., 2005), about 3 km per cell',
];

function reliefEvidence(dataLevel: TargetOptions['dataLevel']): [string, string] {
  return dataLevel === 'local_dtm'
    ? ['Рельеф HiRISE, сетка 1 м', 'HiRISE terrain, 1 m grid']
    : ['Рельеф MOLA, ячейка около 7,4 км', 'MOLA relief, about 7.4 km per cell'];
}

interface Candidate extends RouteTarget {
  /** Чем выше, тем раньше цель попадает в список при тесноте. */
  score: number;
}

function midpoint(a: RouteSample, b: RouteSample) {
  return { lon: (a.lon + b.lon) / 2, lat: (a.lat + b.lat) / 2, alongM: (a.alongM + b.alongM) / 2 };
}

function contacts(samples: RouteSample[]): Candidate[] {
  const found: Candidate[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < samples.length; i++) {
    const before = samples[i - 1].geology;
    const after = samples[i].geology;
    if (!before || !after || before.unit === after.unit) continue;
    const pair = [before.unit, after.unit].sort().join('|');
    if (seen.has(pair)) continue;
    seen.add(pair);
    const at = midpoint(samples[i - 1], samples[i]);
    found.push({
      id: `contact-${pair}-${Math.round(at.alongM)}`,
      kind: 'geology_contact',
      ...at,
      score: 4,
      title: [
        `Контакт единиц ${before.unit} и ${after.unit}`,
        `Contact of units ${before.unit} and ${after.unit}`,
      ],
      why: [
        `Граница двух геологических единиц: ${before.label} и ${after.label}. ` +
          'На контакте видно, какая порода лежит выше, то есть порядок событий. ' +
          'Положение границы на карте масштаба 1:20 000 000 верно до километра — выход искать на месте.',
        `The boundary between two geologic units: ${before.label} and ${after.label}. ` +
          'At a contact you see which rock lies on top, that is, the order of events. ' +
          'On a 1:20,000,000 map the boundary is good to about a kilometre — find the outcrop on the ground.',
      ],
      evidence: GEOLOGY_EVIDENCE,
    });
  }
  return found;
}

function localMaxima(values: (number | null)[], minimum: number): number[] {
  const peaks: number[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    const value = values[i];
    if (value === null || value < minimum) continue;
    const before = values[i - 1] ?? -Infinity;
    const after = values[i + 1] ?? -Infinity;
    if (value >= before && value >= after) peaks.push(i);
  }
  return peaks;
}

function bedrock(samples: RouteSample[]): Candidate[] {
  return localMaxima(
    samples.map((sample) => sample.inertia),
    BEDROCK_TIU,
  ).map((index) => {
    const sample = samples[index];
    const value = Math.round(sample.inertia ?? 0);
    return {
      id: `bedrock-${Math.round(sample.alongM)}`,
      kind: 'bedrock' as const,
      lon: sample.lon,
      lat: sample.lat,
      alongM: sample.alongM,
      score: 3,
      title: [`Плотный грунт, инерция ${value}`, `Firm ground, inertia ${value}`],
      why: [
        'Высокая тепловая инерция: под ногами скорее камень, корка или крупные обломки, а не пыль. ' +
          'Образец отсюда берётся с местной породы, а не с перенесённого ветром материала.',
        'High thermal inertia: the ground here is rock, duricrust or coarse debris rather than dust. ' +
          'A sample taken here comes from local rock, not from wind-blown material.',
      ],
      evidence: INERTIA_EVIDENCE,
    };
  });
}

function dunes(samples: RouteSample[], sandBelow: number): Candidate[] {
  const found: Candidate[] = [];
  let start = -1;
  for (let i = 0; i <= samples.length; i++) {
    const sand = i < samples.length && samples[i].inertia !== null && samples[i].inertia! < sandBelow;
    if (sand && start < 0) start = i;
    if (!sand && start >= 0) {
      const from = samples[start];
      const to = samples[i - 1];
      const lengthM = to.alongM - from.alongM;
      if (lengthM >= DUNE_RUN_M) {
        const at = midpoint(from, to);
        found.push({
          id: `dunes-${Math.round(at.alongM)}`,
          kind: 'dunes',
          ...at,
          score: 2,
          title: [
            `Рыхлый материал, ${Math.round(lengthM / 100) / 10} км`,
            `Loose material, ${Math.round(lengthM / 100) / 10} km`,
          ],
          why: [
            'Низкая тепловая инерция на всём участке: рыхлый материал, обычно эоловый перенос. ' +
              'Цель по современным процессам — рябь, дюны, слоистость песка. ' +
              'Идти по нему тяжелее, расход кислорода выше.',
            'Low thermal inertia along the whole stretch: loose material, usually wind-transported. ' +
              'A target for present-day processes — ripples, dunes, sand layering. ' +
              'Walking here is harder and costs more oxygen.',
          ],
          evidence: INERTIA_EVIDENCE,
        });
      }
      start = -1;
    }
  }
  return found;
}

function scarps(samples: RouteSample[], dataLevel: TargetOptions['dataLevel']): Candidate[] {
  return localMaxima(
    samples.map((sample) => Math.abs(sample.slopeDeg)),
    SCARP_SLOPE_DEG,
  ).map((index) => {
    const sample = samples[index];
    const value = Math.abs(sample.slopeDeg).toFixed(1);
    return {
      id: `scarp-${Math.round(sample.alongM)}`,
      kind: 'scarp' as const,
      lon: sample.lon,
      lat: sample.lat,
      alongM: sample.alongM,
      score: 3,
      title: [`Уступ, уклон ${value}°`, `Scarp, slope ${value}°`],
      why: [
        'Самое крутое место участка: слои выходят в разрезе, и их видно без бурения. ' +
          'Здесь же проверяется обход — уклон считается на масштабе данных маршрута, а не под ногами.',
        'The steepest place on this stretch: layers are exposed in cross-section, visible without drilling. ' +
          'Check the detour here too — the slope is computed at the scale of the route data, not underfoot.',
      ],
      evidence: reliefEvidence(dataLevel),
    };
  });
}

function vantages(samples: RouteSample[], dataLevel: TargetOptions['dataLevel']): Candidate[] {
  const found: Candidate[] = [];
  const heights = samples.map((sample) => sample.heightM);
  for (let i = 1; i < samples.length - 1; i++) {
    if (heights[i] < heights[i - 1] || heights[i] < heights[i + 1]) continue;
    let left = heights[i];
    let right = heights[i];
    for (let j = i - 1; j >= 0 && heights[j] <= heights[i]; j--) left = Math.min(left, heights[j]);
    for (let j = i + 1; j < heights.length && heights[j] <= heights[i]; j++) {
      right = Math.min(right, heights[j]);
    }
    const prominence = heights[i] - Math.max(left, right);
    if (prominence < VANTAGE_PROMINENCE_M) continue;
    const sample = samples[i];
    found.push({
      id: `vantage-${Math.round(sample.alongM)}`,
      kind: 'vantage',
      lon: sample.lon,
      lat: sample.lat,
      alongM: sample.alongM,
      score: 1,
      title: [
        `Обзорная точка, +${Math.round(prominence)} м`,
        `Vantage point, +${Math.round(prominence)} m`,
      ],
      why: [
        'Локальная вершина профиля: отсюда виден пройденный и предстоящий путь, ' +
          'снимается панорама и проверяется привязка маршрута к местности.',
        'A local high point of the profile: the path behind and ahead is visible from here, ' +
          'a panorama can be taken and the route checked against the ground.',
      ],
      evidence: reliefEvidence(dataLevel),
    });
  }
  return found;
}

/**
 * Цели по маршруту: сначала самые информативные признаки, затем разрежение,
 * чтобы метки не слипались, и возврат в порядке движения.
 */
export function findRouteTargets(samples: RouteSample[], options: TargetOptions): RouteTarget[] {
  if (samples.length < 3) return [];
  const lengthM = samples[samples.length - 1].alongM - samples[0].alongM;
  const spacingM = Math.max(150, lengthM * 0.04);
  const candidates = [
    ...contacts(samples),
    ...bedrock(samples),
    ...scarps(samples, options.dataLevel),
    ...dunes(samples, options.sandBelow),
    ...vantages(samples, options.dataLevel),
  ].sort((a, b) => b.score - a.score || a.alongM - b.alongM);

  const picked: Candidate[] = [];
  for (const candidate of candidates) {
    if (picked.length >= (options.maxTargets ?? MAX_TARGETS)) break;
    if (picked.some((kept) => Math.abs(kept.alongM - candidate.alongM) < spacingM)) continue;
    picked.push(candidate);
  }
  return picked
    .sort((a, b) => a.alongM - b.alongM)
    .map(({ score: _score, ...target }) => target);
}
