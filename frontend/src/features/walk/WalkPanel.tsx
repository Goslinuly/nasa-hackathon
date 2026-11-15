// Режим «От первого лица»: выбор участка или прогулка по пакету рельефа HiRISE.

import { useEffect, useRef, useState } from 'react';
import type { ModeContext, WalkState } from '@/app/modeContract';
import { Hud } from '@/features/hud/Hud';
import { getLang, pick, useT } from '@/shared/i18n/lang';
import { LangSwitch } from '@/shared/i18n/LangSwitch';
import { SLOPE_THRESHOLDS } from './motion';
import { SiteBrief } from './SiteBrief';
import { fetchManifest, fetchSiteIndex, loadSitePackage, siteBaseUrl, type SiteIndexEntry, type SitePackage } from './sitePackage';
import { MARS_RADIUS_KM } from '@/features/globe/tiles';
import { ASCENT_M, ROVER_REAL_SPEED_MS, ROVER_SPEED_MS, TIME_SCALES, WalkScene, type TeleportTarget, type WalkExtra } from './walkScene';

/** Подъём камеры перед переходом на шар. */
const ASCENT_MS = 1400;
import { TimeControls } from './TimeControls';
import { Joystick, TouchLook } from './TouchControls';
import './walk.css';
import { buildOverviewPackage, OVERVIEW_SITE_ID } from './overviewPackage';
import { setPlannedWalkRoute, takePlannedWalkRoute, type PlannedWalkRoute } from '@/shared/walkRoute';

