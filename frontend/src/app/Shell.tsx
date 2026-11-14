// Единый экран: шар Марса на фоне, главная страница поверх него, режим исследования с панелью режимов.
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { REGION_MARKERS, type RegionMarker } from '@/features/globe/coverageData';
import { MarsGlobeEngine, type HoverPoint, type LonLat, type TerrainState, type ViewState } from '@/features/globe/engine';
import { GlobeHud } from '@/features/globe/GlobeHud';
import { MARS_RADIUS_KM } from '@/features/globe/tiles';
import { CoverageCard } from '@/features/coverage/CoverageCard';
import { makeMarsPoint, type MarsPoint } from '@/shared/coordinates/mars';

import { createScopedGlobeApi, type PickSlot } from './globeApi';
import { GlobeStateContext, ValueStore, type GlobeState } from './globeState';
import { Landing } from './Landing';
import { isStaleChunkError, reloadForNewBuild } from './staleBuild';
import { modeIsFullscreen, type ExitOrigin, type ModeContext, type ModeDefinition } from './modeContract';
import { MODES, VISIBLE_MODES } from './modes';
import { formatRoute, parentRoute, parseHash, sameRoute, type ShellRoute } from './routes';
import './shell.css';

const ENTER_DELAY_MS = 250;
const FLY_MS = 1500;
/** Отлёт после прогулки: до ~1000 км над точкой. */
const EXIT_ALTITUDE_SCENE = 0.3;
const EXIT_FLY_MS = 2600;

function readRoute(): ShellRoute {
  return parseHash(window.location.hash, MODES);
}

class ModeErrorBoundary extends Component<{ onExit(): void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[режим] ошибка', error);
    // Вкладка открыта до деплоя: файлов старой сборки уже нет — берём новую.
    if (isStaleChunkError(error)) reloadForNewBuild();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mode-error">
        <p>Режим не загрузился. Остальные части карты работают.</p>
        <button type="button" className="ghost-button" onClick={this.props.onExit}>
          Назад к шару
        </button>
      </div>
    );
  }
}

interface ModeHostProps {
  mode: ModeDefinition;
  engine: MarsGlobeEngine;
  pick: PickSlot;
  params: Record<string, string>;
  exit(): void;
  exitFrom(origin: ExitOrigin): void;
  openMode(id: string, params?: Record<string, string>): void;
}

/** Один открытый режим: свой GlobeApi, слои которого убираются при выходе. */
function ModeHost({ mode, engine, pick, params, exit, exitFrom, openMode }: ModeHostProps) {
  const globe = useMemo(() => createScopedGlobeApi(engine, mode.id, pick), [engine, mode.id, pick]);
  useEffect(() => () => globe.release(), [globe]);
  const context: ModeContext = { globe, params, exit, exitFrom, openMode };
  const Panel = mode.Panel;
  return (
    <ModeErrorBoundary onExit={exit}>
      <Suspense fallback={<p className="dim mode-loading">Загрузка режима…</p>}>
        <Panel {...context} />
      </Suspense>
    </ModeErrorBoundary>
  );
}

