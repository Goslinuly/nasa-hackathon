// Панель «Безопасность выхода (EVA)»: время, расходники, возврат, уклоны, радиация и условия в Гейле по профилю маршрута.
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  fetchEvaConditions,
  fetchEvaRadLive,
  fetchEvaRadiation,
  fetchEvaSlopes,
  fetchEvaSolarEvents,
  fetchEvaSpaceWeather,
  fetchMobilityProfile,
  fetchRouteDose,
  fetchWalkback,
} from '@/shared/api/client';
import type {
  EvaSurface,
  GaleConditions,
  MobilityProfileResponse,
  Provenance,
  RadLiveResponse,
  RadiationResponse,
  RouteDoseResponse,
  SlopesResponse,
  SolarEventsResponse,
  SpaceWeatherSummary,
  WalkbackResponse,
} from '@/shared/api/evaTypes';

import {
  buildEvaPoints,
  cumulativeDistances,
  elevationGain,
  formatCorridor,
  formatDuration,
  levelBadge,
  slopeBadge,
  type ProfileSample,
} from './evaProfile';

const DEFAULT_CREW_KG = 80;
const DEFAULT_LOAD_KG = 45;

type Load<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T };
type Kind = 'measurement' | 'model' | 'rule';

const STATUS_KIND: Record<string, Kind> = {
  measurement: 'measurement',
  measured: 'measurement',
  model: 'model',
  estimate: 'model',
  estimated: 'model',
  extrapolated: 'model',
  empirical: 'model',
  operational_rule: 'rule',
  fact: 'rule',
};

function useLoad<T>(run: () => Promise<T>, deps: unknown[]): Load<T> {
  const [value, setValue] = useState<Load<T>>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    setValue({ state: 'loading' });
    run().then(
      (data) => live && setValue({ state: 'ready', data }),
      (reason) => live && setValue({ state: 'error', message: reason instanceof Error ? reason.message : 'Ошибка' }),
    );
    return () => {
      live = false;
    };
  }, deps);
  return value;
}

function Badge({ kind }: { kind: Kind }) {
  const label = { measurement: 'измерение', model: 'модель', rule: 'правило' }[kind];
  return <span className={`eva-badge eva-badge-${kind}`}>{label}</span>;
}

function ProvenanceNote({ provenance }: { provenance?: Provenance }) {
  if (!provenance) return null;
  const kind = STATUS_KIND[provenance.status];
  return (
    <p className="planner-note">
      {kind && <Badge kind={kind} />} {provenance.source}
      {provenance.note ? `. ${provenance.note}` : ''}
    </p>
  );
}

function Status<T>({ load, children }: { load: Load<T>; children(data: T): ReactNode }) {
  if (load.state === 'loading') return <p className="dim">Загрузка…</p>;
  if (load.state === 'error') return <p className="warn">Не удалось получить данные: {load.message}</p>;
  return <>{children(load.data)}</>;
}

function Unavailable({ detail }: { detail?: string }) {
  return (
    <>
      <p className="warn">Источник недоступен</p>
      {detail && <p className="planner-note">{detail}</p>}
    </>
  );
}

