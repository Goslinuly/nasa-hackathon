// Экран выхода (HUD) поверх вида от первого лица, docs/TZ_First_Person.md, раздел 6.
// Получает WalkState несколько раз в секунду. Клавиша H: «полный» → «скрыт» → «минимум».
// Сам слой не ловит мышь (pointer-events: none), кроме меток с подсказками и кнопки уровня.
import { useEffect, useMemo, useState } from 'react';

import type { WalkState } from '@/app/modeContract';
import { getLang, locale, tr, useT } from '@/shared/i18n/lang';
import { DOSE_RATE_MSV_DAY, distanceToGaleKm, evaDose, GALE, loadRad, type RadSummary } from '@/shared/eva/radiation';
import {
  DONKI_TYPE_LABEL,
  latestRelevantEvent,
  loadSpaceWeather,
  type SpaceWeather,
} from '@/shared/eva/spaceWeather';
import {
  darknessRisk,
  DEFAULT_EVA_BUDGET,
  evaBudget,
  formatDistance,
  formatDuration,
  slopeLevel,
} from '@/shared/eva/suit';
import { regionAt, regionTypeRu, type RegionInfo } from '@/shared/regions/regionAt';
import { formatLightTime, interpolateLightTime, loadLightTimeTable, type LightTimeTable } from '@/shared/time/lightTime';
import {
  formatHours,
  lmstHours,
  ltstHours,
  marsTime,
  missionNear,
  missionSol,
  nextSunEvents,
  sunPosition,
} from '@/shared/time/mars24';

import { Row } from './Badge';
import { Compass } from './Compass';
import './hud.css';

export type HudLevel = 'min' | 'full' | 'hidden';
const NEXT_LEVEL: Record<HudLevel, HudLevel> = { min: 'full', full: 'hidden', hidden: 'min' };
const LEVEL_TITLE: Record<HudLevel, [string, string]> = {
  min: ['минимум', 'minimal'],
  full: ['полный', 'full'],
  hidden: ['скрыт', 'hidden'],
};

/** Внешние данные HUD; undefined — ещё грузится, null — нет данных. */
export interface HudExternal {
  lightTable?: LightTimeTable | null;
  rad?: RadSummary | null;
  spaceWeather?: SpaceWeather | null;
  region?: RegionInfo | null;
}

export interface HudProps {
  state: WalkState;
}

