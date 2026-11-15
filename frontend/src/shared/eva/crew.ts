// Физиология человека на Марсе: прыжок, питание, теплоотдача, кислород по маршруту, доза и советы.
//
// Правило то же, что во всём проекте: формулы живут в одном месте, рядом с каждым числом стоит,
// откуда оно — измерение, модель или эксплуатационное правило. Метаболическая мощность и кислород
// не пересчитываются заново, а берутся из traverse.ts (источник истины — backend/.../eva/mobility.py).
//
// Вывод формул: docs/PHYSICS.md, раздел «Физиология экипажа».

import { evaDose, DOSE_RATE_MSV_DAY } from './radiation';
import {
  DEFAULT_TRAVERSE,
  marsPowerCorridorW,
  oxygenLpm,
  segmentCost,
  terrainFactor,
  walkSpeed,
  gradePercent,
  type Surface,
  type TraverseParams,
} from './traverse';

/** Ускорение свободного падения, м/с². Марс — среднее по поверхности. */
export const G_MARS = 3.72076;
export const G_EARTH = 9.80665;

/**
 * Эффективная теплота уноса воды в сублиматоре, Дж/кг.
 * Вода подаётся жидкой, замерзает (отдаёт теплоту плавления 0,334 МДж/кг)
 * и сублимирует (забирает 2,83 МДж/кг). Итого уносится 2,83 − 0,334 = 2,50 МДж/кг.
 * Проверка: при 350 Вт это 0,50 кг/ч — столько и расходовал ранец Apollo.
 */
export const SUBLIMATOR_J_PER_KG = 2.50e6;

/** Дыхательный коэффициент модели расхода кислорода (traverse.ts: 348,3 Вт на л/мин). */
export const RESPIRATORY_QUOTIENT = 0.85;

/** Плотность кислорода при нормальных условиях, г/л. */
export const O2_G_PER_L = 1.429;

/** Карьерный предел эффективной дозы NASA, мЗв. Эксплуатационное правило, не физика. */
export const CAREER_DOSE_LIMIT_MSV = 600;

/** Коэффициент качества излучения на поверхности (backend/.../eva/radiation.py). */
export const QUALITY_FACTOR = 3.05;

/** Доля альбедной компоненты дозы: приходит из грунта, рельефом не экранируется. */
export const ALBEDO_SHARE = 0.21;

export type Kind = 'measurement' | 'model' | 'rule';

export interface Note {
  text: string;
  kind: Kind;
}

// ───────────────────────────── Прыжок ─────────────────────────────

export interface JumpInput {
  /** Масса тела, кг. */
  bodyKg: number;
  /** Масса скафандра с ранцем, кг. 0 — прыжок без скафандра, в жилом модуле. */
  loadKg: number;
  /** Высота вертикального прыжка на Земле без скафандра, м. */
  earthJumpM: number;
}

export interface JumpResult {
  /** Высота подъёма центра масс на Марсе, м. */
  heightM: number;
  /** То же без скафандра, м: ровно земной прыжок × g_E/g_M. */
  freeHeightM: number;
  /** Скорость отрыва, м/с (одинакова на Земле и на Марсе: ноги делают ту же работу). */
  takeoffMs: number;
  /** Время полёта, с. */
  flightS: number;
  /** Работа ног за один прыжок, Дж. */
  workJ: number;
  /** Во сколько раз выше, чем тот же прыжок на Земле. */
  ratio: number;
  /** Скорость в момент приземления, м/с — равна скорости отрыва. */
  landingMs: number;
  notes: Note[];
}

/**
 * Модель «та же работа ног».
 *
 * На Земле без скафандра прыжок на высоту h_E требует работы W = m·g_E·h_E.
 * Считаем, что на Марсе ноги способны на ту же работу. Тогда она поднимает
 * уже массу (m + L) в поле g_M:
 *
 *     h_M = W / ((m + L)·g_M) = h_E · (g_E/g_M) · m/(m + L)
 *
 * Без скафандра (L = 0) это ровно h_E · g_E/g_M = h_E · 2,64.
 * Масса важна только через отношение m/(m+L): скафандр одинаковый,
 * поэтому тяжёлому человеку он мешает относительно меньше.
 *
 * Чего модель не учитывает: жёсткость скафандра, которая реально съедает часть работы,
 * и то, что отталкивание идёт за конечное время, а не мгновенно.
 */