function Notes({ lines }: { lines?: string[] }) {
  return (
    <>
      {lines?.map((line) => (
        <p key={line} className="planner-note">
          {line}
        </p>
      ))}
    </>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const path = values
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * 200).toFixed(1)},${(29 - ((v - min) / span) * 28).toFixed(1)}`)
    .join('');
  return (
    <svg className="eva-spark" viewBox="0 0 200 30" preserveAspectRatio="none" role="img" aria-label="Фон радиации за период">
      <path d={path} />
    </svg>
  );
}

const km = (m: number) => `${(m / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`;

interface Props {
  profile: ProfileSample[];
  surface?: EvaSurface;
  crewKg?: number;
  loadKg?: number;
}

export function EvaPanel({ profile, surface: surfaceProp, crewKg = DEFAULT_CREW_KG, loadKg = DEFAULT_LOAD_KG }: Props) {
  const [ownSurface, setSurface] = useState<EvaSurface>('firm');
  const surface = surfaceProp ?? ownSurface;
  const [crew, setCrew] = useState<1 | 2>(2);
  const [o2Input, setO2Input] = useState('');

  const points = useMemo(() => buildEvaPoints(profile), [profile]);
  const deltaH = useMemo(() => elevationGain(profile), [profile]);
  const routeLengthM = useMemo(() => cumulativeDistances(points).at(-1) ?? 0, [points]);
  const mobilityPoints = useMemo(() => {
    let total = 0;
    const cumulative = points.map((point) => {
      total += point.distance_m;
      return { distance_m: total, slope_deg: point.slope_deg };
    });
    return [{ distance_m: 0, slope_deg: 0 }, ...cumulative];
  }, [points]);
  const walkbackPoints = useMemo(() => {
    if (routeLengthM <= 0) return [];
    const step = Math.max(250, routeLengthM / 400);
    const list: { distance_from_base_m: number }[] = [];
    for (let d = step; d < routeLengthM; d += step) list.push({ distance_from_base_m: d });
    list.push({ distance_from_base_m: routeLengthM });
    return list;
  }, [routeLengthM]);

  const slopes = useLoad<SlopesResponse>(fetchEvaSlopes, []);
  const conditions = useLoad<GaleConditions>(fetchEvaConditions, []);
  const radLive = useLoad<RadLiveResponse>(() => fetchEvaRadLive(30), []);
  const solar = useLoad<SolarEventsResponse>(() => fetchEvaSolarEvents(14), []);
  const radiation = useLoad<RadiationResponse>(() => fetchEvaRadiation(deltaH), [deltaH]);
  const spaceWeather = useLoad<SpaceWeatherSummary>(fetchEvaSpaceWeather, []);
  const mobility = useLoad<MobilityProfileResponse>(
    () => fetchMobilityProfile({ points: mobilityPoints, crew_kg: crewKg, load_kg: loadKg, surface }),
    [mobilityPoints, surface, crewKg, loadKg],
  );

  const defaultO2 = mobility.state === 'ready' ? Math.ceil(mobility.data.totals.o2_l.high) : 0;
  const o2Remaining = o2Input === '' ? defaultO2 : Number(o2Input.replace(',', '.'));
  const o2Valid = Number.isFinite(o2Remaining) && o2Remaining > 0 && o2Remaining <= 100_000;

  const routeSeconds =
    mobility.state === 'ready' ? Math.min(mobility.data.totals.time_s, 2 * 88775) : 0;
  const routeDose = useLoad<RouteDoseResponse | null>(
    () => (routeSeconds > 0 ? fetchRouteDose(routeSeconds, deltaH) : Promise.resolve(null)),
    [routeSeconds, deltaH],
  );

  const walkback = useLoad<WalkbackResponse | null>(
    () =>
      o2Valid
        ? fetchWalkback({ points: walkbackPoints, o2_remaining_l: o2Remaining })
        : Promise.resolve(null),
    [walkbackPoints, o2Remaining, o2Valid],
  );

  const thresholds = slopes.state === 'ready' ? slopes.data.thresholds : [];
  const strip =
    mobility.state === 'ready'
      ? mobility.data.segments.map((seg) => ({
          level: levelBadge(seg.slope_class.level),
          length: seg.length_m,
          title: `${seg.slope_deg.toFixed(1)}° · ${seg.slope_class.label}`,
        }))
      : points.map((point) => ({
          level: slopeBadge(point.slope_deg, thresholds),
          length: point.distance_m,
          title: `${point.slope_deg.toFixed(1)}°`,
        }));

  return (
    <section className="eva-panel" aria-label="Безопасность выхода (EVA)">
      <h2 className="planner-subtitle">Безопасность выхода (EVA)</h2>
      {points.length === 0 && <p className="dim">В профиле маршрута нет участков для расчёта.</p>}

      <h3 className="eva-heading">
        Время и расходники <Badge kind="model" />
      </h3>
      <div className="day-toggle" role="radiogroup" aria-label="Состав выхода">
        {([2, 1] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={crew === value}
            className={crew === value ? 'active' : undefined}
            onClick={() => setCrew(value)}
          >
            {value === 2 ? 'Пара' : 'Один'}
          </button>
        ))}
      </div>
      <div className="day-toggle" role="radiogroup" aria-label="Поверхность" hidden={surfaceProp !== undefined}>
        {(['firm', 'sand'] as EvaSurface[]).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={surface === value}
            className={surface === value ? 'active' : undefined}
            onClick={() => setSurface(value)}
          >
            {value === 'firm' ? 'Твёрдая' : 'Песок'}
          </button>
        ))}
      </div>
      <Status load={mobility}>
        {(data) => (
          <>
            <dl className="route-stats">
              <div>
                <dt>Время выхода</dt>
                <dd>{formatDuration(data.totals.time_s)}</dd>
              </div>
              <div>
                <dt>{crew === 2 ? 'Кислород на пару' : 'Кислород'}</dt>
                <dd className="eva-corridor">
                  {formatCorridor(data.totals.o2_l.low * crew, data.totals.o2_l.high * crew, 'л')}
                </dd>
              </div>
            </dl>
            {crew === 2 && (
              <p className="planner-note">
                Выход парой — правило NASA: напарник страхует при одиночном отказе и удваивает науку за выход.
                Кислород здесь — сумма двух комплектов; запас и возврат каждый несёт свои, общих баллонов в модели нет.
              </p>
            )}
            <p className="planner-note">
              Значения даны коридором: расход у каждого человека свой, это видно по расхождению прогнозов и фактов Apollo.
              На пеших траверсах раньше кислорода кончается вода на охлаждение.
            </p>
            <p className="planner-note">{data.provenance.time_note}</p>
            {[data.provenance.speed, data.provenance.terrain, data.provenance.power, data.provenance.oxygen].map((p) => (
              <ProvenanceNote key={p.source} provenance={p} />
            ))}
          </>
        )}
      </Status>

      <h3 className="eva-heading">
        Возврат <Badge kind="rule" />
      </h3>
      <label className="eva-field">
        <span>Запас кислорода на человека, л</span>
        <input
          type="number"
          min="1"
          max="100000"
          inputMode="decimal"
          value={o2Input === '' ? defaultO2 || '' : o2Input}
          onChange={(event) => setO2Input(event.target.value)}
        />
      </label>
      <Status load={walkback}>
        {(data) =>
          data == null ? (
            <p className="dim">Введите запас кислорода.</p>
          ) : (
            <>
              {data.farthest_allowed_m == null ? (
                <p className="warn">Возврат не обеспечен ни для одной точки.</p>
              ) : (
                <p>
                  Возврат обеспечен до <strong>{km(data.farthest_allowed_m)} от базы</strong> (длина маршрута{' '}
                  {km(routeLengthM)}).
                </p>
              )}
              <p className="planner-note">Принцип: возврат при любом одиночном отказе.</p>
              <ProvenanceNote provenance={data.provenance} />
            </>
          )
        }
      </Status>

      <h3 className="eva-heading">
        Уклоны <Badge kind="rule" />
      </h3>
      <div className="eva-strip" role="img" aria-label="Уклоны по сегментам маршрута">
        {strip.map((seg, index) => (
          <span key={index} className={`eva-seg eva-${seg.level}`} style={{ flexGrow: seg.length }} title={seg.title} />
        ))}
      </div>
      <p className="planner-note">
        <span className="eva-badge eva-ok">&lt; 15°</span> <span className="eva-badge eva-warn">15–20°</span>{' '}
        <span className="eva-badge eva-limit">&gt; 20°: вне области модели</span>
      </p>
      <Status load={slopes}>
        {(data) => (
          <>
            <ul className="eva-list">
              {data.thresholds.map((t) => (
                <li key={t.key}>
                  <strong>±{t.high_deg}°</strong>: {t.label}{' '}
                  <span className="planner-note">
                    ({t.nature === 'operational_rule' ? 'правило, не требование стандарта' : t.nature})
                  </span>
                </li>
              ))}
            </ul>
            <Notes lines={data.facts.map((f) => f.text)} />
          </>
        )}
      </Status>

      <h3 className="eva-heading">
        Радиация <Badge kind="model" />
      </h3>
      <Status load={radiation}>
        {(data) => (
          <>
            <p className="eva-corridor">
              {formatCorridor(data.dose_corridor.low, data.dose_corridor.high, data.dose_corridor.units)}
            </p>
            <p className="planner-note">
              Средняя оценка {data.dose_corridor.mid.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}{' '}
              {data.dose_corridor.units}; по солнечному циклу{' '}
              {formatCorridor(data.dose_corridor.range_low, data.dose_corridor.range_high, data.dose_corridor.units)}.
            </p>
            <ProvenanceNote provenance={data.dose_corridor.provenance} />
            {data.elevation_correction && (
              <p className="planner-note">
                Подъём по профилю {Math.round(deltaH).toLocaleString('ru-RU')} м: поправка{' '}
                {data.elevation_correction.delta_ugy_per_sol.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}{' '}
                мкГр/сол ({data.elevation_correction.status}).
              </p>
            )}
            <ProvenanceNote provenance={data.elevation_correction?.provenance} />
            <Notes lines={data.solar_event_facts} />
          </>
        )}
      </Status>
      <h4 className="eva-sub">
        Доза за этот выход <Badge kind="model" />
      </h4>
      <Status load={routeDose}>
        {(data) =>
          data == null ? (
            <p className="dim">Появится после расчёта времени выхода.</p>
          ) : (
            <>
              <p className="eva-corridor">
                {data.dose_msv.low.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}–
                {data.dose_msv.high.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} мЗв
              </p>
              <p className="planner-note">
                Средняя {data.dose_msv.mid.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} мЗв за{' '}
                {(data.fraction_of_sol * 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}% сола в пути
                {data.elevation_correction
                  ? `; учтён перепад высоты ${Math.round(data.elevation_correction.delta_h_m).toLocaleString('ru-RU')} м`
                  : ''}
                .
              </p>
              <ProvenanceNote provenance={data.provenance} />
            </>
          )
        }
      </Status>

      <h4 className="eva-sub">
        Космическая погода сейчас <Badge kind="measurement" />
      </h4>
      <Status load={spaceWeather}>
        {(data) => {
          const level = data.advisory.level;
          const levelClass = { calm: 'eva-ok', elevated: 'eva-limit', event_at_earth: 'eva-warn' }[level];
          const levelLabel = { calm: 'спокойно', elevated: 'фон повышен', event_at_earth: 'событие у Земли' }[level];
          const mars = data.mars_measured;
          const earth = data.earth_measured;
          return (
            <>
              <p>
                <span className={`eva-badge ${levelClass}`}>{levelLabel}</span>
              </p>
              <Notes lines={data.advisory.reasons} />
              {mars.status === 'ok' ? (
                <p className="planner-note">
                  RAD на Марсе: {mars.latest_ugy_per_sol.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} мкГр/сол,{' '}
                  {mars.ratio_to_median.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}× медианы 30 солов ·{' '}
                  {mars.latest_time}
                </p>
              ) : (
                <Unavailable detail={mars.detail} />
              )}
              {earth.status === 'ok' ? (
                <>
                  <p className="planner-note">
                    У Земли (GOES): протоны ≥10 МэВ{' '}
                    {earth.proton_flux_10mev_pfu.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} pfu — S
                    {earth.s_scale_now} (за сутки до S{earth.s_scale_max24h}), рентген {earth.xray_class}, шкалы NOAA R
                    {earth.noaa_scales_now.R ?? '—'}/S{earth.noaa_scales_now.S ?? '—'}/G{earth.noaa_scales_now.G ?? '—'}
                  </p>
                  <Notes lines={[earth.caveat]} />
                </>
              ) : (
                <Unavailable detail={earth.detail} />
              )}
              <ProvenanceNote provenance={data.advisory.provenance} />
            </>
          );
        }}
      </Status>

      <h4 className="eva-sub">
        Фон RAD, 30 дней <Badge kind="measurement" />
      </h4>
      <Status load={radLive}>
        {(data) => {
          if (data.status !== 'ok') return <Unavailable detail={data.detail} />;
          const last = data.series.at(-1);
          return (
            <>
              <Sparkline values={data.series.map((s) => s.dose_ugy_per_sol)} />
              {last && (
                <p className="planner-note">
                  Последнее: {last.dose_msv_per_sol.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} мЗв/сол (
                  {formatCorridor(last.dose_msv_low, last.dose_msv_high, 'мЗв/сол')};{' '}
                  {last.dose_ugy_per_sol.toLocaleString('ru-RU')} мкГр/сол) · {last.time.slice(0, 10)}
                </p>
              )}
              <Notes lines={[data.caveat, `Коэффициент качества ${data.quality_factor}: ${data.quality_factor_status}`]} />
            </>
          );
        }}
      </Status>
      <h4 className="eva-sub">
        Солнечные события DONKI <Badge kind="measurement" />
      </h4>
      <Status load={solar}>
        {(data) =>
          data.status !== 'ok' ? (
            <Unavailable detail={data.detail} />
          ) : (
            <>
              {data.events.length === 0 && <p className="dim">За период событий нет.</p>}
              <ul className="eva-list">
                {data.events.map((event, index) => (
                  <li key={index}>
                    {[event.time, event.type, event.class, event.speed_km_s ? `${event.speed_km_s} км/с` : '']
                      .filter(Boolean)
                      .join(' · ')}
                    {event.link && (
                      <>
                        {' '}
                        <a href={event.link} target="_blank" rel="noreferrer">
                          ↗
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <Notes lines={[data.caveat]} />
            </>
          )
        }
      </Status>

      <h3 className="eva-heading">
        Сейчас в Гейле <Badge kind="measurement" />
      </h3>
      <Status load={conditions}>
        {(data) =>
          data.status !== 'ok' ? (
            <Unavailable detail={data.detail} />
          ) : (
            <>
              <dl className="route-stats">
                <div>
                  <dt>Сол</dt>
                  <dd>{data.latest.sol}</dd>
                </div>
                <div>
                  <dt>Температура</dt>
                  <dd>
                    {data.latest.min_temp_c}…{data.latest.max_temp_c} °C
                  </dd>
                </div>
                <div>
                  <dt>Давление</dt>
                  <dd>{data.latest.pressure_pa.toLocaleString('ru-RU')} Па</dd>
                </div>
                <div>
                  <dt>Прозрачность</dt>
                  <dd>{data.latest.atmo_opacity}</dd>
                </div>
                <div>
                  <dt>Восход / закат</dt>
                  <dd>
                    {data.latest.sunrise} / {data.latest.sunset}
                  </dd>
                </div>
              </dl>
              <Notes lines={[data.caveat]} />
            </>
          )
        }
      </Status>
    </section>
  );
}
