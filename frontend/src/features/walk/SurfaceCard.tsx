// Карточка «Точка на поверхности»: высота и уклон из сетки участка, единица геологической карты,
// тепловая инерция TES и что известно об участке по данным миссии. У каждой строки — статус и источник.

import { useEffect, useState } from 'react';
import { getLang, pick, useT } from '@/shared/i18n/lang';
import { formatEraAge, likelyRock, parseUnitEra, UNIT_NAMES_RU } from '@/shared/geology/units';
import type { RegionInfo } from '@/shared/regions/regionAt';
import { formatLatLon, interpretInertia } from './surfacePoint';
import { geologyAt, inertiaAt, siteGeology, type InertiaSample } from './surfaceData';
import { formatDistance, type SurfaceProbe } from './walkScene';
import './surfaceCard.css';

/** undefined — загрузка, null — нет данных. */
type Slot<T> = T | null | undefined;

function useAsync<T>(load: () => Promise<T | null>, deps: unknown[]): Slot<T> {
  const [value, setValue] = useState<Slot<T>>(undefined);
  useEffect(() => {
    let alive = true;
    setValue(undefined);
    load().then(
      (v) => alive && setValue(v),
      () => alive && setValue(null),
    );
    return () => {
      alive = false;
    };
  }, deps);
  return value;
}

function Tag({ kind }: { kind: 'data' | 'model' | 'interp' }) {
  const t = useT();
  const text = kind === 'data' ? t('данные', 'data') : kind === 'model' ? t('модель', 'model') : t('трактовка', 'interpretation');
  return <span className={`walk-probe-tag walk-probe-tag--${kind}`}>{text}</span>;
}