export function jump(input: JumpInput): JumpResult {
  const body = Math.max(1, input.bodyKg);
  const load = Math.max(0, input.loadKg);
  const earth = Math.max(0, input.earthJumpM);
  const workJ = body * G_EARTH * earth;
  const total = body + load;
  const heightM = workJ / (total * G_MARS);
  const takeoffMs = Math.sqrt(2 * G_MARS * heightM);
  const flightS = (2 * takeoffMs) / G_MARS;
  const notes: Note[] = [
    { kind: 'model', text: 'Модель «та же работа ног»: жёсткость скафандра не учтена, реальный прыжок будет ниже.' },
    {
      kind: 'model',
      text: 'Скорость приземления равна скорости отрыва, как и на Земле. Выше прыжок — не мягче падение, '
        + 'а дольше полёт: времени на ошибку больше, но удар тот же.',
    },
  ];
  if (load > 0) {
    notes.push({
      kind: 'rule',
      text: 'В скафандре прыгать не нужно: падение в жёстком костюме с ранцем — главный риск травмы на выходе.',
    });
  }
  return { heightM, freeHeightM: workJ / (body * G_MARS), takeoffMs, flightS, workJ,
    ratio: earth > 0 ? heightM / earth : 0, landingMs: takeoffMs, notes };
}

// ───────────────────────────── Питание ─────────────────────────────

export type Sex = 'male' | 'female';

export interface NutritionInput {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  bodyKg: number;
  /** Длительность выхода за сутки, ч. */
  evaHours: number;
  /** Средняя метаболическая мощность на выходе, Вт. */
  evaPowerW: number;
  /** Коэффициент активности вне выхода. */
  habitatFactor?: number;
}

export interface NutritionResult {
  /** Основной обмен, ккал/сут. */
  bmrKcal: number;
  /** Расход вне выхода, ккал. */
  habitatKcal: number;
  /** Расход на выходе, ккал. */
  evaKcal: number;
  /** Суточная потребность, ккал. */
  totalKcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  /** Питьевая вода, л/сут. */
  drinkingWaterL: number;
  notes: Note[];
}

/** Основной обмен по Миффлину–Сан Жеору, ккал/сут. Земная формула, в космосе не проверялась. */
export function basalMetabolicRateKcal(sex: Sex, ageYears: number, heightCm: number, bodyKg: number): number {
  const base = 10 * bodyKg + 6.25 * heightCm - 5 * ageYears;
  return sex === 'male' ? base + 5 : base - 161;
}

/**
 * Суточная потребность и состав рациона.
 * Расход на выходе берётся из метаболической модели Санти, а не из таблиц активности:
 * 1 Вт в течение часа — это 3600 Дж, то есть 0,861 ккал.
 */
export function nutrition(input: NutritionInput): NutritionResult {
  const bmrKcal = basalMetabolicRateKcal(input.sex, input.ageYears, input.heightCm, input.bodyKg);
  const factor = input.habitatFactor ?? 1.3;
  const evaH = Math.max(0, Math.min(24, input.evaHours));
  const restH = 24 - evaH;
  const habitatKcal = (bmrKcal / 24) * factor * restH;
  const evaKcal = (input.evaPowerW * evaH * 3600) / 4184;
  const totalKcal = habitatKcal + evaKcal;
  const proteinG = 1.6 * input.bodyKg;
  const fatG = (0.3 * totalKcal) / 9;
  const carbG = Math.max(0, (totalKcal - proteinG * 4 - fatG * 9) / 4);
  // Питьевая вода: 1 мл на ккал, но не меньше 2 л, плюс потери на выходе.
  const drinkingWaterL = Math.max(2, totalKcal / 1000) + 0.25 * evaH;
  const notes: Note[] = [
    { kind: 'model', text: 'Основной обмен по Миффлину–Сан Жеору: земная формула, для невесомости и Марса не валидирована.' },
    { kind: 'model', text: 'Расход на выходе — из метаболической модели Санти, той же, что считает кислород и маршрут.' },
    { kind: 'rule', text: 'Белок 1,6 г/кг и жир 30 % калорийности — ориентир спортивного питания, а не норма NASA.' },
  ];
  if (totalKcal < bmrKcal) {
    notes.push({ kind: 'rule', text: 'Рацион ниже основного обмена: так планировать нельзя даже на сутки.' });
  }
  return { bmrKcal, habitatKcal, evaKcal, totalKcal, proteinG, fatG, carbG, drinkingWaterL, notes };
}

