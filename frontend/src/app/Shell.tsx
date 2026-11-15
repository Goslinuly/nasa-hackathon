// Единый экран: шар Марса на фоне, главная страница поверх него, режим исследования с панелью режимов.
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { REGION_MARKERS, relabelRegionMarkers, type RegionMarker } from '@/features/globe/coverageData';
import { MarsGlobeEngine, type HoverPoint, type LonLat, type TerrainState, type ViewState } from '@/features/globe/engine';
import { GlobeHud } from '@/features/globe/GlobeHud';
import { MARS_RADIUS_KM } from '@/features/globe/tiles';
import { CoverageCard } from '@/features/coverage/CoverageCard';
import { makeMarsPoint, type MarsPoint } from '@/shared/coordinates/mars';
import { pick as pickLang, tr, useLang, useT } from '@/shared/i18n/lang';
import { LangSwitch } from '@/shared/i18n/LangSwitch';

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
        <p>{tr('Режим не загрузился. Остальные части карты работают.', 'This mode failed to load. The rest of the map still works.')}</p>
        <button type="button" className="ghost-button" onClick={this.props.onExit}>
          {tr('Назад к шару', 'Back to the globe')}
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
  const t = useT();
  return (
    <ModeErrorBoundary onExit={exit}>
      <Suspense fallback={<p className="dim mode-loading">{t('Загрузка режима…', 'Loading…')}</p>}>
        <Panel {...context} />
      </Suspense>
    </ModeErrorBoundary>
  );
}