export function Hud({ state }: HudProps) {
  // На телефоне полный HUD закрывает сцену: начинаем с минимума.
  const [level, setLevel] = useState<HudLevel>(() =>
    window.matchMedia?.('(max-width: 760px), (max-height: 500px), (pointer: coarse)').matches ? 'min' : 'full',
  );
  const [ext, setExt] = useState<HudExternal>({});

  useEffect(() => {
    let alive = true;
    loadLightTimeTable().then(lightTable => alive && setExt(e => ({ ...e, lightTable })));
    loadRad().then(rad => alive && setExt(e => ({ ...e, rad })));
    loadSpaceWeather(7).then(spaceWeather => alive && setExt(e => ({ ...e, spaceWeather })));
    return () => {
      alive = false;
    };
  }, []);

  const regionLat = Math.round(state.lat * 50);
  const regionLon = Math.round(state.lonEast * 50);
  useEffect(() => {
    let alive = true;
    regionAt(regionLon / 50, regionLat / 50).then(
      region => alive && setExt(e => ({ ...e, region })),
      () => alive && setExt(e => ({ ...e, region: null })),
    );
    return () => {
      alive = false;
    };
  }, [regionLat, regionLon]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyH' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      setLevel(l => NEXT_LEVEL[l]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <HudView state={state} ext={ext} level={level} onToggle={() => setLevel(l => NEXT_LEVEL[l])} />;
}

// --- форматирование ---------------------------------------------------------------------

const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(4)}°${lat < 0 ? 'S' : 'N'}`;
const fmtLon = (lon: number) => `${(((lon % 360) + 360) % 360).toFixed(4)}°E`;
const fmtNum = (x: number, digits: number) =>
  (getLang() === 'en' ? x.toFixed(digits) : x.toFixed(digits).replace('.', ',')).replace('-', '−');
const pad = (n: number) => String(n).padStart(2, '0');

function fmtUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function fmtViewer(ms: number): string {
  try {
    return new Date(ms).toLocaleString(locale(), {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return '—';
  }
}

const dateOnly = (iso: string) => (iso ? iso.slice(0, 10) : '');

function regionLine(region: RegionInfo | null | undefined): string {
  if (region === undefined) return '…';
  if (!region || (!region.specific && !region.province)) return tr('вне именованных структур', 'outside named features');
  const parts: string[] = [];
  if (region.specific) {
    const name = region.specific.name;
    if (getLang() === 'en') {
      // Тип по IAU: «Crater, craters» → crater; не повторяем, если тип уже в названии.
      const kindEn = (region.specific.type || '').split(',')[0].trim().toLowerCase();
      parts.push(kindEn && !name.toLowerCase().includes(kindEn) ? `${name} ${kindEn}` : name);
    } else {
      const kind = regionTypeRu(region.specific.type);
      parts.push(kind ? `${kind} ${name}` : name);
    }
  }
  if (region.province) parts.push(region.province.name);
  return parts.join(' · ');
}

function regionTip(region: RegionInfo | null | undefined): string {
  const base = tr(
    'Названия из газеттира планетной номенклатуры IAU/USGS; попадание считается по окружности диаметра объекта, это грубая граница.',
    'Names from the IAU/USGS Gazetteer of Planetary Nomenclature; a hit is tested against a circle of the feature diameter, so the boundary is rough.',
  );
  const geo = region?.geology
    ? tr(` Геологический юнит по карте USGS SIM 3292: ${region.geology.label}.`, ` Geologic unit from USGS map SIM 3292: ${region.geology.label}.`)
    : '';
  return base + geo;
}

// --- вид --------------------------------------------------------------------------------

export interface HudViewProps {
  state: WalkState;
  ext: HudExternal;
  level: HudLevel;
  onToggle?: () => void;
}

export function HudView({ state: s, ext, level, onToggle }: HudViewProps) {
  const tt = useT();
  const t = useMemo(() => marsTime(s.simTimeMs), [s.simTimeMs]);
  // Закат и восход: перебор по времени, поэтому пересчёт раз в ~30 с модельного времени
  // и при сдвиге на ~0.01°.
  const bucket = Math.floor(s.simTimeMs / 30000);
  const latKey = Math.round(s.lat * 100);
  const lonKey = Math.round(s.lonEast * 100);
  const sunEvents = useMemo(
    () => nextSunEvents(bucket * 30000, latKey / 100, lonKey / 100),
    [bucket, latKey, lonKey],
  );

  const toggle = (
    <button type="button" className="hud-toggle" onClick={onToggle} title={tt('Уровень экрана: минимум → полный → скрыт', 'Display level: minimal → full → hidden')}>
      HUD: {tt(...LEVEL_TITLE[level])} · H
    </button>
  );
  if (level === 'hidden') return <div className="hud walk-hud hud--hidden">{toggle}</div>;
  const full = level === 'full';
  const rover = s.vehicle === 'rover';

  const lmst = lmstHours(t, s.lonEast);
  const ltst = ltstHours(t, s.lonEast);
  const sun = sunPosition(t, s.lat, s.lonEast);
  const toSunset = sunEvents.sunset ? (sunEvents.sunset.utcMs - s.simTimeMs) / 1000 : null;
  const toSunrise = sunEvents.sunrise ? (sunEvents.sunrise.utcMs - s.simTimeMs) / 1000 : null;
  const mission = missionNear(s.lat, s.lonEast);
  const light = ext.lightTable ? interpolateLightTime(ext.lightTable, s.simTimeMs) : null;
  const budget = evaBudget(s.evaSeconds, s.baseDistanceM);
  const dark = darknessRisk(toSunset !== null && toSunset >= 0 ? toSunset : null, budget.backS) || sun.elevationDeg < 0;
  const hereTone = slopeLevel(s.slopeHereDeg, s.maxSlopeDeg);
  const aheadTone = slopeLevel(s.slopeAheadDeg, s.maxSlopeDeg);
  const scale = s.timeScale > 1 ? <span className="hud-scale">×{s.timeScale}</span> : null;

  const marsTimeTip = tt(
    'Алгоритм NASA GISS Mars24 (Allison & McEwen 2000), расчёт в браузере по модельным часам выхода. ' +
      'Точность ~1 с для LMST. Долгота восточная.',
    'NASA GISS Mars24 algorithm (Allison & McEwen 2000), computed in the browser from the EVA model clock. ' +
      'Accuracy ~1 s for LMST. East longitude.',
  );
  const slopeTip = tt(
    `Уклон в градусах по модели рельефа сцены (${s.dataLevel}). Зелёный: до 15°, жёлтый: до порога ` +
      `${s.maxSlopeDeg}°, красный: выше. Порог взят из правил планирования, это не норматив NASA (ТЗ EVA 9.3). ` +
      'Разные модели рельефа дают разный уклон, и допуск сравним с порогом.',
    `Slope in degrees from the scene terrain model (${s.dataLevel}). Green: up to 15°, yellow: up to the ` +
      `${s.maxSlopeDeg}° limit, red: above. The limit comes from planning rules, it is not a NASA standard (EVA spec 9.3). ` +
      'Different terrain models give different slopes, and the error is comparable to the limit.',
  );

  return (
    <div className="hud walk-hud" aria-live="off">
      <div className="hud-visor" />

      {/* Компас */}
      <section className="hud-tc">
        <Compass headingDeg={s.headingDeg} baseBearingDeg={s.baseBearingDeg} baseDistanceM={s.baseDistanceM} />
      </section>

      <div className="hud-stack">
      {/* Положение */}
      <section className="hud-panel hud-tl">
        <Row
          value={`${fmtLat(s.lat)} ${fmtLon(s.lonEast)}`}
          prov="data"
          tip={tt(
            'Planetocentric широта и восточная долгота 0–360°, 4 знака ≈ 6 м. Положение в локальной сцене, привязанной к DTM.',
            'Planetocentric latitude and east longitude 0–360°, 4 decimals ≈ 6 m. Position in the local scene tied to the DTM.',
          )}
        />
        <Row
          label={tt('Высота', 'Elevation')}
          value={`${fmtNum(Math.round(s.heightM), 0)} ${tt('м', 'm')}`}
          prov="data"
          tip={tt(
            `Высота поверхности под ногами из DTM, м относительно ареоида. Продукт: ${s.dataLevel}.`,
            `Surface elevation underfoot from the DTM, m relative to the areoid. Product: ${s.dataLevel}.`,
          )}
        />
        <Row
          label={tt('Регион', 'Region')}
          value={regionLine(ext.region)}
          prov={ext.region?.specific ? 'data' : 'nodata'}
          tip={regionTip(ext.region)}
        />
        {full && (
          <>
            <Row label={tt('Курс', 'Heading')} value={`${Math.round(((s.headingDeg % 360) + 360) % 360)}°`} prov="data" tip={tt('Направление взгляда, градусы от севера по часовой.', 'View direction, degrees clockwise from north.')} />
            <Row label={tt('Пройдено', 'Walked')} value={formatDistance(s.walkedM)} prov="data" tip={tt('Длина фактического пути от старта, м, по точкам сцены.', 'Length of the actual path from the start, m, from scene points.')} />
            <Row
              label={tt('Данные', 'Data')}
              value={s.groundDetail ? `${s.dataLevel} + ${tt('худ. детализация', 'artistic detail')}` : s.dataLevel}
              prov="data"
              tip={tt(
                `Уровень данных рельефа под ногами. Где подробного DTM нет, рельеф грубее и детали не выдумываются.${s.groundDetail ? ' «Худ. детализация» — процедурная фактура грунта у ног для наглядности, не данные; выключается в «Настройках».' : ''}`,
                `Terrain data level underfoot. Where there is no detailed DTM, the terrain is coarser and no details are invented.${s.groundDetail ? ' "Artistic detail" is a procedural ground texture near your feet for clarity, not data; turn it off in Settings.' : ''}`,
              )}
            />
          </>
        )}
      </section>

      {/* Время */}
      <section className="hud-panel hud-tr">
        <Row label={<>LMST {scale}</>} value={formatHours(lmst, full)} prov="model" tip={tt(`Местное среднее солнечное время на долготе игрока. ${marsTimeTip}`, `Local mean solar time at the player's longitude. ${marsTimeTip}`)} />
        <Row
          label="LTST"
          value={formatHours(ltst, full)}
          prov="model"
          tip={tt(
            `Местное истинное солнечное время = LMST + уравнение времени (${fmtNum(t.eotDeg / 15 * 60, 1)} мин). ${marsTimeTip}`,
            `Local true solar time = LMST + equation of time (${fmtNum(t.eotDeg / 15 * 60, 1)} min). ${marsTimeTip}`,
          )}
        />
        {full && (
          <>
            <Row
              label="MSD"
              value={`${fmtNum(t.msd, 3)} · Ls ${fmtNum(t.lsDeg, 1)}°`}
              prov="model"
              tip={tt(
                `Mars Sol Date: сквозной счёт солов. Ls: солнечная долгота Марса, по ней определяют сезон. ${marsTimeTip}`,
                `Mars Sol Date: continuous sol count. Ls: Mars solar longitude, which defines the season. ${marsTimeTip}`,
              )}
            />
            {mission && (
              <Row
                label={mission.title}
                value={`sol ${missionSol(mission, s.simTimeMs)}`}
                prov="model"
                tip={tt(
                  `Сол миссии: сол посадки считается sol 0, отсчёт по LMST на ${mission.clockLonEastDeg}° в. д. (часы миссии). Источник соглашения: NASA, Mars24.`,
                  `Mission sol: the landing sol is sol 0, counted by LMST at ${mission.clockLonEastDeg}° E (mission clock). Convention source: NASA, Mars24.`,
                )}
              />
            )}
          </>
        )}
        <Row label="UTC" value={fmtUtc(s.simTimeMs)} prov="data" tip={tt('Земное время UTC по модельным часам выхода (при ускорении идёт быстрее реального).', 'Earth UTC time from the EVA model clock (runs faster than real time when sped up).')} />
        {full && (
          <>
            <Row label={tt('У вас', 'Your time')} value={fmtViewer(s.simTimeMs)} prov="data" tip={tt('То же модельное время в часовом поясе вашего браузера.', 'The same model time in your browser time zone.')} />
            <Row
              label={tt('Связь с Землёй', 'Earth link')}
              value={light ? formatLightTime(light.oneWayS) : tt('нет данных', 'no data')}
              prov={light ? 'model' : 'nodata'}
              tip={
                light
                  ? tt(
                      `Время света в одну сторону, расстояние ${fmtNum(light.distanceAu, 3)} а.е. Интерполяция по таблице ${light.source} (создана ${light.generatedUtc}). Без задержек ретрансляции.`,
                      `One-way light time, distance ${fmtNum(light.distanceAu, 3)} AU. Interpolated from the ${light.source} table (generated ${light.generatedUtc}). Relay delays not included.`,
                    )
                  : tt(
                      'Таблицы расстояний JPL Horizons нет, или момент вне её диапазона, поэтому число не показано.',
                      'The JPL Horizons distance table is missing or the moment is outside its range, so no number is shown.',
                    )
              }
            />
            <Row
              label={tt('Солнце', 'Sun')}
              value={`${fmtNum(sun.elevationDeg, 0)}°, ${tt('аз.', 'az.')} ${Math.round(sun.azimuthDeg)}°`}
              prov="model"
              tip={tt(
                'Высота центра Солнца над ровным горизонтом и азимут от севера, Mars24 (D-5, D-6). Рельеф и сумерки не учтены.',
                'Elevation of the Sun centre above a flat horizon and azimuth from north, Mars24 (D-5, D-6). Terrain and twilight not included.',
              )}
            />
            <Row
              label={sun.elevationDeg > 0 ? tt('Закат через', 'Sunset in') : tt('Восход через', 'Sunrise in')}
              value={
                sun.elevationDeg > 0
                  ? toSunset !== null ? formatDuration(toSunset) : tt('нет в ближайший сол', 'not within the next sol')
                  : toSunrise !== null ? formatDuration(toSunrise) : tt('нет в ближайший сол', 'not within the next sol')
              }
              prov="model"
              tip={tt(
                'Земные часы и минуты до пересечения центром Солнца ровного горизонта, по модельному времени. Холмы и стенки кратера закрывают Солнце раньше.',
                'Earth hours and minutes until the Sun centre crosses a flat horizon, in model time. Hills and crater walls hide the Sun earlier.',
              )}
            />
          </>
        )}
      </section>

      {/* Безопасность и радиация */}
      <section className="hud-panel hud-bl">
        {dark && (
          <div className="hud-alert">
            {sun.elevationDeg < 0
              ? tt('Темно: Солнце под горизонтом', 'Dark: the Sun is below the horizon')
              : tt(
                  `До заката ${formatDuration(toSunset ?? 0)}, это меньше времени возврата`,
                  `Sunset in ${formatDuration(toSunset ?? 0)}, less than the return time`,
                )}
          </div>
        )}
        {budget.pastNoReturn && <div className="hud-alert hud-alert--danger">{tt('Точка невозврата: пора на базу', 'Point of no return: head back to base')}</div>}
        <Row
          label={tt('Уклон', 'Slope')}
          value={
            <>
              <span className={`hud-tone--${hereTone}`}>{tt('под ногами', 'underfoot')} {Math.round(Math.abs(s.slopeHereDeg))}°</span>
              {' · '}
              {Number.isFinite(s.slopeAheadDeg) ? (
                <span className={`hud-tone--${aheadTone}`}>
                  {tt('впереди', 'ahead')} {s.slopeAheadDeg >= 0 ? '▲' : '▼'} {Math.round(Math.abs(s.slopeAheadDeg))}°
                </span>
              ) : (
                <span>{tt('впереди: нет данных', 'ahead: no data')}</span>
              )}
            </>
          }
          prov="data"
          tip={slopeTip}
        />
        {rover && (
          <div className="hud-note">
            {tt(
              'Вы в ровере: показатели скафандра (ресурс, запас, доза за выход) нужны при выходе пешком.',
              'You are in the rover: spacesuit readings (consumables, reserve, EVA dose) apply when you go on foot.',
            )}
          </div>
        )}
        {!rover && <Row
          label={tt('Возврат', 'Return')}
          value={`${formatDuration(budget.backS)} · ${formatDistance(s.baseDistanceM)}`}
          prov="model"
          tip={tt(
            'Время пути на базу по прямой со скоростью по ровному 0,75 м/с: V = −0,01·θ + 0,75 м/с, калибровка по выходам Apollo (ТЗ EVA 9.1). Обходы и уклоны не учтены, поэтому реальное время больше.',
            'Time back to base in a straight line at 0.75 m/s on level ground: V = −0.01·θ + 0.75 m/s, calibrated on Apollo EVAs (EVA spec 9.1). Detours and slopes are not included, so the real time is longer.',
          )}
        />}
        {full && !rover && (
          <>
            <Row
              label={tt('Ресурс', 'Consumables')}
              value={tt(
                `осталось ${formatDuration(Math.max(0, budget.leftS))} из ${formatDuration(DEFAULT_EVA_BUDGET.designS)}`,
                `${formatDuration(Math.max(0, budget.leftS))} left of ${formatDuration(DEFAULT_EVA_BUDGET.designS)}`,
              )}
              prov="model"
              tip={tt(
                'Расходники по проектному выходу 8 ч при средней мощности 350 Вт (ТЗ EVA 9.2). Расход у людей плохо предсказуем: у Apollo факт расходился с прогнозом в обе стороны. Чаще всего первой кончается вода на охлаждение.',
                'Consumables for a design EVA of 8 h at an average 350 W (EVA spec 9.2). Human usage is hard to predict: on Apollo the actual use differed from the forecast both ways. Cooling water usually runs out first.',
              )}
            />
            <Row
              label={tt('Запас', 'Reserve')}
              value={budget.pastNoReturn ? tt('нет, возвращайтесь сейчас', 'none, return now') : tt(`можно отойти ещё ${formatDistance(budget.extraOutM)}`, `can go ${formatDistance(budget.extraOutM)} farther`)}
              prov="model"
              tone={budget.pastNoReturn ? 'danger' : budget.slackS < 1800 ? 'warn' : undefined}
              tip={tt(
                'Остаток минус время возврата минус резерв 30 мин. Правило: возврат должен быть возможен при любом одиночном отказе (ТЗ EVA 9.2).',
                'Remaining time minus return time minus a 30 min reserve. Rule: return must stay possible after any single failure (EVA spec 9.2).',
              )}
            />
          </>
        )}
        {full && <RadiationRows state={s} rad={ext.rad} rover={rover} />}
        {full && <SpaceWeatherRow sw={ext.spaceWeather} />}
      </section>
      </div>

      {/* Ближайшая точка трека */}
      {full && (
        <section className="hud-panel hud-bc">
          {s.nearestTrackPoint ? (
            <Row
              label={tt('Рядом', 'Nearby')}
              value={`${s.nearestTrackPoint.mission}, sol ${s.nearestTrackPoint.sol}, ${formatDistance(s.nearestTrackPoint.distanceM)}`}
              prov="data"
              tip={tt(
                'Ближайшая точка пути ровера по файлу локализаций NASA MMGIS. Поле sol показывает сол заезда.',
                'Nearest point of the rover path from the NASA MMGIS localization file. The sol field is the sol of that drive.',
              )}
            />
          ) : (
            <Row label={tt('Трек ровера', 'Rover track')} value={tt('рядом нет', 'none nearby')} prov="nodata" tip={tt('В этой сцене нет маршрута ровера.', 'There is no rover route in this scene.')} />
          )}
        </section>
      )}

      {toggle}
    </div>
  );
}