// ───────────────────────── Теплоотдача ─────────────────────────

export interface ThermalInput {
  bodyKg: number;
  loadKg: number;
  /** Скорость движения, м/с. */
  speedMs: number;
  /** Уклон, ° (вверх положительный). */
  slopeDeg: number;
  surface: Surface;
  /** Запас воды на охлаждение, кг. */
  feedwaterKg: number;
  /** Запас кислорода, л при нормальных условиях. */
  oxygenL: number;
}

export interface ThermalResult {
  /** Метаболическая мощность, Вт: коридор по двум трактовкам тяжести. */
  powerLowW: number;
  powerHighW: number;
  powerMidW: number;
  /** Полезная механическая мощность подъёма, Вт. */
  climbW: number;
  /** Что надо отвести в виде тепла, Вт. */
  heatW: number;
  /** Расход воды сублиматором, кг/ч. */
  waterKgH: number;
  /** Расход кислорода, л/мин. */
  oxygenLpm: number;
  /** На сколько часов хватит воды. */
  waterHours: number;
  /** На сколько часов хватит кислорода. */
  oxygenHours: number;
  /** Что кончится первым. */
  limiting: 'вода' | 'кислород';
  limitHours: number;
  notes: Note[];
}

/**
 * Тепловой баланс выхода.
 *
 * Почти вся метаболическая мощность становится теплом: полезная работа уходит
 * только на подъём центра масс, P = m·g_M·v·sin θ, и только когда идём вверх.
 * Отводить тепло в разрежённой атмосфере конвекцией нечем, поэтому его уносит
 * сублиматор, испаряя воду: расход = тепло / 2,50 МДж/кг.
 */
export function thermal(input: ThermalInput): ThermalResult {
  const total = input.bodyKg + input.loadKg;
  const v = Math.max(0, input.speedMs);
  const grade = gradePercent(input.slopeDeg);
  const [etaLow, etaHigh] = terrainFactor(input.surface, Math.max(0.05, v));
  const powers: number[] = [];
  for (const eta of etaLow === etaHigh ? [etaLow] : [etaLow, etaHigh]) {
    powers.push(...marsPowerCorridorW(input.bodyKg, input.loadKg, v, grade, eta));
  }
  const powerLowW = Math.max(0, Math.min(...powers));
  const powerHighW = Math.max(0, Math.max(...powers));
  const powerMidW = (powerLowW + powerHighW) / 2;

  const sinSlope = Math.sin((input.slopeDeg * Math.PI) / 180);
  const climbW = sinSlope > 0 ? total * G_MARS * v * sinSlope : 0;
  const heatW = Math.max(0, powerMidW - climbW);

  const waterKgH = (heatW * 3600) / SUBLIMATOR_J_PER_KG;
  const o2Lpm = oxygenLpm(powerMidW);
  const waterHours = waterKgH > 0 ? input.feedwaterKg / waterKgH : Infinity;
  const oxygenHours = o2Lpm > 0 ? input.oxygenL / (o2Lpm * 60) : Infinity;
  const limiting = waterHours <= oxygenHours ? 'вода' : 'кислород';
  const limitHours = Math.min(waterHours, oxygenHours);

  const notes: Note[] = [
    {
      kind: 'model',
      text: 'Полезная работа — только подъём центра масс; всё остальное становится теплом. '
        + 'На спуске полезной работы нет, тепло равно полной мощности.',
    },
    {
      kind: 'measurement',
      text: '2,50 МДж на килограмм воды: сублимация льда 2,83 минус теплота замерзания 0,334. '
        + 'При 350 Вт это 0,50 кг/ч — столько и расходовал ранец Apollo.',
    },
    {
      kind: 'rule',
      text: `Первым кончится ${limiting}. В проекте это записано отдельно: для пеших траверсов `
        + 'ограничивающим ресурсом обычно оказывается вода на охлаждение, а не кислород.',
    },
  ];
  if (climbW > 0) {
    notes.push({
      kind: 'model',
      text: `На подъёме ${climbW.toFixed(0)} Вт уходит в набор высоты, остальное — тепло. `
        + 'Поэтому подъём дороже по кислороду, но чуть «прохладнее» на ватт расхода.',
    });
  }
  return { powerLowW, powerHighW, powerMidW, climbW, heatW, waterKgH, oxygenLpm: o2Lpm,
    waterHours, oxygenHours, limiting, limitHours, notes };
}