export function SurfaceCard({ probe, compact, onClose }: { probe: SurfaceProbe; compact: boolean; onClose(): void }) {
  const t = useT();
  const lang = getLang();
  const key = [probe.lat, probe.lonEast];
  const geo = useAsync<RegionInfo>(() => geologyAt(probe.lonEast, probe.lat), key);
  const ti = useAsync<InertiaSample>(() => inertiaAt(probe.lonEast, probe.lat), key);
  const site = useAsync(() => siteGeology(probe.siteId), [probe.siteId]);

  const loading = <span className="walk-muted">{t('загрузка…', 'loading…')}</span>;
  const none = <span className="walk-muted">{t('нет данных', 'no data')}</span>;
  const fmt = (v: number, d = 0) => (lang === 'ru' ? v.toFixed(d).replace('.', ',') : v.toFixed(d));

  const unit = geo?.geology ?? null;
  const era = unit ? parseUnitEra(unit.unit) : null;
  const rock = unit ? likelyRock(unit.label) : null;
  const inertia = ti?.value ?? null;
  const inertiaText = interpretInertia(inertia);
  // Точка в нижней половине экрана — карточка сверху и заканчивается выше метки.
  const top = probe.screenY > 0.5;
  const from = probe.vehicle === 'rover' ? t('от ровера', 'from the rover') : t('от вас', 'from you');

  return (
    <div className={`walk-probe${compact ? ' walk-probe--compact' : ''}${top ? ' walk-probe--top' : ''}`}
      style={top ? { maxHeight: `min(520px, max(140px, calc(${(probe.screenY * 100).toFixed(1)}% - ${compact ? 30 : 160}px)))` } : undefined} role="dialog" aria-label={t('Точка на поверхности', 'Surface point')}>
      <div className="walk-probe-head">
        <strong>{t('Точка на поверхности', 'Surface point')}</strong>
        <button type="button" className="walk-probe-close" onClick={onClose} aria-label={t('Закрыть', 'Close')}>
          ✕
        </button>
      </div>

      <section>
        <div className="walk-probe-row">
          <span>{formatLatLon(probe.lat, probe.lonEast, lang)}</span>
          <Tag kind="data" />
        </div>
        <div className="walk-probe-row">
          <span>
            {Number.isFinite(probe.elevationM)
              ? t(`Высота ${fmt(probe.elevationM)} м`, `Elevation ${fmt(probe.elevationM)} m`)
              : t('Высота: нет данных', 'Elevation: no data')}
            {' · '}
            {Number.isFinite(probe.slopeDeg)
              ? t(`уклон ${fmt(probe.slopeDeg, 1)}° на базе ${fmt(probe.slopeBaseM)} м`, `slope ${fmt(probe.slopeDeg, 1)}° over ${fmt(probe.slopeBaseM)} m`)
              : t('уклон: нет данных', 'slope: no data')}
          </span>
        </div>
        <div className="walk-probe-row">
          <span>{`${formatDistance(probe.distanceM)} ${from}`}</span>
        </div>
        <p className="walk-probe-src">
          {probe.overview
            ? t('Рельеф MOLA ~7 км (обзорный режим), высота от ареоида', 'MOLA ~7 km terrain (overview mode), elevation above the areoid')
            : t('Высота от ареоида', 'Elevation above the areoid')}
          {`: ${probe.heightSource}`}
        </p>
      </section>

      <section>
        <h4>{t('Геологическая карта', 'Geologic map')}</h4>
        {geo === undefined ? (
          loading
        ) : !unit ? (
          none
        ) : (
          <>
            <div className="walk-probe-row">
              <span>
                <b>{unit.unit}</b> — {lang === 'ru' ? (UNIT_NAMES_RU[unit.unit] ?? unit.label) : unit.label}
              </span>
              <Tag kind="data" />
            </div>
            {era && (
              <div className="walk-probe-row">
                <span>
                  {t('Эпоха', 'Era')}: {lang === 'ru' ? era.ru : era.en}, {formatEraAge(era, lang)}
                </span>
              </div>
            )}
            {rock && (
              <div className="walk-probe-row">
                <span>
                  {t('Вероятные породы', 'Likely rocks')}: {lang === 'ru' ? rock.ru : rock.en}
                </span>
                <Tag kind="interp" />
              </div>
            )}
          </>
        )}
        {geo?.specific && (
          <div className="walk-probe-row">
            <span>
              {t('Область IAU', 'IAU feature')}: {geo.specific.name}
            </span>
          </div>
        )}
        <p className="walk-probe-src">
          {t(
            'USGS SIM 3292, Tanaka et al. (2014), масштаб 1:20 000 000: единица охватывает десятки километров, это не порода под ногами.',
            'USGS SIM 3292, Tanaka et al. (2014), scale 1:20,000,000: a unit spans tens of km; it is not the rock under your feet.',
          )}
        </p>
      </section>

      <section>
        <h4>{t('Грунт по тепловой инерции', 'Ground by thermal inertia')}</h4>
        {ti === undefined ? (
          loading
        ) : !ti || inertia === null ? (
          none
        ) : (
          <>
            <div className="walk-probe-row">
              <span>{t(`${fmt(inertia)} Дж·м⁻²·К⁻¹·с⁻½`, `${fmt(inertia)} J·m⁻²·K⁻¹·s⁻½`)}</span>
              <Tag kind="data" />
            </div>
            {inertiaText && (
              <div className="walk-probe-row">
                <span>{lang === 'ru' ? inertiaText.ru : inertiaText.en}</span>
                <Tag kind="interp" />
              </div>
            )}
          </>
        )}
        <p className="walk-probe-src">
          {t(
            'MGS TES, дневная тепловая инерция, Putzig et al. (2005); ячейка ~7 км. Пороги: < 150 — пыль, 150–400 — песок, > 400 — крупный грунт и породы.',
            'MGS TES daytime thermal inertia, Putzig et al. (2005); ~7 km cell. Thresholds: < 150 dust, 150–400 sand, > 400 coarse ground and rock.',
          )}
        </p>
      </section>

      {site && (
        <section>
          <h4>{t('Что известно об участке', 'What is known about the site')}</h4>
          <div className="walk-probe-row">
            <span>{pick(site.ru, site.en)}</span>
          </div>
        </section>
      )}
    </div>
  );
}
