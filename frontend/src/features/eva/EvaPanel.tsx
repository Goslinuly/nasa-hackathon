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
import { locale, tr, useT } from '@/shared/i18n/lang';

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
      (reason) => live && setValue({ state: 'error', message: reason instanceof Error ? reason.message : tr('Ошибка', 'Error') }),
    );
    return () => {
      live = false;
    };
  }, deps);
  return value;
}

function Badge({ kind }: { kind: Kind }) {
  const t = useT();
  const label = { measurement: t('измерение', 'measurement'), model: t('модель', 'model'), rule: t('правило', 'rule') }[kind];
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
  if (load.state === 'loading') return <p className="dim">{tr('Загрузка…', 'Loading…')}</p>;
  if (load.state === 'error') return <p className="warn">{tr('Не удалось получить данные', 'Could not get the data')}: {load.message}</p>;
  return <>{children(load.data)}</>;
}

function Unavailable({ detail }: { detail?: string }) {
  return (
    <>
      <p className="warn">{tr('Источник недоступен', 'Source unavailable')}</p>
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
    <svg className="eva-spark" viewBox="0 0 200 30" preserveAspectRatio="none" role="img" aria-label={tr('Фон радиации за период', 'Radiation background over the period')}>
      <path d={path} />
    </svg>
  );
}