// ───────────────────── Кислород и воздух по маршруту ─────────────────────

export interface Leg {
  /** Длина по горизонтали, м. */
  lengthM: number;
  /** Уклон, ° (вверх положительный). */
  slopeDeg: number;
}

export interface LegCost {
  leg: Leg;
  seconds: number;
  speedMs: number;
  o2L: number;
  climbM: number;
  outsideModel: boolean;
}

export interface RouteResult {
  legs: LegCost[];
  seconds: number;
  o2L: number;
  o2LowL: number;
  o2HighL: number;
  /** Расход воздушной смеси в пересчёте на массу кислорода, кг. */
  o2Kg: number;
  /** Выдыхаемый углекислый газ, л — нагрузка на поглотитель. */
  co2L: number;
  kcal: number;
  ascentM: number;
  descentM: number;
  distanceM: number;
  notes: Note[];
}

/**
 * Стоимость маршрута по ногам. Каждая нога считается через segmentCost из traverse.ts,
 * то есть теми же формулами, что и поиск пути: скорость от уклона, мощность Санти,
 * кислород по 348,3 Вт на л/мин.
 */
export function routeCost(legs: Leg[], params: TraverseParams = DEFAULT_TRAVERSE): RouteResult {
  const out: LegCost[] = [];
  let seconds = 0, o2L = 0, o2LowL = 0, o2HighL = 0, ascentM = 0, descentM = 0, distanceM = 0;
  for (const leg of legs) {
    const length = Math.max(0, leg.lengthM);
    const cost = segmentCost(length, leg.slopeDeg, params);
    const climbM = length * Math.tan((leg.slopeDeg * Math.PI) / 180);
    out.push({ leg, seconds: cost.seconds, speedMs: cost.speedMs, o2L: cost.o2MidL, climbM,
      outsideModel: cost.status !== 'ok' });
    seconds += cost.seconds;
    o2L += cost.o2MidL;
    o2LowL += cost.o2LowL;
    o2HighL += cost.o2HighL;
    distanceM += length;
    if (climbM > 0) ascentM += climbM; else descentM += -climbM;
  }
  // Энергия: кислород → метаболическая работа. 348,3 Вт на л/мин, значит 1 л кислорода ≈ 20,9 кДж.
  const kcal = (o2L * 348.3 * 60) / 4184;
  const notes: Note[] = [
    { kind: 'model', text: 'Кислород считается той же моделью, что и маршрут на карте: расхождений между панелями быть не может.' },
    { kind: 'model', text: 'Подъём дороже спуска: в модели Санти за уклон отвечает слагаемое 0,35·V·G, линейное по уклону.' },
  ];
  if (out.some(l => l.outsideModel)) {
    notes.push({ kind: 'rule', text: 'Часть ног круче ±20°: модель скорости там не определена, числа посчитаны по границе.' });
  }
  return { legs: out, seconds, o2L, o2LowL, o2HighL, o2Kg: (o2L * O2_G_PER_L) / 1000,
    co2L: o2L * RESPIRATORY_QUOTIENT, kcal, ascentM, descentM, distanceM, notes };
}

// ───────────────────────── Радиация ─────────────────────────

export interface RadiationInput {
  /** Длительность выхода, с. */
  evaSeconds: number;
  /** Доля видимого неба: 1 на открытом месте, меньше под стеной кратера. */
  skyViewFraction: number;
  /** Набор высоты за выход, м. */
  ascentM: number;
  /** Длительность миссии на поверхности, солов. */
  surfaceSols: number;
}

export interface RadiationResult {
  /** Доза за выход на открытом месте, мЗв. */
  openMSv: number;
  lowMSv: number;
  highMSv: number;
  /** С учётом экранирования рельефом, мЗв. */
  shieldedMSv: number;
  /** Доля дозы, которую рельеф снять не может. */
  shieldFraction: number;
  /** Поправка на набор высоты, мЗв. */
  elevationMSv: number;
  /** Фон за всю миссию на поверхности, мЗв. */
  missionMSv: number;
  /** Доля карьерного предела, %. */
  careerPercent: number;
  notes: Note[];
}