export function Shell() {
  const t = useT();
  const lang = useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
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

  // Подписи районов на шаре движок строит один раз: при смене языка обновляем их текст.
  useEffect(() => {
    if (labelsRef.current) relabelRegionMarkers(labelsRef.current);
  }, [lang, globe]);

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

  // Щипок на тачпаде: Chrome шлёт wheel с ctrlKey, Safari — gesture*. Без этого вместе с шаром
  // масштабируется вся страница (панели уезжают за край). В режиме исследования страница не
  // масштабируется; в Safari щипок приближает шар. На главной зум браузера не трогаем.
  useEffect(() => {
    if (stage !== 'explore') return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    let lastScale = 1;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      lastScale = 1;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const scale = (event as Event & { scale?: number }).scale ?? 1;
      if (engine && !fullscreen && scale > 0) engine.zoomBy(lastScale / scale);
      lastScale = scale;
    };
    const onGestureEnd = (event: Event) => event.preventDefault();
    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('gesturestart', onGestureStart, { passive: false });
    document.addEventListener('gesturechange', onGestureChange, { passive: false });
    document.addEventListener('gestureend', onGestureEnd, { passive: false });
    return () => {
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('gesturestart', onGestureStart);
      document.removeEventListener('gesturechange', onGestureChange);
      document.removeEventListener('gestureend', onGestureEnd);
    };
  }, [stage, engine, fullscreen]);

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

  // На телефоне кнопки режимов прокручиваются: активная должна быть видна.
  useEffect(() => {
    barRef.current?.querySelector('.mode-bar button.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeMode?.id]);

  const enterRegion = (slug: string) => {
    const marker = REGION_MARKERS.find((m) => m.slug === slug);
    if (marker) pendingFocus.current = { lon: marker.lon, lat: marker.lat, altitude: 0.25 };
    navigate({ view: 'explore' });
  };

  const showPointCard = stage === 'explore' && !activeMode && pointOpen && point;
  const panelOpen = stage === 'explore' && !fullscreen && Boolean(activeMode || showPointCard);

  // Нижний край верхней панели над колонкой боковой панели: ниже него начинается панель режима.
  // Кнопки режимов справа, в несколько рядов, панель не сдвигают.
  useEffect(() => {
    const bar = barRef.current;
    const shell = shellRef.current;
    if (!bar || !shell) return;
    const update = () => {
      const items = bar.querySelectorAll<HTMLElement>('.explore-back, .explore-brand, .mode-bar button');
      let bottom = 0;
      items.forEach((item) => {
        const rect = item.getBoundingClientRect();
        if (rect.width > 0 && rect.left < 420) bottom = Math.max(bottom, rect.bottom);
      });
      shell.style.setProperty('--bar-h', `${Math.ceil(bottom || bar.getBoundingClientRect().height)}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [globe]);

  // Панель закрывает часть шара: центр кадра и цели полёта сдвигаются в свободную часть.
  useEffect(() => {
    if (!engine) return;
    const panel = panelRef.current;
    if (!panelOpen || !panel) {
      engine.setViewInset({});
      return;
    }
    const update = () => {
      const rect = panel.getBoundingClientRect();
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (rect.width === 0) engine.setViewInset({});
      else if (rect.bottom >= height - 2 && rect.width >= width * 0.9) {
        // Нижняя шторка телефона: свободна полоса между верхней панелью и шторкой.
        const top = barRef.current?.getBoundingClientRect().bottom ?? 0;
        engine.setViewInset({ top, bottom: Math.max(0, height - rect.top) });
      } else engine.setViewInset({ left: Math.max(0, rect.right) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [engine, panelOpen, activeMode?.id, collapsed]);

  return (
    <div ref={shellRef} className={`shell stage-${stage}${fullscreen ? ' is-fullscreen' : ''}`}>
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
            <header ref={barRef} className="explore-bar">
              <button type="button" className="explore-back" onClick={goUp}>
                {t('← Назад', '← Back')}
              </button>
              <button type="button" className="brand explore-brand" onClick={() => navigate({ view: 'landing' })}>
                Martian&nbsp;Map
              </button>
              <LangSwitch className="explore-lang" />
              <nav className="mode-bar" aria-label={t('Режимы', 'Modes')}>
                {VISIBLE_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={mode.id === activeMode?.id ? 'active' : undefined}
                    aria-pressed={mode.id === activeMode?.id}
                    title={pickLang(mode.description, mode.descriptionEn)}
                    onClick={() => (mode.id === activeMode?.id ? exitMode() : openMode(mode.id))}
                  >
                    <span className="mode-title">{pickLang(mode.title, mode.titleEn)}</span>
                    <span className="mode-desc">{pickLang(mode.description, mode.descriptionEn)}</span>
                  </button>
                ))}
              </nav>
            </header>

            {activeMode && !fullscreen && route.view === 'mode' && (
              <aside
                ref={panelRef}
                className={`mode-panel${collapsed ? ' collapsed' : ''}`}
                aria-label={pickLang(activeMode.title, activeMode.titleEn)}
              >
                <div className="mode-panel-head">
                  <h1 className="planner-title">{pickLang(activeMode.title, activeMode.titleEn)}</h1>
                  <button
                    type="button"
                    className="panel-close"
                    aria-label={collapsed ? t('Развернуть панель', 'Expand panel') : t('Свернуть панель', 'Collapse panel')}
                    onClick={() => setCollapsed((v) => !v)}
                  >
                    {collapsed ? '▴' : '▾'}
                  </button>
                  <button type="button" className="panel-close" aria-label={t('Закрыть режим', 'Close mode')} onClick={exitMode}>
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
              <aside ref={panelRef} className="mode-panel point-panel" aria-label={t('Данные точки', 'Point data')}>
                <div className="mode-panel-head">
                  <h1 className="planner-title">{t('Данные точки', 'Point data')}</h1>
                  <button type="button" className="panel-close" aria-label={t('Закрыть', 'Close')} onClick={() => {
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
              <p className="explore-hint">
                {t('Вращайте шар · колесо — приближение · клик — данные точки', 'Drag to rotate · scroll to zoom · click for point data')}
              </p>
            )}

            <GlobeHud />

            <div className="zoom-buttons">
              <button type="button" aria-label={t('Приблизить', 'Zoom in')} onClick={() => globe.engine.zoomBy(0.5)}>
                +
              </button>
              <button type="button" aria-label={t('Отдалить', 'Zoom out')} onClick={() => globe.engine.zoomBy(2)}>
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
