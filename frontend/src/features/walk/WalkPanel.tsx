// Режим «От первого лица»: выбор участка или прогулка по пакету рельефа HiRISE.

import { useEffect, useRef, useState } from 'react';
import type { ModeContext, WalkState } from '@/app/modeContract';
import { Hud } from '@/features/hud/Hud';
import { SLOPE_THRESHOLDS } from './motion';
import { fetchManifest, fetchSiteIndex, loadSitePackage, type SiteIndexEntry, type SitePackage } from './sitePackage';
import { TIME_SCALES, WalkScene, type TeleportTarget, type WalkExtra } from './walkScene';

/** Подъём камеры перед переходом на шар. */
const ASCENT_MS = 1400;
import { TimeControls } from './TimeControls';
import { Joystick, TouchLook } from './TouchControls';
import './walk.css';

export default function WalkPanel(ctx: ModeContext) {
  const site = ctx.params.site;
  return (
    <div className="walk-root">
      {site ? <WalkSite key={site} site={site} ctx={ctx} /> : <SiteChooser ctx={ctx} />}
    </div>
  );
}

function useEscExit(exit: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exit, enabled]);
}

function SiteChooser({ ctx, notice }: { ctx: ModeContext; notice?: string }) {
  const [sites, setSites] = useState<(SiteIndexEntry & { note?: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEscExit(ctx.exit, true);

  useEffect(() => {
    let alive = true;
    fetchSiteIndex()
      .then(async (list) => {
        const withNotes = await Promise.all(
          list.map(async (s) => {
            try {
              return { ...s, note: (await fetchManifest(s.id)).note };
            } catch {
              return s;
            }
          }),
        );
        if (alive) setSites(withNotes);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="walk-chooser">
      <div className="walk-chooser-head">
        <h2>От первого лица</h2>
        <button type="button" className="walk-btn" onClick={ctx.exit}>На глобус</button>
      </div>
      <p className="walk-muted">
        Ходить можно только там, где есть подробная модель рельефа HiRISE (сетка 1–2 м). Выберите участок.
      </p>
      {notice && <p className="walk-notice">{notice}</p>}
      {error && <p className="walk-notice">{error}</p>}
      {!sites && !error && <p className="walk-muted">Загрузка списка…</p>}
      <div className="walk-cards">
        {sites?.map((s) => (
          <button key={s.id} type="button" className="walk-card" onClick={() => ctx.openMode('walk', { site: s.id })}>
            <strong>{s.title}</strong>
            {s.note && <span>{s.note}</span>}
            <small>
              {Math.abs(s.center.lat).toFixed(4)}° {s.center.lat >= 0 ? 'с. ш.' : 'ю. ш.'}, {s.center.lon_east.toFixed(4)}° в. д.
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}

function WalkSite({ site, ctx }: { site: string; ctx: ModeContext }) {
  const [pkg, setPkg] = useState<SitePackage | null>(null);
  const [status, setStatus] = useState<'loading' | 'missing' | 'error' | 'ready'>('loading');
  const [error, setError] = useState('');
  useEscExit(ctx.exit, status === 'loading' || status === 'error');

  useEffect(() => {
    const ac = new AbortController();
    let loaded: SitePackage | null = null;
    setStatus('loading');
    (async () => {
      try {
        const index = await fetchSiteIndex();
        if (!index.some((s) => s.id === site)) {
          setStatus('missing');
          return;
        }
        loaded = await loadSitePackage(site, ac.signal);
        if (ac.signal.aborted) {
          loaded.ortho.close();
          return;
        }
        setPkg(loaded);
        setStatus('ready');
      } catch (e) {
        if (ac.signal.aborted) return;
        setError((e as Error).message);
        setStatus('error');
      }
    })();
    return () => {
      ac.abort();
      loaded?.ortho.close();
    };
  }, [site]);

  if (status === 'missing') {
    return <SiteChooser ctx={ctx} notice="Подробного рельефа здесь нет, доступен только обзорный режим. Выберите участок с DTM HiRISE." />;
  }
  if (status === 'error') {
    return (
      <div className="walk-center">
        <p>Не удалось загрузить участок: {error}</p>
        <button type="button" className="walk-btn" onClick={ctx.exit}>На глобус</button>
      </div>
    );
  }
  if (status === 'loading' || !pkg) {
    return (
      <div className="walk-center">
        <p>Загрузка рельефа HiRISE…</p>
        <button type="button" className="walk-btn" onClick={ctx.exit}>На глобус</button>
      </div>
    );
  }
  return <WalkView pkg={pkg} ctx={ctx} />;
}

function WalkView({ pkg, ctx }: { pkg: SitePackage; ctx: ModeContext }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<WalkScene | null>(null);
  const [state, setState] = useState<WalkState | null>(null);
  const [extra, setExtra] = useState<WalkExtra | null>(null);
  const [teleports, setTeleports] = useState<TeleportTarget[]>([]);
  const [menu, setMenu] = useState<'none' | 'settings' | 'teleport'>('none');
  const [shadows, setShadows] = useState(true);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [touch] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false);
  // «На глобус»: камера поднимается и смотрит вниз, затем шар отлетает от этой же точки.
  const leaving = useRef(false);
  const leave = () => {
    const s = sceneRef.current;
    if (!s) return ctx.exit();
    if (leaving.current) return;
    leaving.current = true;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    void s.ascend(reduce ? 0 : ASCENT_MS).then(() => ctx.exitFrom(s.exitOrigin()));
  };
  const exitRef = useRef(leave);
  exitRef.current = leave;

  useEffect(() => {
    const host = hostRef.current;
    const labels = labelsRef.current;
    if (!host || !labels) return;
    let scene: WalkScene;
    try {
      scene = new WalkScene({
        container: host,
        labels,
        minimap: minimapRef.current,
        pkg,
        touch,
        onState: (s, x) => {
          setState(s);
          setExtra(x);
        },
        onExit: () => exitRef.current(),
      });
    } catch (e) {
      setWebglError((e as Error).message);
      return;
    }
    sceneRef.current = scene;
    setTeleports([...scene.teleports]);
    setShadows(scene.shadows);
    return () => {
      sceneRef.current = null;
      scene.dispose();
    };
  }, [pkg, touch]);

  const s = sceneRef.current;
  const credit = pkg.manifest.sources?.find((x) => x.role === 'dtm');

  if (webglError) {
    return (
      <div className="walk-center">
        <p>WebGL недоступен: {webglError}</p>
        <button type="button" className="walk-btn" onClick={leave}>На глобус</button>
      </div>
    );
  }

  return (
    <>
      <div ref={hostRef} className="walk-host" />
      <div ref={labelsRef} className="walk-labels" />
      {touch && <TouchLook onLook={(dx, dy) => sceneRef.current?.lookBy(dx, dy)} />}
      {touch && <Joystick onMove={(x, y) => sceneRef.current?.setJoystick(x, y)} />}
      {state && <Hud state={state} />}
      <TimeControls scene={sceneRef.current} solar={extra?.solar ?? null} />

      <div className="walk-topbar">
        <button type="button" className="walk-btn" onClick={leave}>На глобус</button>
        <button type="button" className={`walk-btn ${menu === 'teleport' ? 'is-on' : ''}`} onClick={() => setMenu(menu === 'teleport' ? 'none' : 'teleport')}>
          Перейти к точке
        </button>
        <button type="button" className={`walk-btn ${menu === 'settings' ? 'is-on' : ''}`} onClick={() => setMenu(menu === 'settings' ? 'none' : 'settings')}>
          Настройки
        </button>
        <div className="walk-timescale" role="group" aria-label="Ускорение времени">
          {TIME_SCALES.map((k, i) => (
            <button key={k} type="button" title={`Клавиша ${i + 1}`} className={`walk-btn ${state?.timeScale === k ? 'is-on' : ''}`} onClick={() => s?.setTimeScale(k)}>
              ×{k}
            </button>
          ))}
        </div>
      </div>

      {menu === 'teleport' && (
        <div className="walk-menu">
          {teleports.map((t) => (
            <button key={t.id} type="button" className="walk-menu-item" onClick={() => { s?.teleport(t.x, t.z); setMenu('none'); }}>
              {t.label}
            </button>
          ))}
          <p className="walk-muted">Или щёлкните по мини-карте.</p>
        </div>
      )}

      {menu === 'settings' && (
        <div className="walk-menu">
          <div className="walk-menu-row">
            <span>Порог уклона</span>
            {SLOPE_THRESHOLDS.map((d) => (
              <button key={d} type="button" className={`walk-btn ${state?.maxSlopeDeg === d ? 'is-on' : ''}`} onClick={() => s?.setMaxSlope(d)}>
                {d}°
              </button>
            ))}
          </div>
          <p className="walk-muted">
            20°: эксплуатационное правило инструмента планирования NASA. 15°: консервативный порог из планов миссий. 25°: ориентир «доступно пешком». Числового требования NASA нет.
          </p>
          <label className="walk-menu-row">
            <input type="checkbox" checked={shadows} onChange={(e) => { s?.setShadows(e.target.checked); setShadows(e.target.checked); }} />
            <span>Тени от рельефа</span>
          </label>
          <p className="walk-muted">
            Скорость ходьбы задаёт симуляция: V = −0,01·θ + 0,75 м/с по модели выходов Apollo, но не меньше 0,1 м/с.
            {extra ? ` Сейчас ${extra.speedMs.toFixed(2).replace(".", ",")} м/с.` : ''}
          </p>
          <p className="walk-muted">Кадров в секунду: {extra ? Math.round(extra.fps) : '—'}</p>
        </div>
      )}

      <div className="walk-minimap">
        <canvas ref={minimapRef} title="Щёлкните, чтобы перейти в точку" />
        <div className="walk-minimap-credit">
          {credit ? `${credit.product} · ${credit.credit ?? ''}` : ''}
          {pkg.manifest.backdrop ? ` · ${pkg.manifest.backdrop.label}` : ''}
        </div>
      </div>

      {extra?.blocked && (
        <div className="walk-blocked">
          {extra.blocked === 'nodata'
            ? 'Дальше нет данных рельефа, шагнуть нельзя'
            : `Слишком круто: ${Math.round(extra.blockedSlopeDeg)}° при пороге ${state?.maxSlopeDeg ?? ''}°`}
        </div>
      )}

      {!touch && extra && !extra.locked && menu === 'none' && (
        <div className="walk-hint" onClick={() => s?.lock()}>
          <strong>Щёлкните, чтобы идти</strong>
          <span>WASD или стрелки — шаг, мышь — взгляд, 1/2/3 — время ×1/×10/×60, Esc — отпустить мышь, Esc ещё раз — на глобус</span>
        </div>
      )}
    </>
  );
}