function RadiationRows({ state: s, rad, rover = false }: { state: WalkState; rad: RadSummary | null | undefined; rover?: boolean }) {
  const galeKm = distanceToGaleKm(s.lat, s.lonEast);
  const inGale = galeKm <= GALE.radiusKm;
  const dose = evaDose(s.evaSeconds);
  const r = DOSE_RATE_MSV_DAY;
  const doseDigits = dose.typicalMSv < 0.1 ? 3 : 2;
  const tt = useT();

  let measured;
  if (rad === undefined) {
    measured = <Row label={tt('Радиация', 'Radiation')} value={tt('загрузка…', 'loading…')} prov="nodata" tip={tt('Запрос архива RAD к серверу.', 'Requesting the RAD archive from the server.')} />;
  } else if (!inGale) {
    measured = (
      <Row
        label={tt('Радиация', 'Radiation')}
        value={tt(
          `местных измерений нет; ближайшие: RAD, кратер Гейл, ${Math.round(galeKm)} км`,
          `no local measurements; nearest: RAD, Gale crater, ${Math.round(galeKm)} km`,
        )}
        prov="nodata"
        tip={tt(
          'На поверхности дозу измеряли только приборы на роверах. Для этой точки измерений нет. Расстояние до кратера Гейл указано по дуге.',
          'On the surface, dose has only been measured by rover instruments. There are no measurements for this point. Distance to Gale crater is along the great circle.',
        )}
      />
    );
  } else if (rad === null) {
    measured = (
      <Row
        label={tt('Радиация', 'Radiation')}
        value={tt('нет данных', 'no data')}
        prov="nodata"
        tip={tt('Архив RAD недоступен (сервер не ответил или набор не установлен).', 'The RAD archive is unavailable (no server response or the dataset is not installed).')}
      />
    );
  } else {
    measured = (
      <Row
        label={tt('RAD, Гейл', 'RAD, Gale')}
        value={`${fmtNum(rad.rateMicroGyH, 1)} ${tt('мкГр/ч', 'µGy/h')}${rad.sol !== null ? ` · sol ${rad.sol}` : ''}`}
        prov="archive"
        date={dateOnly(rad.startUtc)}
        tip={
          tt(
            `Curiosity RAD, канал B: средняя мощность поглощённой дозы по ${rad.observations} замерам, ` +
              `${rad.startUtc} — ${rad.endUtc}. Файл: ${rad.sourceFile}. Это архив, не текущие условия. `,
            `Curiosity RAD, channel B: mean absorbed dose rate over ${rad.observations} readings, ` +
              `${rad.startUtc} — ${rad.endUtc}. File: ${rad.sourceFile}. This is archive data, not current conditions. `,
          ) + rad.limitations.join(' ')
        }
      />
    );
  }

  return (
    <>
      {measured}
      <Row
        label={tt('Экв. доза', 'Eq. dose')}
        value={`${fmtNum(r.typical, 2)} ± ${fmtNum(r.sigma, 2)} ${tt('мЗв/сут', 'mSv/day')}`}
        prov="model"
        tip={tt(
          `Типичная эквивалентная доза на поверхности по RAD; по солнечному циклу ${fmtNum(r.min, 2)}–${fmtNum(r.max, 2)} мЗв/сут ` +
            '(ТЗ EVA 9.4). Коэффициент качества ~3 (3,05 ± 0,3; по уточнению 2019 года 2,1–2,7). Сутки земные. Высота и рельеф не учтены.',
          `Typical surface dose equivalent from RAD; over the solar cycle ${fmtNum(r.min, 2)}–${fmtNum(r.max, 2)} mSv/day ` +
            '(EVA spec 9.4). Quality factor ~3 (3.05 ± 0.3; 2.1–2.7 per the 2019 revision). Earth days. Elevation and terrain not included.',
        )}
      />
      {!rover && <Row
        label={tt('Доза за выход', 'EVA dose')}
        value={`≈ ${fmtNum(dose.typicalMSv, doseDigits)} ${tt('мЗв', 'mSv')} (${fmtNum(dose.lowMSv, doseDigits)}–${fmtNum(dose.highMSv, doseDigits)})`}
        prov="model"
        tip={tt(
          `Мощность × время выхода (${formatDuration(s.evaSeconds)} по модельным часам). По солнечному циклу: ${fmtNum(dose.cycleMinMSv, doseDigits)}–${fmtNum(dose.cycleMaxMSv, doseDigits)} мЗв.`,
          `Rate × EVA time (${formatDuration(s.evaSeconds)} on the model clock). Over the solar cycle: ${fmtNum(dose.cycleMinMSv, doseDigits)}–${fmtNum(dose.cycleMaxMSv, doseDigits)} mSv.`,
        )}
      />}
    </>
  );
}

