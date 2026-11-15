// Панель «Экипаж»: что происходит с человеком на выходе — прыжок, питание, теплоотдача,
// кислород по маршруту, доза и советы. Все числа считает shared/eva/crew.ts, панель только показывает.

import { useMemo, useState } from 'react';

import {
  ALBEDO_SHARE,
  CAREER_DOSE_LIMIT_MSV,
  DEFAULT_CREW,
  crewReport,
  type CrewInput,
  type Kind,
  type Leg,
  type Note,
  type Sex,
} from '@/shared/eva/crew';
import { formatDuration } from '@/shared/eva/suit';
import type { Surface } from '@/shared/eva/traverse';

import './crew.css';

const KIND_LABEL: Record<Kind, string> = {
  measurement: 'измерение',
  model: 'модель',
  rule: 'правило',
};

function Badge({ kind }: { kind: Kind }) {
  return <span className={`crew-tag crew-tag-${kind}`}>{KIND_LABEL[kind]}</span>;
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

const n1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1).replace('.', ',') : '—');
const n0 = (v: number) => (Number.isFinite(v) ? Math.round(v).toString() : '—');
const n2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '—');
const n3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3).replace('.', ',') : '—');

interface Props {
  /** Профиль маршрута: если его дал планировщик, поля ног не показываем. */
  legs?: Leg[];
  /** Доля видимого неба в точке работы, из сцены прогулки. */
  skyViewFraction?: number;
  initial?: Partial<CrewInput>;
}