export function Shell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [globe, setGlobe] = useState<GlobeState | null>(null);
  const [route, setRoute] = useState<ShellRoute>(readRoute);
  const [point, setPoint] = useState<MarsPoint | null>(null);
  const [pointOpen, setPointOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pick = useRef<PickSlot>({ current: null }).current;
  const pendingFocus = useRef<{ lon: number; lat: number; altitude: number } | null>(null);
  const firstFraming = useRef(true);

  const stage = route.view === 'landing' ? 'landing' : 'explore';
  const activeMode = route.view === 'mode' ? MODES.find((m) => m.id === route.modeId) ?? null : null;
  const fullscreen = route.view === 'mode' && modeIsFullscreen(activeMode, route.params);

  // --- Адрес и история -------------------------------------------------------------------

  const navigate = useCallback((next: ShellRoute) => {
    const hash = formatRoute(next, MODES);
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    if (!sameRoute(readRoute(), next, MODES)) window.history.pushState(null, '', url);
    setRoute((current) => (sameRoute(current, next, MODES) ? current : next));
  }, []);

  useEffect(() => {
    const sync = () => {
      const next = readRoute();
      setRoute((current) => (sameRoute(current, next, MODES) ? current : next));
    };
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const goUp = useCallback(() => navigate(parentRoute(route)), [navigate, route]);
  // Точка, над которой шар появится после выхода из полноэкранного режима и откуда отлетит.
  const flyOut = useRef<ExitOrigin | null>(null);
  const exitMode = useCallback(() => {
    flyOut.current = null;
    navigate({ view: 'explore' });
  }, [navigate]);
  const exitModeFrom = useCallback(
    (origin: ExitOrigin) => {
      flyOut.current = origin;
      navigate({ view: 'explore' });
    },
    [navigate],
  );
  const openMode = useCallback(
    (id: string, params: Record<string, string> = {}) => {
      if (MODES.some((m) => m.id === id)) navigate({ view: 'mode', modeId: id, params });
    },
    [navigate],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || route.view === 'landing') return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      goUp();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goUp, route.view]);

  // --- Движок шара: один на всю страницу -----------------------------------------------------

  const selectPoint = useCallback((selected: LonLat) => {
    setPoint(makeMarsPoint(selected.lat, selected.lon));
    setPointOpen(true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const labels = labelsRef.current;
    if (!canvas || !labels) return;
    const terrain = new ValueStore<TerrainState>({ status: 'loading' });
    const hover = new ValueStore<HoverPoint | null>(null);
    const view = new ValueStore<ViewState | null>(null);
    let engineRef: MarsGlobeEngine | null = null;
    const engine = new MarsGlobeEngine(canvas, labels, {
      onHover: (value) => hover.set(value),
      onView: (value) => view.set(value),
      onTerrain: (value) => terrain.set(value),
      onSelect: (selected) => {
        if (pick.current) {
          pick.current(selected);
          return;
        }
        engineRef?.setSelection(selected.lon, selected.lat);
        selectPoint(selected);
      },
      onRegionSelect: (marker: RegionMarker) => {
        engineRef?.focus(marker.lon, marker.lat, 0.25);
        if (!pick.current) {
          engineRef?.setSelection(marker.lon, marker.lat);
          selectPoint(marker);
        }
      },
    });
    engineRef = engine;

    const resize = () => engine.setSize(window.innerWidth, window.innerHeight);
    resize();
    window.addEventListener('resize', resize);
    setGlobe({ engine, terrain, hover, view });
    return () => {
      window.removeEventListener('resize', resize);
      engine.dispose();
      setGlobe(null);
      firstFraming.current = true;
    };
  }, [pick, selectPoint]);

  const engine = globe?.engine ?? null;

  // Главная ↔ исследование: интерфейс уходит, камера летит, шар становится управляемым.
  useEffect(() => {
    if (!engine) return;
    const landing = stage === 'landing';
    engine.setInteractive(!landing);
    engine.setIdleSpin(landing);
    engine.setMaxFps(landing ? 30 : 0);
    const flyAfter = () => {
      const focus = pendingFocus.current;
      pendingFocus.current = null;
      if (focus && !landing) void engine.flyTo(focus.lon, focus.lat, focus.altitude, FLY_MS);
    };
    if (firstFraming.current) {
      firstFraming.current = false;
      void engine.setFraming(stage, 0).then(flyAfter);
      return;
    }
    const timer = window.setTimeout(
      () => void engine.setFraming(stage, FLY_MS).then(flyAfter),
      landing ? 0 : ENTER_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [engine, stage]);

  // Полноэкранный режим закрывает шар: отрисовка на паузе.
  useEffect(() => {
    if (!engine || !fullscreen) return;
    engine.pause();
    return () => {
      const from = flyOut.current;
      flyOut.current = null;
      if (from) {
        // Шар сразу над той же точкой, на той же высоте, затем отлёт до обзора района.
        void engine.flyTo(from.lon, from.lat, from.altitudeKm / MARS_RADIUS_KM, 0);
        engine.resume();
        void engine.flyTo(from.lon, from.lat, EXIT_ALTITUDE_SCENE, EXIT_FLY_MS);
      } else {
        engine.resume();
      }
    };
  }, [engine, fullscreen]);

  useEffect(() => setCollapsed(false), [activeMode?.id]);

  const enterRegion = (slug: string) => {
    const marker = REGION_MARKERS.find((m) => m.slug === slug);
    if (marker) pendingFocus.current = { lon: marker.lon, lat: marker.lat, altitude: 0.25 };
    navigate({ view: 'explore' });
  };

  const showPointCard = stage === 'explore' && !activeMode && pointOpen && point;

  return (
    <div className={`shell stage-${stage}${fullscreen ? ' is-fullscreen' : ''}`}>
      <div className="shell-globe" aria-hidden={stage === 'landing'}>
        <canvas ref={canvasRef} className="globe-canvas" />
        <div ref={labelsRef} className="globe-labels" />
      </div>

      <Landing
        active={stage === 'landing'}
        point={point}
        modes={VISIBLE_MODES}
        onExplore={() => navigate({ view: 'explore' })}
        onMode={(id) => openMode(id)}
        onRegion={(region) => enterRegion(region.slug)}
      />

      {globe && (
        <GlobeStateContext.Provider value={globe}>
          <div className="explore-ui" aria-hidden={stage !== 'explore' || fullscreen}>
            <header className="explore-bar">
              <button type="button" className="explore-back" onClick={goUp}>
                ← Назад
              </button>
              <button type="button" className="brand explore-brand" onClick={() => navigate({ view: 'landing' })}>
                Martian&nbsp;Map
              </button>
              <nav className="mode-bar" aria-label="Режимы">
                {VISIBLE_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={mode.id === activeMode?.id ? 'active' : undefined}
                    aria-pressed={mode.id === activeMode?.id}
                    title={mode.description}
                    onClick={() => (mode.id === activeMode?.id ? exitMode() : openMode(mode.id))}
                  >
                    <span className="mode-title">{mode.title}</span>
                    <span className="mode-desc">{mode.description}</span>
                  </button>
                ))}
              </nav>
            </header>

            {activeMode && !fullscreen && route.view === 'mode' && (
              <aside className={`mode-panel${collapsed ? ' collapsed' : ''}`} aria-label={activeMode.title}>
                <div className="mode-panel-head">
                  <h1 className="planner-title">{activeMode.title}</h1>
                  <button
                    type="button"
                    className="panel-close"
                    aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
                    onClick={() => setCollapsed((v) => !v)}
                  >
                    {collapsed ? '▴' : '▾'}
                  </button>
                  <button type="button" className="panel-close" aria-label="Закрыть режим" onClick={exitMode}>
                    ×
                  </button>
                </div>
                <div className="mode-panel-body" hidden={collapsed}>
                  <ModeHost
                    key={activeMode.id}
                    mode={activeMode}
                    engine={globe.engine}
                    pick={pick}
                    params={route.params}
                    exit={exitMode}
                    exitFrom={exitModeFrom}
                    openMode={openMode}
                  />
                </div>
              </aside>
            )}

            {showPointCard && (
              <aside className="mode-panel point-panel" aria-label="Данные точки">
                <div className="mode-panel-head">
                  <h1 className="planner-title">Данные точки</h1>
                  <button type="button" className="panel-close" aria-label="Закрыть" onClick={() => {
                    setPointOpen(false);
                    globe.engine.setProbe(null);
                  }}>
                    ×
                  </button>
                </div>
                <div className="mode-panel-body">
                  <CoverageCard point={point} />
                </div>
              </aside>
            )}

            {!activeMode && !showPointCard && (
              <p className="explore-hint">Вращайте шар · колесо — приближение · клик — данные точки</p>
            )}

            <GlobeHud />

            <div className="zoom-buttons">
              <button type="button" aria-label="Приблизить" onClick={() => globe.engine.zoomBy(0.5)}>
                +
              </button>
              <button type="button" aria-label="Отдалить" onClick={() => globe.engine.zoomBy(2)}>
                −
              </button>
            </div>
          </div>

          {activeMode && fullscreen && (
            <div className="mode-fullscreen">
              <ModeHost
                key={activeMode.id}
                mode={activeMode}
                engine={globe.engine}
                pick={pick}
                params={route.params}
                exit={exitMode}
                exitFrom={exitModeFrom}
                openMode={openMode}
              />
            </div>
          )}
        </GlobeStateContext.Provider>
      )}
    </div>
  );
}