function SpaceWeatherRow({ sw }: { sw: SpaceWeather | null | undefined }) {
  const tt = useT();
  const note = tt('DONKI описывает обстановку у Земли. Время прихода к Марсу оценочное.', 'DONKI describes conditions near Earth. Arrival time at Mars is an estimate.');
  if (sw === undefined) return null;
  const ev = latestRelevantEvent(sw);
  if (!sw || !ev) {
    return (
      <>
      <Row
        label={tt('Солнце (DONKI)', 'Sun (DONKI)')}
        value={sw ? tt('событий за 7 дней нет', 'no events in 7 days') : tt('нет данных', 'no data')}
        prov={sw ? 'data' : 'nodata'}
        tip={sw ? `${sw.source}, ${tt('запрос', 'fetched')} ${sw.fetched_utc}. ${sw.note || note}` : `${tt('Каталог NASA DONKI недоступен.', 'The NASA DONKI catalog is unavailable.')} ${note}`}
      />
      {sw && <div className="hud-note">{note}</div>}
      </>
    );
  }
  return (
    <>
      <Row
        label={tt('Солнце (DONKI)', 'Sun (DONKI)')}
        value={`${DONKI_TYPE_LABEL[ev.type] ? tt(...DONKI_TYPE_LABEL[ev.type]) : ev.type} ${fmtUtc(Date.parse(ev.start_utc)).slice(0, 16)} UTC`}
        prov="data"
        tone="warn"
        tip={`${ev.summary} ${ev.link} · ${sw.source}, ${tt('запрос', 'fetched')} ${sw.fetched_utc}. ${sw.note || note}`}
      />
      <div className="hud-note">{note}</div>
    </>
  );
}
