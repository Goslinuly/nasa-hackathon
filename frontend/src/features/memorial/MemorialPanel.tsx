// Боковая панель режима «Памятные места»: список миссий, памятная карточка, свеча и музыка.
import { useEffect, useRef, useState } from 'react';

import type { ModeContext } from '@/app/modeContract';
import { locale, pick, tr, useLang, useT } from '@/shared/i18n/lang';

import { startAmbient, type AmbientPlayer } from './ambient';
import {
  browserStorage,
  daysBetween,
  formatDate,
  loadMissions,
  missionMarkers,
  readCandles,
  writeCandles,
  type Mission,
  type MissionsFile,
} from './data';
import './memorial.css';

const MARKERS = 'memorial-sites';

function coords(m: Mission): string {
  const ns = m.lat >= 0 ? tr('с. ш.', 'N') : tr('ю. ш.', 'S');
  return `${Math.abs(m.lat).toFixed(2)}° ${ns}, ${m.lon.toFixed(2)}° ${tr('в. д.', 'E')}`;
}

function hostName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Candle({ lit }: { lit: boolean }) {
  return (
    <svg className={`mm-candle${lit ? ' is-lit' : ''}`} viewBox="0 0 24 48" aria-hidden="true">
      <ellipse className="mm-glow" cx="12" cy="10" rx="10" ry="12" />
      <path className="mm-flame" d="M12 3c3 4 4 7 4 9a4 4 0 0 1-8 0c0-2 1-5 4-9z" />
      <line x1="12" y1="15" x2="12" y2="19" stroke="#3a3127" strokeWidth="1.2" />
      <rect x="7" y="19" width="10" height="26" rx="2" fill="#efe6d4" />
    </svg>
  );
}

export default function MemorialPanel({ globe }: ModeContext) {
  const [data, setData] = useState<MissionsFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [candles, setCandles] = useState<Set<string>>(() => readCandles(browserStorage()));
  const [music, setMusic] = useState(false);
  const player = useRef<AmbientPlayer | null>(null);
  const t = useT();
  const lang = useLang();

  useEffect(() => {
    const controller = new AbortController();
    loadMissions(controller.signal)
      .then(setData)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!data) return;
    globe.setMarkers(MARKERS, missionMarkers(data.missions), id => setSelected(id));
    return () => globe.setMarkers(MARKERS, null);
  }, [data, globe, lang]);

  // Музыка гаснет, когда режим закрывают.
  useEffect(() => () => player.current?.stop(), []);

  const mission = data?.missions.find(m => m.id === selected) ?? null;

  useEffect(() => {
    if (!mission) return;
    globe.flyTo({ lon: mission.lon, lat: mission.lat, altitude: 0.08 }).catch(() => undefined);
  }, [mission, globe]);

  const toggleMusic = () => {
    if (player.current) {
      player.current.stop();
      player.current = null;
      setMusic(false);
      return;
    }
    try {
      player.current = startAmbient();
      setMusic(true);
    } catch {
      setMusic(false);
    }
  };

  const toggleCandle = (id: string) => {
    setCandles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeCandles(browserStorage(), next);
      return next;
    });
  };

  return (
    <aside className="mm-panel" aria-label={t('Памятные места', 'Memorial')}>
      <div className="mm-head-actions">
        <button type="button" className={`mm-music${music ? ' is-on' : ''}`} onClick={toggleMusic} aria-pressed={music}>
          {music ? t('♪ Музыка: вкл', '♪ Music: on') : t('♪ Музыка', '♪ Music')}
        </button>
      </div>

      <p className="mm-dim">
        {t(
          'Аппараты, которые закончили работу на поверхности Марса. Они остаются там, где замолчали.',
          'Spacecraft that finished their work on the surface of Mars. They remain where they fell silent.',
        )}
      </p>

      {error && <p className="mm-warn">{t('Список не загрузился', 'The list failed to load')}: {error}</p>}
      {!data && !error && <p className="mm-dim">{t('Загружаю…', 'Loading…')}</p>}

      {data && (
        <ul className="mm-list">
          {data.missions.map(m => (
            <li key={m.id}>
              <button
                type="button"
                className={`mm-item${m.id === selected ? ' is-active' : ''}`}
                onClick={() => setSelected(m.id)}
              >
                <span className="mm-item-name">
                  {candles.has(m.id) && <span className="mm-dot" aria-label={t('свеча горит', 'candle lit')} />}
                  {pick(m.name, m.name_en)}
                </span>
                <span className="mm-item-years">
                  {m.landed.slice(0, 4)}–{m.last_contact.slice(0, 4)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {mission && (
        <article className="mm-stone">
          <div className="mm-stone-face">
            <p className="mm-agency">{mission.agency}</p>
            <h3>{pick(mission.name, mission.name_en)}</h3>
            <p className="mm-years">
              {formatDate(mission.landed)}
              <br />—<br />
              {formatDate(mission.last_contact)}
            </p>
            <p className="mm-legacy">{pick(mission.legacy, mission.legacy_en)}</p>
          </div>

          <dl className="mm-facts">
            <dt>{t('Тип', 'Type')}</dt>
            <dd>{pick(mission.kind, mission.kind_en)}</dd>
            <dt>{t('Место', 'Place')}</dt>
            <dd>
              {pick(mission.place, mission.place_en)}, {coords(mission)}
            </dd>
            <dt>{t('Работал', 'Worked')}</dt>
            <dd>
              {daysBetween(mission.landed, mission.last_contact).toLocaleString(locale())} {t('земных дней', 'Earth days')}
            </dd>
            {mission.mission_end && (
              <>
                <dt>{t('Миссия завершена', 'Mission ended')}</dt>
                <dd>{formatDate(mission.mission_end)}</dd>
              </>
            )}
            {mission.flights !== undefined && (
              <>
                <dt>{t('Полётов', 'Flights')}</dt>
                <dd>{mission.flights}</dd>
              </>
            )}
            {mission.distance_km !== undefined && (
              <>
                <dt>{mission.flights !== undefined ? t('Пролетел', 'Flown') : t('Проехал', 'Driven')}</dt>
                <dd>{t('около', 'about')} {mission.distance_km.toLocaleString(locale())} {t('км', 'km')}</dd>
              </>
            )}
          </dl>
          {mission.note && <p className="mm-dim">{pick(mission.note, mission.note_en)}</p>}
          {mission.quote_note && <p className="mm-dim">{pick(mission.quote_note, mission.quote_note_en)}</p>}

          <button type="button" className="mm-candle-btn" onClick={() => toggleCandle(mission.id)}>
            <Candle lit={candles.has(mission.id)} />
            {candles.has(mission.id) ? t('Свеча горит', 'Candle lit') : t('Зажечь свечу', 'Light a candle')}
          </button>

          <p className="mm-sources">
            {t('Источники', 'Sources')}:{' '}
            {mission.sources.map((url, i) => (
              <span key={url}>
                {i > 0 && ', '}
                <a href={url} target="_blank" rel="noreferrer">{hostName(url)}</a>
              </span>
            ))}
          </p>
        </article>
      )}

      <footer className="mm-dim mm-foot">
        {t(
          'Свечи видны только вам и хранятся в этом браузере. Музыка написана для проекта и синтезируется в браузере.',
          'Candles are visible only to you and are stored in this browser. The music was written for the project and is synthesized in the browser.',
        )}
      </footer>
    </aside>
  );
}