export function CrewPanel({ legs, skyViewFraction, initial }: Props) {
  const [input, setInput] = useState<CrewInput>({ ...DEFAULT_CREW, ...initial });

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

  return (
    <section className="crew">
      <div className="crew-grid">
        <article className="crew-card">
          <h3>Человек</h3>
          <div className="crew-fields">
            <label>
              пол
              <select value={input.sex} onChange={(e) => set('sex', e.target.value as Sex)}>
                <option value="female">женский</option>
                <option value="male">мужской</option>
              </select>
            </label>
            <label>
              возраст, лет
              <input type="number" min={16} max={80} value={input.ageYears}
                onChange={(e) => set('ageYears', Number(e.target.value))} />
            </label>
            <label>
              рост, см
              <input type="number" min={120} max={220} value={input.heightCm}
                onChange={(e) => set('heightCm', Number(e.target.value))} />
            </label>
            <label>
              вес, кг
              <input type="number" min={35} max={160} value={input.bodyKg}
                onChange={(e) => set('bodyKg', Number(e.target.value))} />
            </label>
            <label>
              скафандр, кг
              <input type="number" min={0} max={140} value={input.loadKg}
                onChange={(e) => set('loadKg', Number(e.target.value))} />
            </label>
            <label>
              прыжок на Земле, см
              <input type="number" min={5} max={120} value={Math.round(input.earthJumpM * 100)}
                onChange={(e) => set('earthJumpM', Number(e.target.value) / 100)} />
            </label>
            <label>
              грунт
              <select value={input.surface} onChange={(e) => set('surface', e.target.value as Surface)}>
                <option value="firm">плотный</option>
                <option value="sand">песок</option>
              </select>
            </label>
            <label>
              вода на охлаждение, кг
              <input type="number" min={0.5} max={20} step={0.1} value={input.feedwaterKg}
                onChange={(e) => set('feedwaterKg', Number(e.target.value))} />
            </label>
            <label>
              кислород, л
              <input type="number" min={50} max={3000} value={input.oxygenL}
                onChange={(e) => set('oxygenL', Number(e.target.value))} />
            </label>
            <label>
              миссия, солов
              <input type="number" min={1} max={2000} value={input.surfaceSols}
                onChange={(e) => set('surfaceSols', Number(e.target.value))} />
            </label>
          </div>
        </article>

        <article className="crew-card">
          <h3>Прыжок</h3>
          <div className="crew-hero">
            <span className="crew-k">в скафандре</span>
            <span><b>{n2(jump.heightM)}</b> м</span>
          </div>
          <div className="crew-hero">
            <span className="crew-k">без скафандра</span>
            <span><b>{n2(jump.freeHeightM)}</b> м</span>
          </div>
          <Row k="работа ног за прыжок" v={`${n0(jump.workJ)} Дж`} />
          <Row k="скорость отрыва" v={`${n2(jump.takeoffMs)} м/с`} />
          <Row k="время полёта" v={`${n2(jump.flightS)} с`} />
          <Row k="скорость приземления" v={`${n2(jump.landingMs)} м/с`} />
          <Row k="во сколько раз выше земного" v={`×${n2(jump.ratio)}`} />
          <Notes items={jump.notes} />
        </article>

        <article className="crew-card">
          <h3>Маршрут выхода</h3>
          <Row k="длина" v={`${n2(route.distanceM / 1000)} км`} />
          <Row k="время" v={formatDuration(route.seconds)} />
          <Row k="подъём / спуск" v={`+${n0(route.ascentM)} / −${n0(route.descentM)} м`} />
          <Row k="кислород" v={`${n1(route.o2L)} л`} />
          <Row k="то же в массе" v={`${n3(route.o2Kg)} кг`} />
          <Row k="углекислый газ на поглотитель" v={`${n1(route.co2L)} л`} />
          <Row k="энергия" v={`${n0(route.kcal)} ккал`} />
          <Notes items={route.notes} />
        </article>

        <article className="crew-card">
          <h3>Теплоотдача</h3>
          <Row k="метаболическая мощность" v={`${n0(thermal.powerLowW)}–${n0(thermal.powerHighW)} Вт`} />
          <Row k="уходит в подъём" v={`${n0(thermal.climbW)} Вт`} />
          <Row k="надо отвести теплом" v={`${n0(thermal.heatW)} Вт`} />
          <Row k="вода сублиматора" v={`${n3(thermal.waterKgH)} кг/ч`} />
          <Row k="кислород" v={`${n3(thermal.oxygenLpm)} л/мин`} />
          <Row k="хватит воды на" v={`${n1(thermal.waterHours)} ч`} />
          <Row k="хватит кислорода на" v={`${n1(thermal.oxygenHours)} ч`} />
          <Row k="кончится первым" v={thermal.limiting} />
          <Notes items={thermal.notes} />
        </article>

        <article className="crew-card">
          <h3>Питание на эти сутки</h3>
          <div className="crew-hero">
            <span className="crew-k">всего</span>
            <span><b>{n0(nutrition.totalKcal)}</b> ккал</span>
          </div>
          <Row k="основной обмен" v={`${n0(nutrition.bmrKcal)} ккал`} />
          <Row k="вне выхода" v={`${n0(nutrition.habitatKcal)} ккал`} />
          <Row k="сам выход" v={`${n0(nutrition.evaKcal)} ккал`} />
          <Row k="белки" v={`${n0(nutrition.proteinG)} г`} />
          <Row k="жиры" v={`${n0(nutrition.fatG)} г`} />
          <Row k="углеводы" v={`${n0(nutrition.carbG)} г`} />
          <Row k="питьевая вода" v={`${n1(nutrition.drinkingWaterL)} л`} />
          <Notes items={nutrition.notes} />
        </article>

        <article className="crew-card">
          <h3>Радиация</h3>
          <Row k="за выход, открытое место" v={`${n3(radiation.openMSv)} мЗв`} />
          <Row k="с экранированием рельефом" v={`${n3(radiation.shieldedMSv)} мЗв`} />
          <Row k="доля, которую рельеф не снимет" v={`${n0(ALBEDO_SHARE * 100)} %`} />
          <Row k="поправка на набор высоты" v={`${radiation.elevationMSv.toFixed(4).replace('.', ',')} мЗв`} />
          <Row k="фон за всю миссию" v={`${n0(radiation.missionMSv)} мЗв`} />
          <Row k={`доля предела ${CAREER_DOSE_LIMIT_MSV} мЗв`} v={`${n0(radiation.careerPercent)} %`} />
          <Notes items={radiation.notes} />
        </article>

        <article className="crew-card crew-wide">
          <h3>Советы</h3>
          {advice.map((a, i) => (
            <p className={`crew-advice crew-advice-${a.level}`} key={i}>{a.text}</p>
          ))}
        </article>
      </div>
    </section>
  );
}
