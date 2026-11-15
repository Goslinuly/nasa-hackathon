// Панель «Экипаж»: что происходит с человеком на выходе — прыжок, питание, теплоотдача,
// кислород по маршруту, доза и советы. Все числа считает shared/eva/crew.ts, панель только показывает.

import { useMemo, useState } from 'react';

import {
  ALBEDO_SHARE,
  CAREER_DOSE_LIMIT_MSV,
  DEFAULT_CREW,
  crewReport,
  limitingLabel,
  type CrewInput,
  type Kind,
  type Leg,
  type Note,
  type Sex,
} from '@/shared/eva/crew';
import { formatDuration } from '@/shared/eva/suit';
import type { Surface } from '@/shared/eva/traverse';
import { locale, useLang, useT } from '@/shared/i18n/lang';

import './crew.css';

function Badge({ kind }: { kind: Kind }) {
  const t = useT();
  const label = kind === 'measurement' ? t('измерение', 'measurement')
    : kind === 'model' ? t('модель', 'model')
      : t('правило', 'rule');
  return <span className={`crew-tag crew-tag-${kind}`}>{label}</span>;
}

function Notes({ items }: { items: Note[] }) {
  return (
    <>
      {items.map((n, i) => (
        <p className="crew-note" key={i}>
          <Badge kind={n.kind} />
          <span>{n.text}</span>
        </p>
      ))}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="crew-row">
      <span className="crew-k">{k}</span>
      <span className="crew-v">{v}</span>
    </div>
  );
}

interface Props {
  /** Профиль маршрута: если его дал планировщик, свои ноги не используются. */
  legs?: Leg[];
  /** Доля видимого неба в точке работы, из сцены прогулки. */
  skyViewFraction?: number;
  initial?: Partial<CrewInput>;
}