const km = (m: number) => `${(m / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })} ${tr('км', 'km')}`;

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
  const t = useT();

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
    <section className="eva-panel" aria-label={t('Безопасность выхода (EVA)', 'EVA safety')}>
      <h2 className="planner-subtitle">{t('Безопасность выхода (EVA)', 'EVA safety')}</h2>
      {points.length === 0 && <p className="dim">{t('В профиле маршрута нет участков для расчёта.', 'The route profile has no segments to compute.')}</p>}

      <h3 className="eva-heading">
        {t('Время и расходники', 'Time and consumables')} <Badge kind="model" />
      </h3>
      <div className="day-toggle" role="radiogroup" aria-label={t('Состав выхода', 'EVA crew')}>
        {([2, 1] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={crew === value}
            className={crew === value ? 'active' : undefined}
            onClick={() => setCrew(value)}
          >
            {value === 2 ? t('Пара', 'Pair') : t('Один', 'Solo')}
          </button>
        ))}
      </div>
      <div className="day-toggle" role="radiogroup" aria-label={t('Поверхность', 'Surface')} hidden={surfaceProp !== undefined}>
        {(['firm', 'sand'] as EvaSurface[]).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={surface === value}
            className={surface === value ? 'active' : undefined}
            onClick={() => setSurface(value)}
          >
            {value === 'firm' ? t('Твёрдая', 'Firm') : t('Песок', 'Sand')}
          </button>
        ))}
      </div>
      <Status load={mobility}>
        {(data) => (
          <>
            <dl className="route-stats">
              <div>
                <dt>{t('Время выхода', 'EVA time')}</dt>
                <dd>{formatDuration(data.totals.time_s)}</dd>
              </div>
              <div>
                <dt>{crew === 2 ? t('Кислород на пару', 'Oxygen for the pair') : t('Кислород', 'Oxygen')}</dt>
                <dd className="eva-corridor">
                  {formatCorridor(data.totals.o2_l.low * crew, data.totals.o2_l.high * crew, t('л', 'L'))}
                </dd>
              </div>
            </dl>
            {crew === 2 && (
              <p className="planner-note">
                {t(
                  'Выход парой — правило NASA: напарник страхует при одиночном отказе и удваивает науку за выход. Кислород здесь — сумма двух комплектов; запас и возврат каждый несёт свои, общих баллонов в модели нет.',
                  'EVAs in pairs are a NASA rule: the partner covers any single failure and doubles the science per EVA. Oxygen here is the sum of two kits; each person carries their own reserve and return supply, the model has no shared tanks.',
                )}
              </p>
            )}
            <p className="planner-note">
              {t(
                'Значения даны коридором: расход у каждого человека свой, это видно по расхождению прогнозов и фактов Apollo. На пеших траверсах раньше кислорода кончается вода на охлаждение.',
                'Values are given as a corridor: consumption differs from person to person, as the gap between Apollo forecasts and actuals shows. On walking traverses, cooling water runs out before oxygen.',
              )}
            </p>
            <p className="planner-note">{data.provenance.time_note}</p>
            {[data.provenance.speed, data.provenance.terrain, data.provenance.power, data.provenance.oxygen].map((p) => (
              <ProvenanceNote key={p.source} provenance={p} />
            ))}
          </>
        )}
      </Status>

      <h3 className="eva-heading">
        {t('Возврат', 'Return')} <Badge kind="rule" />
      </h3>
      <label className="eva-field">
        <span>{t('Запас кислорода на человека, л', 'Oxygen reserve per person, L')}</span>
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
            <p className="dim">{t('Введите запас кислорода.', 'Enter the oxygen reserve.')}</p>
          ) : (
            <>
              {data.farthest_allowed_m == null ? (
                <p className="warn">{t('Возврат не обеспечен ни для одной точки.', 'Return is not assured for any point.')}</p>
              ) : (
                <p>
                  {t('Возврат обеспечен до', 'Return is assured up to')}{' '}
                  <strong>
                    {km(data.farthest_allowed_m)} {t('от базы', 'from base')}
                  </strong>{' '}
                  ({t('длина маршрута', 'route length')} {km(routeLengthM)}).
                </p>
              )}
              <p className="planner-note">{t('Принцип: возврат при любом одиночном отказе.', 'Principle: return after any single failure.')}</p>
              <ProvenanceNote provenance={data.provenance} />
            </>
          )
        }
      </Status>

      <h3 className="eva-heading">
        {t('Уклоны', 'Slopes')} <Badge kind="rule" />
      </h3>
      <div className="eva-strip" role="img" aria-label={t('Уклоны по сегментам маршрута', 'Slopes by route segment')}>
        {strip.map((seg, index) => (
          <span key={index} className={`eva-seg eva-${seg.level}`} style={{ flexGrow: seg.length }} title={seg.title} />
        ))}
      </div>
      <p className="planner-note">
        <span className="eva-badge eva-ok">&lt; 15°</span> <span className="eva-badge eva-warn">15–20°</span>{' '}
        <span className="eva-badge eva-limit">&gt; 20°: {t('вне области модели', 'outside the model range')}</span>
      </p>
      <Status load={slopes}>
        {(data) => (
          <>
            <ul className="eva-list">
              {data.thresholds.map((th) => (
                <li key={th.key}>
                  <strong>±{th.high_deg}°</strong>: {th.label}{' '}
                  <span className="planner-note">
                    ({th.nature === 'operational_rule' ? t('правило, не требование стандарта', 'a rule, not a standard requirement') : th.nature})
                  </span>
                </li>
              ))}
            </ul>
            <Notes lines={data.facts.map((f) => f.text)} />
          </>
        )}
      </Status>

      <h3 className="eva-heading">
        {t('Радиация', 'Radiation')} <Badge kind="model" />
      </h3>
      <Status load={radiation}>
        {(data) => (
          <>
            <p className="eva-corridor">
              {formatCorridor(data.dose_corridor.low, data.dose_corridor.high, data.dose_corridor.units)}
            </p>
            <p className="planner-note">
              {t('Средняя оценка', 'Mean estimate')} {data.dose_corridor.mid.toLocaleString(locale(), { maximumFractionDigits: 2 })}{' '}
              {data.dose_corridor.units}; {t('по солнечному циклу', 'over the solar cycle')}{' '}
              {formatCorridor(data.dose_corridor.range_low, data.dose_corridor.range_high, data.dose_corridor.units)}.
            </p>
            <ProvenanceNote provenance={data.dose_corridor.provenance} />
            {data.elevation_correction && (
              <p className="planner-note">
                {t('Подъём по профилю', 'Profile climb')} {Math.round(deltaH).toLocaleString(locale())} {t('м', 'm')}:{' '}
                {t('поправка', 'correction')}{' '}
                {data.elevation_correction.delta_ugy_per_sol.toLocaleString(locale(), { maximumFractionDigits: 1 })}{' '}
                {t('мкГр/сол', 'µGy/sol')} ({data.elevation_correction.status}).
              </p>
            )}
            <ProvenanceNote provenance={data.elevation_correction?.provenance} />
            <Notes lines={data.solar_event_facts} />
          </>
        )}
      </Status>
      <h4 className="eva-sub">
        {t('Доза за этот выход', 'Dose for this EVA')} <Badge kind="model" />
      </h4>
      <Status load={routeDose}>
        {(data) =>
          data == null ? (
            <p className="dim">{t('Появится после расчёта времени выхода.', 'Appears once the EVA time is computed.')}</p>
          ) : (
            <>
              <p className="eva-corridor">
                {data.dose_msv.low.toLocaleString(locale(), { maximumFractionDigits: 2 })}–
                {data.dose_msv.high.toLocaleString(locale(), { maximumFractionDigits: 2 })} {t('мЗв', 'mSv')}
              </p>
              <p className="planner-note">
                {t('Средняя', 'Mean')} {data.dose_msv.mid.toLocaleString(locale(), { maximumFractionDigits: 3 })} {t('мЗв за', 'mSv over')}{' '}
                {(data.fraction_of_sol * 100).toLocaleString(locale(), { maximumFractionDigits: 0 })}
                {t('% сола в пути', '% of a sol on the move')}
                {data.elevation_correction
                  ? t(
                      `; учтён перепад высоты ${Math.round(data.elevation_correction.delta_h_m).toLocaleString(locale())} м`,
                      `; includes an elevation change of ${Math.round(data.elevation_correction.delta_h_m).toLocaleString(locale())} m`,
                    )
                  : ''}
                .
              </p>
              <ProvenanceNote provenance={data.provenance} />
            </>
          )
        }
      </Status>

      <h4 className="eva-sub">
        {t('Космическая погода сейчас', 'Space weather now')} <Badge kind="measurement" />
      </h4>
      <Status load={spaceWeather}>
        {(data) => {
          const level = data.advisory.level;
          const levelClass = { calm: 'eva-ok', elevated: 'eva-limit', event_at_earth: 'eva-warn' }[level];
          const levelLabel = {
            calm: t('спокойно', 'quiet'),
            elevated: t('фон повышен', 'elevated background'),
            event_at_earth: t('событие у Земли', 'event at Earth'),
          }[level];
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
                  {t('RAD на Марсе', 'RAD on Mars')}: {mars.latest_ugy_per_sol.toLocaleString(locale(), { maximumFractionDigits: 0 })}{' '}
                  {t('мкГр/сол', 'µGy/sol')},{' '}
                  {mars.ratio_to_median.toLocaleString(locale(), { maximumFractionDigits: 2 })}× {t('медианы 30 солов', 'the 30-sol median')} ·{' '}
                  {mars.latest_time}
                </p>
              ) : (
                <Unavailable detail={mars.detail} />
              )}
              {earth.status === 'ok' ? (
                <>
                  <p className="planner-note">
                    {t('У Земли (GOES): протоны ≥10 МэВ', 'At Earth (GOES): protons ≥10 MeV')}{' '}
                    {earth.proton_flux_10mev_pfu.toLocaleString(locale(), { maximumFractionDigits: 1 })} pfu — S
                    {earth.s_scale_now} ({t('за сутки до', 'up to')} S{earth.s_scale_max24h}
                    {t('', ' in 24 h')}), {t('рентген', 'X-ray')} {earth.xray_class}, {t('шкалы NOAA', 'NOAA scales')} R
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
        {t('Фон RAD, 30 дней', 'RAD background, 30 days')} <Badge kind="measurement" />
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
                  {t('Последнее', 'Latest')}: {last.dose_msv_per_sol.toLocaleString(locale(), { maximumFractionDigits: 3 })}{' '}
                  {t('мЗв/сол', 'mSv/sol')} ({formatCorridor(last.dose_msv_low, last.dose_msv_high, t('мЗв/сол', 'mSv/sol'))};{' '}
                  {last.dose_ugy_per_sol.toLocaleString(locale())} {t('мкГр/сол', 'µGy/sol')}) · {last.time.slice(0, 10)}
                </p>
              )}
              <Notes lines={[data.caveat, `${t('Коэффициент качества', 'Quality factor')} ${data.quality_factor}: ${data.quality_factor_status}`]} />
            </>
          );
        }}
      </Status>
      <h4 className="eva-sub">
        {t('Солнечные события DONKI', 'DONKI solar events')} <Badge kind="measurement" />
      </h4>
      <Status load={solar}>
        {(data) =>
          data.status !== 'ok' ? (
            <Unavailable detail={data.detail} />
          ) : (
            <>
              {data.events.length === 0 && <p className="dim">{t('За период событий нет.', 'No events in this period.')}</p>}
              <ul className="eva-list">
                {data.events.map((event, index) => (
                  <li key={index}>
                    {[event.time, event.type, event.class, event.speed_km_s ? `${event.speed_km_s} ${t('км/с', 'km/s')}` : '']
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
        {t('Сейчас в Гейле', 'Now in Gale')} <Badge kind="measurement" />
      </h3>
      <Status load={conditions}>
        {(data) =>
          data.status !== 'ok' ? (
            <Unavailable detail={data.detail} />
          ) : (
            <>
              <dl className="route-stats">
                <div>
                  <dt>{t('Сол', 'Sol')}</dt>
                  <dd>{data.latest.sol}</dd>
                </div>
                <div>
                  <dt>{t('Температура', 'Temperature')}</dt>
                  <dd>
                    {data.latest.min_temp_c}…{data.latest.max_temp_c} °C
                  </dd>
                </div>
                <div>
                  <dt>{t('Давление', 'Pressure')}</dt>
                  <dd>
                    {data.latest.pressure_pa.toLocaleString(locale())} {t('Па', 'Pa')}
                  </dd>
                </div>
                <div>
                  <dt>{t('Прозрачность', 'Opacity')}</dt>
                  <dd>{data.latest.atmo_opacity}</dd>
                </div>
                <div>
                  <dt>{t('Восход / закат', 'Sunrise / sunset')}</dt>
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
