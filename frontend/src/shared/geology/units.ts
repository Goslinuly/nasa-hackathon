// Единицы геологической карты USGS SIM 3292 (Tanaka et al., 2014): русские названия, эпоха и возраст по коду,
// вероятный тип пород по типу единицы. Поиск единицы по цвету пикселя — shared/regions/regionAt.ts.
// Тип пород — трактовка единицы карты масштаба 1:20 000 000, не измерение.

/** Русские названия всех 44 единиц карты; английские берутся из legend.json. */
export const UNIT_NAMES_RU: Record<string, string> = {
  AHi: 'Амазонско-гесперийская ударная единица',
  AHtu: 'Амазонско-гесперийская переходная нерасчленённая единица',
  AHv: 'Амазонско-гесперийская вулканическая единица',
  ANa: 'Амазонско-нойская шлейфовая единица',
  Aa: 'Амазонская шлейфовая единица',
  Ap: 'Амазонская полярная единица',
  Apu: 'Амазонская полярная нерасчленённая единица',
  Av: 'Амазонская вулканическая единица',
  Ave: 'Амазонская единица вулканических построек',
  HNb: 'Гесперийско-нойская бассейновая единица',
  HNhu: 'Гесперийско-нойская нагорная нерасчленённая единица',
  HNt: 'Гесперийско-нойская переходная единица',
  Hp: 'Гесперийская полярная единица',
  Hpe: 'Гесперийская единица полярных построек',
  Hpu: 'Гесперийская полярная нерасчленённая единица',
  Ht: 'Гесперийская переходная единица',
  Hto: 'Гесперийская переходная единица каналов стока',
  Htu: 'Гесперийская переходная нерасчленённая единица',
  Hve: 'Гесперийская единица вулканических построек',
  Nhe: 'Нойская единица нагорных построек',
  Nhu: 'Нойская нагорная нерасчленённая единица',
  Nve: 'Нойская единица вулканических построек',
  eAb: 'Раннеамазонская бассейновая единица',
  eHb: 'Раннегесперийская бассейновая единица',
  eHh: 'Раннегесперийская нагорная единица',
  eHt: 'Раннегесперийская переходная единица',
  eHv: 'Раннегесперийская вулканическая единица',
  eNh: 'Ранненойская нагорная единица',
  eNhm: 'Ранненойская единица нагорных массивов',
  lAa: 'Позднеамазонская шлейфовая единица',
  lApc: 'Позднеамазонская единица полярной шапки',
  lApd: 'Позднеамазонская единица полярных дюн',
  lAv: 'Позднеамазонская вулканическая единица',
  lAvf: 'Позднеамазонская единица вулканических полей',
  lHb: 'Позднегесперийская бассейновая единица',
  lHl: 'Позднегесперийская низменная единица',
  lHt: 'Позднегесперийская переходная единица',
  lHv: 'Позднегесперийская вулканическая единица',
  lHvf: 'Позднегесперийская единица вулканических полей',
  lNh: 'Поздненойская нагорная единица',
  lNv: 'Поздненойская вулканическая единица',
  mAl: 'Среднеамазонская низменная единица',
  mNh: 'Средненойская нагорная единица',
  mNhm: 'Средненойская единица нагорных массивов',
};

type Period = 'N' | 'H' | 'A';

const PERIOD_RANGE: Record<Period, [number, number]> = { N: [4.1, 3.7], H: [3.7, 3.0], A: [3.0, 0] };
const PERIOD_RU: Record<Period, string> = { N: 'нойский', H: 'гесперийский', A: 'амазонский' };
const PERIOD_EN: Record<Period, string> = { N: 'Noachian', H: 'Hesperian', A: 'Amazonian' };
const PART_RU: Record<string, string> = { e: 'ранний', m: 'средний', l: 'поздний' };
const PART_EN: Record<string, string> = { e: 'Early', m: 'Middle', l: 'Late' };