/**
 * Доза за выход и её место в карьерном бюджете.
 * Фон — измерение RAD на Curiosity. Экранирование рельефом — модель с полом:
 * доля = (1 − a)·sky + a, где a ≈ 0,21 — вторичные частицы из грунта, снизу, их стена не закрывает.
 */
export function radiation(input: RadiationInput): RadiationResult {
  const dose = evaDose(input.evaSeconds);
  const sky = Math.max(0, Math.min(1, input.skyViewFraction));
  const shieldFraction = (1 - ALBEDO_SHARE) * sky + ALBEDO_SHARE;
  // Подъём: +4 мкГр/сол на 100 м, пересчёт в эквивалентную дозу через коэффициент качества.
  const sols = Math.max(0, input.evaSeconds) / 88775.244;
  const elevationMSv = ((input.ascentM / 100) * 4 * QUALITY_FACTOR * sols) / 1000;
  const shieldedMSv = dose.typicalMSv * shieldFraction + elevationMSv;
  const missionMSv = DOSE_RATE_MSV_DAY.typical * Math.max(0, input.surfaceSols) * 1.0275;
  const notes: Note[] = [
    { kind: 'measurement', text: 'Фон 0,64 ± 0,12 мЗв/сут — измерение RAD на Curiosity, диапазон 0,25–0,95 задаёт солнечный цикл.' },
    { kind: 'model', text: `Рельеф снимает не всё: ${Math.round(ALBEDO_SHARE * 100)} % дозы дают вторичные частицы из грунта, они приходят снизу.` },
    { kind: 'rule', text: `Карьерный предел NASA ${CAREER_DOSE_LIMIT_MSV} мЗв — эксплуатационное правило, а не порог вреда.` },
  ];
  const careerPercent = (missionMSv / CAREER_DOSE_LIMIT_MSV) * 100;
  if (careerPercent > 50) {
    notes.push({ kind: 'rule', text: 'Фон за миссию съедает больше половины карьерного предела: это планируют на уровне программы, а не выхода.' });
  }
  return { openMSv: dose.typicalMSv, lowMSv: dose.lowMSv, highMSv: dose.highMSv,
    shieldedMSv, shieldFraction, elevationMSv, missionMSv, careerPercent, notes };
}

// ───────────────────────── Советы ─────────────────────────

export interface AdviceInput {
  route: RouteResult;
  thermal: ThermalResult;
  radiation: RadiationResult;
  nutrition: NutritionResult;
  /** Запас кислорода, л. */
  oxygenL: number;
  /** Максимальный уклон маршрута, °. */
  maxSlopeDeg: number;
}

export interface Advice {
  level: 'ok' | 'warn' | 'danger';
  text: string;
}

/** Советы: каждый следует из конкретного числа выше, а не из общих соображений. */
export function advice(input: AdviceInput): Advice[] {
  const out: Advice[] = [];
  const routeHours = input.route.seconds / 3600;

  if (routeHours > input.thermal.limitHours) {
    out.push({
      level: 'danger',
      text: `Маршрут занимает ${routeHours.toFixed(1)} ч, а ${input.thermal.limiting} кончится через `
        + `${input.thermal.limitHours.toFixed(1)} ч. Сократить маршрут или взять больше.`,
    });
  } else if (routeHours > input.thermal.limitHours * 0.7) {
    out.push({
      level: 'warn',
      text: `Маршрут съедает больше 70 % запаса: ${routeHours.toFixed(1)} ч из ${input.thermal.limitHours.toFixed(1)} ч. `
        + 'Резерва на возврат при отказе почти нет.',
    });
  } else {
    out.push({ level: 'ok', text: `Запас держит: ${routeHours.toFixed(1)} ч пути против ${input.thermal.limitHours.toFixed(1)} ч ресурса.` });
  }

  if (input.route.o2L > input.oxygenL) {
    out.push({ level: 'danger', text: `Кислорода нужно ${input.route.o2L.toFixed(0)} л, в ранце ${input.oxygenL.toFixed(0)} л.` });
  }

  const s = Math.abs(input.maxSlopeDeg);
  if (s > 25) {
    out.push({ level: 'danger', text: `Уклон ${s.toFixed(0)}° круче ориентира сообщества 25°. Численного требования NASA по уклону нет, но это за всеми практиками.` });
  } else if (s > 20) {
    out.push({ level: 'danger', text: `Уклон ${s.toFixed(0)}° выше правила планировщика 20°: такой участок исключают.` });
  } else if (s > 15) {
    out.push({ level: 'warn', text: `Уклон ${s.toFixed(0)}° выше консервативного порога 15°. Модели рельефа врут на величину порядка самого порога.` });
  }

  if (input.thermal.limiting === 'вода') {
    out.push({ level: 'warn', text: 'Ограничивает вода на охлаждение. Снизить темп: тепло растёт как квадрат скорости, а время — только обратно пропорционально.' });
  }

  if (input.radiation.shieldedMSv > 0.2) {
    out.push({ level: 'warn', text: `За выход ${input.radiation.shieldedMSv.toFixed(2)} мЗв. Работа у стены кратера снимает часть дозы, но не ниже ${Math.round(ALBEDO_SHARE * 100)} %.` });
  }

  if (input.route.ascentM > 300) {
    out.push({ level: 'warn', text: `Набор высоты ${input.route.ascentM.toFixed(0)} м. Планировать подъём на начало выхода, спуск — на возврат: так дешевле и безопаснее.` });
  }

  out.push({ level: 'ok', text: `Рацион на эти сутки: ${input.nutrition.totalKcal.toFixed(0)} ккал, из них ${input.nutrition.evaKcal.toFixed(0)} даёт сам выход.` });
  return out;
}

