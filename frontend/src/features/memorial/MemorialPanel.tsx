// Боковая панель режима «Памятные места»: список миссий, памятная карточка, свеча и музыка.
import { useEffect, useRef, useState } from 'react';

import type { ModeContext } from '@/app/modeContract';

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
  const ns = m.lat >= 0 ? 'с. ш.' : 'ю. ш.';
  return `${Math.abs(m.lat).toFixed(2)}° ${ns}, ${m.lon.toFixed(2)}° в. д.`;
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
  }, [data, globe]);

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
    <aside className="mm-panel" aria-label="Памятные места">
      <div className="mm-head-actions">
        <button type="button" className={`mm-music${music ? ' is-on' : ''}`} onClick={toggleMusic} aria-pressed={music}>
          {music ? '♪ Музыка: вкл' : '♪ Музыка'}
        </button>
      </div>

      <p className="mm-dim">
        Аппараты, которые закончили работу на поверхности Марса. Они остаются там, где замолчали.
      </p>

      {error && <p className="mm-warn">Список не загрузился: {error}</p>}
      {!data && !error && <p className="mm-dim">Загружаю…</p>}

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
                  {candles.has(m.id) && <span className="mm-dot" aria-label="свеча горит" />}
                  {m.name}
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
            <h3>{mission.name}</h3>
            <p className="mm-years">
              {formatDate(mission.landed)}
              <br />—<br />
              {formatDate(mission.last_contact)}
            </p>
            <p className="mm-legacy">{mission.legacy}</p>
          </div>

          <dl className="mm-facts">
            <dt>Тип</dt>
            <dd>{mission.kind}</dd>
            <dt>Место</dt>
            <dd>
              {mission.place}, {coords(mission)}
            </dd>
            <dt>Работал</dt>
            <dd>{daysBetween(mission.landed, mission.last_contact).toLocaleString('ru-RU')} земных дней</dd>
            {mission.mission_end && (
              <>
                <dt>Миссия завершена</dt>
                <dd>{formatDate(mission.mission_end)}</dd>
              </>
            )}
            {mission.flights !== undefined && (
              <>
                <dt>Полётов</dt>
                <dd>{mission.flights}</dd>
              </>
            )}
            {mission.distance_km !== undefined && (
              <>
                <dt>{mission.flights !== undefined ? 'Пролетел' : 'Проехал'}</dt>
                <dd>около {mission.distance_km.toLocaleString('ru-RU')} км</dd>
              </>
            )}
          </dl>
          {mission.note && <p className="mm-dim">{mission.note}</p>}
          {mission.quote_note && <p className="mm-dim">{mission.quote_note}</p>}

          <button type="button" className="mm-candle-btn" onClick={() => toggleCandle(mission.id)}>
            <Candle lit={candles.has(mission.id)} />
            {candles.has(mission.id) ? 'Свеча горит' : 'Зажечь свечу'}
          </button>

          <p className="mm-sources">
            Источники:{' '}
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
        Свечи видны только вам и хранятся в этом браузере. Музыка написана для проекта и
        синтезируется в браузере.
      </footer>
    </aside>
  );
}