export function CrewPanel({ legs, skyViewFraction, initial }: Props) {
  const t = useT();
  const lang = useLang();
  const [input, setInput] = useState<CrewInput>({ ...DEFAULT_CREW, ...initial });

  // Разделитель дробной части зависит от языка, поэтому числа идут через Intl.
  const fmt = useMemo(() => {
    const make = (d: number) =>
      new Intl.NumberFormat(locale(lang), { minimumFractionDigits: d, maximumFractionDigits: d });
    const f0 = make(0), f1 = make(1), f2 = make(2), f3 = make(3), f4 = make(4);
    const guard = (f: Intl.NumberFormat) => (v: number) => (Number.isFinite(v) ? f.format(v) : '—');
    return { n0: guard(f0), n1: guard(f1), n2: guard(f2), n3: guard(f3), n4: guard(f4) };
  }, [lang]);
  const { n0, n1, n2, n3, n4 } = fmt;

  const effective = useMemo<CrewInput>(
    () => ({
      ...input,
      legs: legs && legs.length > 0 ? legs : input.legs,
      skyViewFraction: skyViewFraction ?? input.skyViewFraction,
    }),
    [input, legs, skyViewFraction],
  );

  const report = useMemo(() => crewReport(effective), [effective]);
  const set = <K extends keyof CrewInput>(key: K, value: CrewInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const { jump, nutrition, thermal, route, radiation, advice } = report;
  const W = t('Вт', 'W');
  const M = t('м', 'm');
  const L = t('л', 'L');
  const KG = t('кг', 'kg');
  const KCAL = t('ккал', 'kcal');
  const G = t('г', 'g');
  const H = t('ч', 'h');
  const MSV = t('мЗв', 'mSv');

  return (
    <section className="crew">
      <div className="crew-grid">
        <article className="crew-card">
          <h3>{t('Человек', 'Human')}</h3>
          <div className="crew-fields">
            <label>
              {t('пол', 'sex')}
              <select value={input.sex} onChange={(e) => set('sex', e.target.value as Sex)}>
                <option value="female">{t('женский', 'female')}</option>
                <option value="male">{t('мужской', 'male')}</option>
              </select>
            </label>
            <label>
              {t('возраст, лет', 'age, years')}
              <input type="number" min={16} max={80} value={input.ageYears}
                onChange={(e) => set('ageYears', Number(e.target.value))} />
            </label>
            <label>
              {t('рост, см', 'height, cm')}
              <input type="number" min={120} max={220} value={input.heightCm}
                onChange={(e) => set('heightCm', Number(e.target.value))} />
            </label>
            <label>
              {t('вес, кг', 'body mass, kg')}
              <input type="number" min={35} max={160} value={input.bodyKg}
                onChange={(e) => set('bodyKg', Number(e.target.value))} />
            </label>
            <label>
              {t('скафандр, кг', 'suit, kg')}
              <input type="number" min={0} max={140} value={input.loadKg}
                onChange={(e) => set('loadKg', Number(e.target.value))} />
            </label>
            <label>
              {t('прыжок на Земле, см', 'jump on Earth, cm')}
              <input type="number" min={5} max={120} value={Math.round(input.earthJumpM * 100)}
                onChange={(e) => set('earthJumpM', Number(e.target.value) / 100)} />
            </label>
            <label>
              {t('грунт', 'surface')}
              <select value={input.surface} onChange={(e) => set('surface', e.target.value as Surface)}>
                <option value="firm">{t('плотный', 'firm')}</option>
                <option value="sand">{t('песок', 'sand')}</option>
              </select>
            </label>
            <label>
              {t('вода на охлаждение, кг', 'cooling water, kg')}
              <input type="number" min={0.5} max={20} step={0.1} value={input.feedwaterKg}
                onChange={(e) => set('feedwaterKg', Number(e.target.value))} />
            </label>
            <label>
              {t('кислород, л', 'oxygen, L')}
              <input type="number" min={50} max={3000} value={input.oxygenL}
                onChange={(e) => set('oxygenL', Number(e.target.value))} />
            </label>
            <label>
              {t('миссия, солов', 'mission, sols')}
              <input type="number" min={1} max={2000} value={input.surfaceSols}
                onChange={(e) => set('surfaceSols', Number(e.target.value))} />
            </label>
          </div>
        </article>

        <article className="crew-card">
          <h3>{t('Прыжок', 'Jump')}</h3>
          <div className="crew-hero">
            <span className="crew-k">{t('в скафандре', 'in the suit')}</span>
            <span><b>{n2(jump.heightM)}</b> {M}</span>
          </div>
          <div className="crew-hero">
            <span className="crew-k">{t('без скафандра', 'without the suit')}</span>
            <span><b>{n2(jump.freeHeightM)}</b> {M}</span>
          </div>
          <Row k={t('работа ног за прыжок', 'leg work per jump')} v={`${n0(jump.workJ)} ${t('Дж', 'J')}`} />
          <Row k={t('скорость отрыва', 'take-off speed')} v={`${n2(jump.takeoffMs)} ${t('м/с', 'm/s')}`} />
          <Row k={t('время полёта', 'flight time')} v={`${n2(jump.flightS)} ${t('с', 's')}`} />
          <Row k={t('скорость приземления', 'landing speed')} v={`${n2(jump.landingMs)} ${t('м/с', 'm/s')}`} />
          <Row k={t('во сколько раз выше земного', 'times higher than on Earth')} v={`×${n2(jump.ratio)}`} />
          <Notes items={jump.notes} />
        </article>

        <article className="crew-card">
          <h3>{t('Маршрут выхода', 'EVA route')}</h3>
          <Row k={t('длина', 'distance')} v={`${n2(route.distanceM / 1000)} ${t('км', 'km')}`} />
          <Row k={t('время', 'time')} v={formatDuration(route.seconds)} />
          <Row k={t('подъём / спуск', 'ascent / descent')} v={`+${n0(route.ascentM)} / −${n0(route.descentM)} ${M}`} />
          <Row k={t('кислород', 'oxygen')} v={`${n1(route.o2L)} ${L}`} />
          <Row k={t('то же в массе', 'the same by mass')} v={`${n3(route.o2Kg)} ${KG}`} />
          <Row k={t('углекислый газ на поглотитель', 'carbon dioxide to the scrubber')} v={`${n1(route.co2L)} ${L}`} />
          <Row k={t('энергия', 'energy')} v={`${n0(route.kcal)} ${KCAL}`} />
          <Notes items={route.notes} />
        </article>

        <article className="crew-card">
          <h3>{t('Теплоотдача', 'Heat load')}</h3>
          <Row k={t('метаболическая мощность', 'metabolic power')} v={`${n0(thermal.powerLowW)}–${n0(thermal.powerHighW)} ${W}`} />
          <Row k={t('уходит в подъём', 'spent on climbing')} v={`${n0(thermal.climbW)} ${W}`} />
          <Row k={t('надо отвести теплом', 'must be removed as heat')} v={`${n0(thermal.heatW)} ${W}`} />
          <Row k={t('вода сублиматора', 'sublimator water')} v={`${n3(thermal.waterKgH)} ${t('кг/ч', 'kg/h')}`} />
          <Row k={t('кислород', 'oxygen')} v={`${n3(thermal.oxygenLpm)} ${t('л/мин', 'L/min')}`} />
          <Row k={t('хватит воды на', 'water lasts')} v={`${n1(thermal.waterHours)} ${H}`} />
          <Row k={t('хватит кислорода на', 'oxygen lasts')} v={`${n1(thermal.oxygenHours)} ${H}`} />
          <Row k={t('кончится первым', 'runs out first')} v={limitingLabel(thermal.limiting)} />
          <Notes items={thermal.notes} />
        </article>

        <article className="crew-card">
          <h3>{t('Питание на эти сутки', 'Ration for the day')}</h3>
          <div className="crew-hero">
            <span className="crew-k">{t('всего', 'total')}</span>
            <span><b>{n0(nutrition.totalKcal)}</b> {KCAL}</span>
          </div>
          <Row k={t('основной обмен', 'basal metabolism')} v={`${n0(nutrition.bmrKcal)} ${KCAL}`} />
          <Row k={t('вне выхода', 'outside the EVA')} v={`${n0(nutrition.habitatKcal)} ${KCAL}`} />
          <Row k={t('сам выход', 'the EVA itself')} v={`${n0(nutrition.evaKcal)} ${KCAL}`} />
          <Row k={t('белки', 'protein')} v={`${n0(nutrition.proteinG)} ${G}`} />
          <Row k={t('жиры', 'fat')} v={`${n0(nutrition.fatG)} ${G}`} />
          <Row k={t('углеводы', 'carbohydrates')} v={`${n0(nutrition.carbG)} ${G}`} />
          <Row k={t('питьевая вода', 'drinking water')} v={`${n1(nutrition.drinkingWaterL)} ${L}`} />
          <Notes items={nutrition.notes} />
        </article>

        <article className="crew-card">
          <h3>{t('Радиация', 'Radiation')}</h3>
          <Row k={t('за выход, открытое место', 'per EVA, in the open')} v={`${n3(radiation.openMSv)} ${MSV}`} />
          <Row k={t('с экранированием рельефом', 'with terrain shielding')} v={`${n3(radiation.shieldedMSv)} ${MSV}`} />
          <Row k={t('доля, которую рельеф не снимет', 'share terrain cannot remove')} v={`${n0(ALBEDO_SHARE * 100)} %`} />
          <Row k={t('поправка на набор высоты', 'correction for ascent')} v={`${n4(radiation.elevationMSv)} ${MSV}`} />
          <Row k={t('фон за всю миссию', 'background over the mission')} v={`${n0(radiation.missionMSv)} ${MSV}`} />
          <Row k={t(`доля предела ${CAREER_DOSE_LIMIT_MSV} мЗв`, `share of the ${CAREER_DOSE_LIMIT_MSV} mSv limit`)}
            v={`${n0(radiation.careerPercent)} %`} />
          <Notes items={radiation.notes} />
        </article>

        <article className="crew-card crew-wide">
          <h3>{t('Советы', 'Advice')}</h3>
          {advice.map((a, i) => (
            <p className={`crew-advice crew-advice-${a.level}`} key={i}>{a.text}</p>
          ))}
        </article>
      </div>
    </section>
  );
}