export interface UnitEra {
  /** Часть периода: e — ранний, m — средний, l — поздний; null — весь период. */
  part: 'e' | 'm' | 'l' | null;
  /** Периоды от молодого к древнему, как в коде (AH — амазонский и гесперийский). */
  periods: Period[];
  ru: string;
  en: string;
  /** Примерный возраст, млрд лет: от (древнее) до (моложе; 0 — наши дни). */
  fromGa: number;
  toGa: number;
}

/** Эпоха по коду единицы: приставка e/m/l, затем заглавные буквы периодов (N, H, A). */
export function parseUnitEra(code: string): UnitEra | null {
  const m = /^([eml]?)([AHN]+)/.exec(code);
  if (!m) return null;
  const part = (m[1] || null) as UnitEra['part'];
  const periods = m[2].split('') as Period[];
  const ru = periods.map((p) => PERIOD_RU[p]).join(' и ');
  const en = periods.map((p) => PERIOD_EN[p]).join(' and ');
  return {
    part,
    periods,
    ru: part ? `${PART_RU[part]} ${ru}` : ru,
    en: part ? `${PART_EN[part]} ${en}` : en,
    fromGa: Math.max(...periods.map((p) => PERIOD_RANGE[p][0])),
    toGa: Math.min(...periods.map((p) => PERIOD_RANGE[p][1])),
  };
}

const ga = (v: number, lang: 'ru' | 'en') => (lang === 'ru' ? v.toFixed(1).replace('.', ',') : v.toFixed(1));

/** «~4,1–3,7 млрд лет», «моложе ~3,0 млрд лет», «~3,7 млрд лет и моложе». */
export function formatEraAge(era: UnitEra, lang: 'ru' | 'en'): string {
  const unit = lang === 'ru' ? 'млрд лет' : 'Ga';
  if (era.toGa === 0) {
    if (era.periods.length === 1) return lang === 'ru' ? `моложе ~${ga(era.fromGa, lang)} ${unit}` : `younger than ~${ga(era.fromGa, lang)} ${unit}`;
    return lang === 'ru' ? `~${ga(era.fromGa, lang)} ${unit} и моложе` : `~${ga(era.fromGa, lang)} ${unit} and younger`;
  }
  return `~${ga(era.fromGa, lang)}–${ga(era.toGa, lang)} ${unit}`;
}

export type UnitKind = 'dunes' | 'polar' | 'apron' | 'volcanic' | 'impact' | 'sedimentary' | 'highland' | 'unknown';

/** Тип единицы по английскому названию из легенды. */
export function unitKind(label: string): UnitKind {
  const l = label.toLowerCase();
  if (l.includes('dune')) return 'dunes';
  if (l.includes('polar')) return 'polar';
  if (l.includes('apron')) return 'apron';
  if (l.includes('volcanic')) return 'volcanic';
  if (l.includes('impact')) return 'impact';
  if (/basin|lowland|transition|outflow/.test(l)) return 'sedimentary';
  if (/highland|massif/.test(l)) return 'highland';
  return 'unknown';
}

const ROCK: Record<UnitKind, { ru: string; en: string } | null> = {
  dunes: { ru: 'тёмный базальтовый песок', en: 'dark basaltic sand' },
  polar: { ru: 'водяной лёд со слоями пыли', en: 'water ice with dust layers' },
  apron: { ru: 'обломки со склонов и отложения, богатые льдом', en: 'slope debris and ice-rich deposits' },
  volcanic: { ru: 'базальтовые лавовые потоки', en: 'basaltic lava flows' },
  impact: { ru: 'ударная брекчия и выбросы кратеров', en: 'impact breccia and crater ejecta' },
  sedimentary: { ru: 'осадочные отложения', en: 'sedimentary deposits' },
  highland: { ru: 'древняя кратерированная кора: брекчия и базальт', en: 'ancient cratered crust: breccia and basalt' },
  unknown: null,
};

/** Вероятный тип пород — трактовка по типу единицы. */
export function likelyRock(label: string): { ru: string; en: string } | null {
  return ROCK[unitKind(label)];
}