export default function WalkPanel(ctx: ModeContext) {
  const site = ctx.params.site;
  if (!site) return <SiteChooser ctx={ctx} />;
  return (
    <div className="walk-root">
      {site === OVERVIEW_SITE_ID ? <OverviewSite ctx={ctx} /> : <WalkSite key={site} site={site} ctx={ctx} />}
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

/** Пакет участка, начатый загружаться во время спуска, чтобы сцена открылась без экрана загрузки. */
const preloads = new Map<string, Promise<SitePackage>>();
/** Участок, в который прилетаем с шара: сцена начнёт сверху и опустится к старту. */
let pendingArrival: { site: string; at: number } | null = null;
const ARRIVAL_TTL_MS = 20_000;

/** Без побочных эффектов (StrictMode вызывает инициализаторы дважды); сброс — clearArrival. */
function peekArrival(site: string): boolean {
  return pendingArrival?.site === site && performance.now() - pendingArrival.at < ARRIVAL_TTL_MS;
}

function clearArrival(): void {
  pendingArrival = null;
}

/** Обзор участка с шара: ~120 км над центром. */
const OVERVIEW_ALTITUDE = 120 / MARS_RADIUS_KM;
const OVERVIEW_FLY_MS = 2200;
const DESCENT_MS = 3200;

interface ChooserSite extends SiteIndexEntry {
  note?: string;
  note_en?: string;
  /** Точка старта — первая метка участка. */
  spawn: { lat: number; lon: number };
}

function SiteChooser({ ctx, notice }: { ctx: ModeContext; notice?: string }) {
  const t = useT();
  const [sites, setSites] = useState<ChooserSite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [descending, setDescending] = useState(false);
  useEscExit(ctx.exit, !descending);

  useEffect(() => {
    let alive = true;
    fetchSiteIndex()
      .then(async (list) => {
        const full = await Promise.all(
          list.map(async (s): Promise<ChooserSite> => {
            try {
              const m = await fetchManifest(s.id);
              const poi = m.pois?.[0];
              return { ...s, note: m.note, note_en: m.note_en, spawn: poi ? { lat: poi.lat, lon: poi.lon_east } : { lat: s.center.lat, lon: s.center.lon_east } };
            } catch {
              return { ...s, spawn: { lat: s.center.lat, lon: s.center.lon_east } };
            }
          }),
        );
        if (!alive) return;
        setSites(full);
        setSelected((cur) => cur ?? full[0]?.id ?? null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  // Выбор участка — камера шара летит к нему.
  useEffect(() => {
    const s = sites?.find((x) => x.id === selected);
    if (!s || descending) return;
    void ctx.globe.flyTo({ lon: s.center.lon_east, lat: s.center.lat, altitude: OVERVIEW_ALTITUDE }, OVERVIEW_FLY_MS);
  }, [selected, sites, ctx.globe, descending]);

  const descend = async (s: ChooserSite) => {
    if (descending) return;
    setDescending(true);
    if (!preloads.has(s.id)) preloads.set(s.id, loadSitePackage(s.id));
    // Дальний план и модель ровера — тоже заранее, чтобы при посадке они уже были в кэше браузера.
    void fetchManifest(s.id)
      .then((m) => m.backdrop && fetch(siteBaseUrl(s.id) + m.backdrop.file))
      .catch(() => undefined);
    void fetch(`${import.meta.env.BASE_URL}models/perseverance.glb`).catch(() => undefined);
    // Сверху вниз к точке старта; дальше сцена прогулки продолжит спуск до мачты ровера.
    await ctx.globe.flyTo({ lon: s.spawn.lon, lat: s.spawn.lat, altitude: ASCENT_M / 1000 / MARS_RADIUS_KM }, DESCENT_MS);
    pendingArrival = { site: s.id, at: performance.now() };
    ctx.openMode('walk', { site: s.id });
  };

  return (
    <div className="walk-chooser-panel">
      <p className="walk-chooser-lead">
        {t(
          'Подробная модель рельефа HiRISE (сетка 1–2 м) есть только на этих участках. Выберите участок: камера покажет его на шаре.',
          'A detailed HiRISE terrain model (1–2 m grid) exists only at these sites. Pick a site: the camera will show it on the globe.',
        )}
      </p>
      {notice && <p className="walk-notice">{notice}</p>}
      {error && <p className="walk-notice">{error}</p>}
      {!sites && !error && <p className="walk-chooser-lead">{t('Загрузка списка…', 'Loading the list…')}</p>}
      <div className="walk-chooser-list">
        {sites?.map((s) => {
          const on = s.id === selected;
          return (
            <div key={s.id} className={`walk-pick${on ? ' is-on' : ''}`}>
              <button type="button" className="walk-pick-main" disabled={descending} onClick={() => setSelected(s.id)}>
                <strong>{pick(s.title, s.title_en)}</strong>
                <small>
                  {Math.abs(s.center.lat).toFixed(3)}° {s.center.lat >= 0 ? t('с. ш.', 'N') : t('ю. ш.', 'S')}, {s.center.lon_east.toFixed(3)}° {t('в. д.', 'E')}
                </small>
                {on && s.note && !s.route && <span>{pick(s.note, s.note_en)}</span>}
              </button>
              {on && <SiteBrief site={s} />}
              {on && (
                <button type="button" className="walk-pick-go" disabled={descending} onClick={() => void descend(s)}>
                  {descending ? t('Спуск…', 'Descending…') : t('Спуститься', 'Descend')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Маршрут обзорного режима забирается один раз; повторный запуск эффекта (режим разработки)
 * в течение пары секунд получает тот же маршрут.
 */
let overviewTaken: { route: PlannedWalkRoute; at: number } | null = null;
function takeOverviewRoute(): PlannedWalkRoute | null {
  const route = takePlannedWalkRoute(OVERVIEW_SITE_ID);
  if (route) {
    overviewTaken = { route, at: Date.now() };
    return route;
  }
  if (overviewTaken && Date.now() - overviewTaken.at < 3000) return overviewTaken.route;
  return null;
}

/** Обзорный режим: маршрут в любом месте Марса на глобальных данных MOLA и CTX. */
function OverviewSite({ ctx }: { ctx: ModeContext }) {
  const t = useT();
  const [pkg, setPkg] = useState<SitePackage | null>(null);
  const [status, setStatus] = useState<'loading' | 'noroute' | 'error' | 'ready'>('loading');
  const [error, setError] = useState('');
  useEscExit(ctx.exit, status !== 'ready');

  useEffect(() => {
    const ac = new AbortController();
    let loaded: SitePackage | null = null;
    const route = takeOverviewRoute();
    if (!route) {
      setStatus('noroute');
      return;
    }
    setStatus('loading');
    (async () => {
      try {
        loaded = await buildOverviewPackage(route, ac.signal);
        if (ac.signal.aborted) {
          loaded.ortho.close();
          return;
        }
        // Сцена сама забирает маршрут как активный: кладём его обратно перед запуском.
        setPlannedWalkRoute(route);
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
  }, []);

  if (status === 'ready' && pkg) {
    return (
      <>
        <WalkView pkg={pkg} ctx={ctx} />
        <div className="walk-overview-banner" role="note">
          {t(
            'Обзорный режим: рельеф MOLA ~7 км, снимок CTX. Мелкие склоны и камни не видны — это не проверенная тропа.',
            'Overview mode: MOLA ~7 km terrain, CTX image. Small slopes and rocks are not visible — this is not a checked path.',
          )}
        </div>
      </>
    );
  }
  return (
    <div className="walk-center">
      <p>
        {status === 'noroute'
          ? t('Маршрут не задан. Проложите маршрут A → Б на глобусе.', 'No route is set. Plan an A → B route on the globe.')
          : status === 'error'
            ? `${t('Не удалось собрать обзорный рельеф', 'Could not build the overview terrain')}: ${error}`
            : t('Сборка обзорного рельефа MOLA и снимка CTX…', 'Building the MOLA overview terrain and CTX image…')}
      </p>
      <button type="button" className="walk-btn" onClick={ctx.exit}>{t('На глобус', 'To the globe')}</button>
    </div>
  );
}

function WalkSite({ site, ctx }: { site: string; ctx: ModeContext }) {
  const t = useT();
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
        const pre = preloads.get(site);
        preloads.delete(site);
        loaded = await (pre ?? loadSitePackage(site, ac.signal));
        if (ac.signal.aborted) {
          loaded.ortho.close();
          loaded.orthoHi?.close();
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
      loaded?.orthoHi?.close();
    };
  }, [site]);

  if (status === 'missing') {
    return (
      <SiteChooser
        ctx={ctx}
        notice={t(
          'Подробного рельефа здесь нет, доступен только обзорный режим. Выберите участок с DTM HiRISE.',
          'There is no detailed terrain here, only the overview mode. Pick a site with a HiRISE DTM.',
        )}
      />
    );
  }
  if (status === 'error') {
    return (
      <div className="walk-center">
        <p>{t('Не удалось загрузить участок', 'Could not load the site')}: {error}</p>
        <button type="button" className="walk-btn" onClick={ctx.exit}>{t('На глобус', 'To the globe')}</button>
      </div>
    );
  }
  if (status === 'loading' || !pkg) {
    return (
      <div className="walk-center">
        <p>{t('Загрузка рельефа HiRISE…', 'Loading HiRISE terrain…')}</p>
        <button type="button" className="walk-btn" onClick={ctx.exit}>{t('На глобус', 'To the globe')}</button>
      </div>
    );
  }
  return <WalkView pkg={pkg} ctx={ctx} />;
}

function WalkView({ pkg, ctx }: { pkg: SitePackage; ctx: ModeContext }) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<WalkScene | null>(null);
  const [state, setState] = useState<WalkState | null>(null);
  const [extra, setExtra] = useState<WalkExtra | null>(null);
  const [teleports, setTeleports] = useState<TeleportTarget[]>([]);
  const [menu, setMenu] = useState<'none' | 'settings' | 'teleport'>('none');
  const [shadows, setShadows] = useState(true);
  const [groundDetail, setGroundDetail] = useState(true);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [touch] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false);
  const [arrive] = useState(() => peekArrival(pkg.manifest.id));
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
        arrive,
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
    clearArrival();
    setTeleports([...scene.teleports]);
    setShadows(scene.shadows);
    setGroundDetail(scene.groundDetailEnabled);
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
        <p>{t('WebGL недоступен', 'WebGL is unavailable')}: {webglError}</p>
        <button type="button" className="walk-btn" onClick={leave}>{t('На глобус', 'To the globe')}</button>
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
        <button type="button" className="walk-btn" onClick={leave}>{t('На глобус', 'To the globe')}</button>
        <div className="walk-timescale" role="group" aria-label={t('Чем перемещаться', 'How to move')}>
          <button type="button" className={`walk-btn ${state?.vehicle !== 'walk' ? 'is-on' : ''}`} onClick={() => s?.setVehicle('rover')}>{t('Ровер', 'Rover')}</button>
          <button type="button" className={`walk-btn ${state?.vehicle === 'walk' ? 'is-on' : ''}`} onClick={() => s?.setVehicle('walk')}>{t('Пешком', 'On foot')}</button>
          {s?.hasActivePath && (
            <button
              type="button"
              className={`walk-btn ${extra?.autoDrive ? 'is-on' : ''}`}
              aria-pressed={!!extra?.autoDrive}
              title={
                extra?.route
                  ? t('Ровер сам едет по вашему маршруту. W/S/A/D — снова вручную', 'The rover drives itself along your route. W/S/A/D to take control again')
                  : t(
                      `Ровер сам едет по треку ${pkg.track?.rover ?? 'ровера'}. W/S/A/D — снова вручную`,
                      `The rover drives itself along the ${pkg.track?.rover ?? 'rover'} track. W/S/A/D to take control again`,
                    )
              }
              onClick={() => s?.setAutoDrive(!extra?.autoDrive)}
            >
              {t('Автоуправление', 'Autodrive')}
            </button>
          )}
        </div>
        <button type="button" className={`walk-btn ${menu === 'teleport' ? 'is-on' : ''}`} onClick={() => setMenu(menu === 'teleport' ? 'none' : 'teleport')}>
          {t('Перейти к точке', 'Go to point')}
        </button>
        <button type="button" className={`walk-btn ${menu === 'settings' ? 'is-on' : ''}`} onClick={() => setMenu(menu === 'settings' ? 'none' : 'settings')}>
          {t('Настройки', 'Settings')}
        </button>
        <div className="walk-timescale" role="group" aria-label={t('Ускорение времени', 'Time speed-up')}>
          {TIME_SCALES.map((k, i) => (
            <button key={k} type="button" title={t(`Клавиша ${i + 1}`, `Key ${i + 1}`)} className={`walk-btn ${state?.timeScale === k ? 'is-on' : ''}`} onClick={() => s?.setTimeScale(k)}>
              ×{k}
            </button>
          ))}
        </div>
        <LangSwitch className="walk-lang" />
      </div>

      {menu === 'teleport' && (
        <div className="walk-menu">
          {teleports.map((p) => (
            <button key={p.id} type="button" className="walk-menu-item" onClick={() => { s?.teleport(p.x, p.z); setMenu('none'); }}>
              {pick(p.label, p.labelEn)}
            </button>
          ))}
          <p className="walk-muted">{t('Или щёлкните по мини-карте.', 'Or click the minimap.')}</p>
        </div>
      )}

      {menu === 'settings' && (
        <div className="walk-menu">
          <div className="walk-menu-row">
            <span>{t('Порог уклона', 'Slope limit')}</span>
            {SLOPE_THRESHOLDS.map((d) => (
              <button key={d} type="button" className={`walk-btn ${state?.maxSlopeDeg === d ? 'is-on' : ''}`} onClick={() => s?.setMaxSlope(d)}>
                {d}°
              </button>
            ))}
          </div>
          <p className="walk-muted">
            {t(
              '20°: эксплуатационное правило инструмента планирования NASA. 15°: консервативный порог из планов миссий. 25°: ориентир «доступно пешком». Числового требования NASA нет.',
              '20°: operating rule of a NASA planning tool. 15°: conservative limit from mission plans. 25°: rough "walkable" guide. NASA has no numeric requirement.',
            )}
          </p>
          <label className="walk-menu-row">
            <input type="checkbox" checked={shadows} onChange={(e) => { s?.setShadows(e.target.checked); setShadows(e.target.checked); }} />
            <span>{t('Тени от рельефа', 'Terrain shadows')}</span>
          </label>
          <label className="walk-menu-row">
            <input type="checkbox" checked={groundDetail} onChange={(e) => { s?.setGroundDetail(e.target.checked); setGroundDetail(e.target.checked); }} />
            <span>{t('Художественная детализация грунта (не данные)', 'Artistic ground detail (not data)')}</span>
          </label>
          <p className="walk-muted">
            {t(
              'Процедурная фактура песка и камешков у ног, затухает к 60 м. Это не снимок и не DTM: настоящие детали мельче пикселя снимка неизвестны.',
              'Procedural sand and pebble texture near your feet, fading out by 60 m. It is not an image and not a DTM: real details smaller than an image pixel are unknown.',
            )}
          </p>
          {state?.vehicle !== 'walk' && (
            <p className="walk-muted">
              {t(
                `Ровер Perseverance (модель NASA). Скорость в сцене ${ROVER_SPEED_MS.toFixed(1).replace('.', ',')} м/с: это примерно в ` +
                  `${Math.round(ROVER_SPEED_MS / ROVER_REAL_SPEED_MS)} раз быстрее настоящего ровера (${(ROVER_REAL_SPEED_MS * 100).toFixed(1).replace('.', ',')} см/с), иначе по участку не проехать.`,
                `Perseverance rover (NASA 3D model). Scene speed is ${ROVER_SPEED_MS.toFixed(1)} m/s, about ` +
                  `${Math.round(ROVER_SPEED_MS / ROVER_REAL_SPEED_MS)} times faster than the real rover (${(ROVER_REAL_SPEED_MS * 100).toFixed(1)} cm/s); otherwise the site would take too long to cross.`,
              )}
            </p>
          )}
          <p className="walk-muted">
            {t(
              'Скорость ходьбы задаёт симуляция: V = −0,01·θ + 0,75 м/с по модели выходов Apollo, но не меньше 0,1 м/с.',
              'Walking speed comes from the simulation: V = −0.01·θ + 0.75 m/s from the Apollo EVA model, but at least 0.1 m/s.',
            )}
            {extra ? t(` Сейчас ${extra.speedMs.toFixed(2).replace('.', ',')} м/с.`, ` Now ${extra.speedMs.toFixed(2)} m/s.`) : ''}
          </p>
          <p className="walk-muted">
            {t('Кадров в секунду', 'Frames per second')}: {extra ? Math.round(extra.fps) : '—'}
            {extra && extra.renderScale < 1
              ? t(
                  ` · разрешение снижено до ${Math.round(extra.renderScale * 100)} % ради плавности`,
                  ` · resolution lowered to ${Math.round(extra.renderScale * 100)}% for smoothness`,
                )
              : ''}
          </p>
        </div>
      )}

      <div className="walk-minimap">
        <div className="walk-route-tools">
          <button
            type="button"
            className={`walk-btn ${extra?.routeMode ? 'is-on' : ''}`}
            aria-pressed={!!extra?.routeMode}
            title={t(
              'Щелчок по мини-карте прокладывает маршрут отсюда в обход крутых склонов',
              'A click on the minimap plans a route from here around steep slopes',
            )}
            onClick={() => s?.setRouteMode(!extra?.routeMode)}
          >
            {t('Проложить маршрут', 'Plan a route')}
          </button>
          {extra?.route && (
            <button type="button" className="walk-btn" onClick={() => s?.clearRoute()}>
              {t('Сбросить маршрут', 'Clear route')}
            </button>
          )}
        </div>
        {extra?.route && (
          <div className="walk-route-info">
            {t(
              `${extra.route.source === 'planner' ? 'Маршрут из планировщика' : 'Ваш маршрут'}: ${fmtKm(extra.route.lengthM)} · пешком ≈ ${fmtDuration(extra.route.walkS)} (модель)`,
              `${extra.route.source === 'planner' ? 'Route from the planner' : 'Your route'}: ${fmtKm(extra.route.lengthM)} · on foot ≈ ${fmtDuration(extra.route.walkS)} (model)`,
            )}
          </div>
        )}
        <canvas
          ref={minimapRef}
          title={extra?.routeMode ? t('Щёлкните, куда проложить маршрут', 'Click where to plan the route') : t('Щёлкните, чтобы перейти в точку', 'Click to go to a point')}
        />
        <div className="walk-minimap-credit">
          {credit ? `${credit.product} · ${pick(credit.credit ?? '', credit.credit_en)}` : ''}
          {pkg.manifest.backdrop ? ` · ${pick(pkg.manifest.backdrop.label, pkg.manifest.backdrop.label_en)}` : ''}
        </div>
      </div>

      {extra?.autoDrive && (
        <div className="walk-note">
          {extra.route
            ? t(
                `Автоуправление по своему маршруту: ${fmtKm(extra.autoS)} из ${fmtKm(extra.trackLength)} · W/S/A/D — вручную`,
                `Autodrive along your route: ${fmtKm(extra.autoS)} of ${fmtKm(extra.trackLength)} · W/S/A/D for manual`,
              )
            : t(
                `Автоуправление по треку ${pkg.track?.rover ?? 'ровера'}: ${fmtKm(extra.autoS)} из ${fmtKm(extra.trackLength)} · W/S/A/D — вручную`,
                `Autodrive along the ${pkg.track?.rover ?? 'rover'} track: ${fmtKm(extra.autoS)} of ${fmtKm(extra.trackLength)} · W/S/A/D for manual`,
              )}
        </div>
      )}

      {extra?.routeFailed && (
        <div className="walk-blocked walk-blocked--warn">
          {t('Маршрут не найден: мешают крутые склоны или нет данных', 'No route found: steep slopes or missing data are in the way')}
        </div>
      )}

      {!extra?.blocked && extra && Number.isFinite(extra.steepOnTrackDeg) && (
        <div className="walk-blocked walk-blocked--warn">
          {t(
            `Круто: ${Math.round(extra.steepOnTrackDeg)}° по модели рельефа. Здесь проехал ${pkg.track?.rover ?? 'ровер'}, идём по его следу`,
            `Steep: ${Math.round(extra.steepOnTrackDeg)}° by the terrain model. ${pkg.track?.rover ?? 'The rover'} drove here, so we follow its tracks`,
          )}
        </div>
      )}

      {extra?.blocked && (
        <div className="walk-blocked">
          {extra.blocked === 'nodata'
            ? t('Дальше нет данных рельефа, шагнуть нельзя', 'No terrain data ahead, cannot step')
            : t(
                `Слишком круто: ${Math.round(extra.blockedSlopeDeg)}° при пороге ${state?.maxSlopeDeg ?? ''}°`,
                `Too steep: ${Math.round(extra.blockedSlopeDeg)}° with a ${state?.maxSlopeDeg ?? ''}° limit`,
              )}
        </div>
      )}

      {!touch && extra && !extra.locked && !extra.lifting && menu === 'none' && (
        <div className="walk-hint" onClick={() => s?.lock()}>
          {state?.vehicle === 'walk' ? (
            <>
              <strong>{t('Щёлкните, чтобы идти', 'Click to walk')}</strong>
              <span>
                {t(
                  'WASD или стрелки — шаг, мышь — взгляд, 1/2/3 — время ×1/×10/×60, Esc — отпустить мышь, Esc ещё раз — на глобус',
                  'WASD or arrows to step, mouse to look, 1/2/3 for time ×1/×10/×60, Esc to release the mouse, Esc again to return to the globe',
                )}
              </span>
            </>
          ) : (
            <>
              <strong>{t('Щёлкните, чтобы ехать', 'Click to drive')}</strong>
              <span>
                {t(
                  'W/S — вперёд и назад, A/D — поворот, мышь — взгляд с мачты, 1/2/3 — время ×1/×10/×60, Esc — отпустить мышь, Esc ещё раз — на глобус',
                  'W/S forward and back, A/D to turn, mouse to look from the mast, 1/2/3 for time ×1/×10/×60, Esc to release the mouse, Esc again to return to the globe',
                )}
              </span>
            </>
          )}
        </div>
      )}
    </>
  );
}

/** «1 ч 05 мин» или «12 мин». */
function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '—';
  const min = Math.max(1, Math.round(sec / 60));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (getLang() === 'en') return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
  return h ? `${h} ч ${String(m).padStart(2, '0')} мин` : `${m} мин`;
}

/** «0,4 км» или «350 м». */
function fmtKm(m: number): string {
  if (!Number.isFinite(m)) return '—';
  if (getLang() === 'en') return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} км` : `${Math.round(m)} м`;
}