// ───────────────────────── Сводка ─────────────────────────

export interface CrewInput {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  bodyKg: number;
  loadKg: number;
  earthJumpM: number;
  surface: Surface;
  legs: Leg[];
  skyViewFraction: number;
  surfaceSols: number;
  feedwaterKg: number;
  oxygenL: number;
}

export const DEFAULT_CREW: CrewInput = {
  sex: 'female',
  ageYears: 36,
  heightCm: 170,
  bodyKg: 70,
  loadKg: 45,
  earthJumpM: 0.40,
  surface: 'firm',
  legs: [{ lengthM: 900, slopeDeg: 6 }, { lengthM: 700, slopeDeg: 0 }, { lengthM: 900, slopeDeg: -6 }],
  skyViewFraction: 0.75,
  surfaceSols: 500,
  feedwaterKg: 4.0,
  oxygenL: 420,
};

export interface CrewReport {
  jump: JumpResult;
  nutrition: NutritionResult;
  thermal: ThermalResult;
  route: RouteResult;
  radiation: RadiationResult;
  advice: Advice[];
}

/** Всё вместе: один вход — один отчёт. Именно это дёргает панель. */
export function crewReport(input: CrewInput): CrewReport {
  const params: TraverseParams = { surface: input.surface, crewKg: input.bodyKg, loadKg: input.loadKg };
  const route = routeCost(input.legs, params);
  const maxSlopeDeg = input.legs.reduce((m, l) => Math.max(m, Math.abs(l.slopeDeg)), 0);
  // Теплоотдача считается на средневзвешенном уклоне и скорости маршрута.
  const meanSlope = route.distanceM > 0
    ? input.legs.reduce((s, l) => s + l.slopeDeg * l.lengthM, 0) / route.distanceM
    : 0;
  const speed = walkSpeed(meanSlope).speedMs;
  const th = thermal({
    bodyKg: input.bodyKg, loadKg: input.loadKg, speedMs: speed, slopeDeg: meanSlope,
    surface: input.surface, feedwaterKg: input.feedwaterKg, oxygenL: input.oxygenL,
  });
  const rad = radiation({
    evaSeconds: route.seconds, skyViewFraction: input.skyViewFraction,
    ascentM: route.ascentM, surfaceSols: input.surfaceSols,
  });
  const nut = nutrition({
    sex: input.sex, ageYears: input.ageYears, heightCm: input.heightCm, bodyKg: input.bodyKg,
    evaHours: route.seconds / 3600, evaPowerW: th.powerMidW,
  });
  const jmp = jump({ bodyKg: input.bodyKg, loadKg: input.loadKg, earthJumpM: input.earthJumpM });
  return {
    jump: jmp, nutrition: nut, thermal: th, route, radiation: rad,
    advice: advice({ route, thermal: th, radiation: rad, nutrition: nut, oxygenL: input.oxygenL, maxSlopeDeg }),
  };
}
