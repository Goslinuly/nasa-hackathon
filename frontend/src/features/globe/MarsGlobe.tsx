// Полноэкранный 3D-глобус Марса с HUD: координаты, высота, предел данных.
import { useEffect, useRef, useState } from 'react';

import type { RegionMarker } from './coverageData';
import {
  DEFAULT_EXAGGERATION,
  EXAGGERATION_OPTIONS,
  MarsGlobeEngine,
  type HoverPoint,
  type TerrainState,
  type ViewState,
} from './engine';
import { DEFAULT_SPECTRUM, SPECTRA, type SpectrumId } from './layers';

const HOME_SPECTRA: SpectrumId[] = ['natural', 'hypsometry', 'themis-night'];
import { makeMarsPoint, type MarsPoint } from '@/shared/coordinates/mars';

interface MarsGlobeProps {
  onSelect(point: MarsPoint): void;
  onRegionSelect(marker: RegionMarker): void;
}

function formatDeg(value: number, hemispheres: [string, string]): string {
  const hemisphere = value >= 0 ? hemispheres[0] : hemispheres[1];
  return `${Math.abs(value).toFixed(4)}° ${hemisphere}`;
}

function formatResolution(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} км/пикс` : `${Math.round(meters)} м/пикс`;
}

export function MarsGlobe({ onSelect, onRegionSelect }: MarsGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MarsGlobeEngine | null>(null);
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const [view, setView] = useState<ViewState | null>(null);
  const [terrain, setTerrain] = useState<TerrainState>({ status: 'loading' });
  const [spectrumId, setSpectrumId] = useState<SpectrumId>(DEFAULT_SPECTRUM);
  const [exaggeration, setExaggeration] = useState<number>(DEFAULT_EXAGGERATION);

  useEffect(() => {
    const canvas = canvasRef.current;
    const labels = labelsRef.current;
    if (!canvas || !labels) return;

    const engine = new MarsGlobeEngine(canvas, labels, {
      onHover: setHover,
      onView: setView,
      onTerrain: setTerrain,
      onSelect: (p) => onSelect(makeMarsPoint(p.lat, p.lon)),
      onRegionSelect: (marker) => {
        engineRef.current?.focus(marker.lon, marker.lat, 0.25);
        onRegionSelect(marker);
      },
    });
    engineRef.current = engine;

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      engine.setSize(rect.width, rect.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement!);

    return () => {
      observer.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseSpectrum = (id: SpectrumId) => {
    setSpectrumId(id);
    engineRef.current?.setSpectrum(id);
  };

  const chooseExaggeration = (value: number) => {
    setExaggeration(value);
    engineRef.current?.setExaggeration(value);
  };

  return (
    <div className="globe-stage">
      <canvas ref={canvasRef} className="globe-canvas" />
      <div ref={labelsRef} className="globe-labels" />

      <div className="hud hud-coords">
        <span className="hud-label">Координаты</span>
        <span className="hud-value">
          {hover
            ? `${formatDeg(hover.lat, ['N', 'S'])}  ${formatDeg(
                ((hover.lon % 360) + 360) % 360,
                ['E', 'E'],
              )}`
            : '— наведите на планету —'}
        </span>
        {hover?.heightM != null && (
          <span className="hud-sub">
            Высота MOLA {Math.round(hover.heightM).toLocaleString('ru-RU')} м
            <span className="hud-dim"> · над ареоидом</span>
          </span>
        )}
      </div>

      <div className="hud hud-controls">
        <div>
          <span className="hud-label">Спектр</span>
          <div className="hud-toggle" role="radiogroup" aria-label="Спектр">
            {HOME_SPECTRA.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={id === spectrumId}
                className={id === spectrumId ? 'active' : undefined}
                title={SPECTRA[id].description}
                onClick={() => chooseSpectrum(id)}
              >
                {SPECTRA[id].title}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="hud-label">Рельеф по высоте</span>
          <div className="hud-toggle" role="radiogroup" aria-label="Вертикальное преувеличение">
            {EXAGGERATION_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={value === exaggeration}
                className={value === exaggeration ? 'active' : undefined}
                disabled={terrain.status !== 'ready'}
                onClick={() => chooseExaggeration(value)}
              >
                ×{value}
              </button>
            ))}
          </div>
          <span className="hud-note">
            {terrain.status === 'ready' &&
              `MOLA ${formatResolution(terrain.resolutionM)}${
                exaggeration === 1 ? ' · реальный масштаб' : ` · преувеличение ×${exaggeration}`
              }`}
            {terrain.status === 'loading' && 'Загрузка карты высот…'}
            {terrain.status === 'failed' && `${terrain.message ?? 'Карта высот недоступна'}: показана гладкая сфера`}
          </span>
        </div>
      </div>

      {view && (
        <div className="hud hud-view">
          <div>
            <span className="hud-label">Высота камеры</span>
            <span className="hud-value">
              {view.altitudeKm >= 100
                ? `${Math.round(view.altitudeKm).toLocaleString('ru-RU')} км`
                : `${view.altitudeKm.toFixed(1)} км`}
            </span>
          </div>
          <div>
            <span className="hud-label">Данные слоя</span>
            <span className="hud-value">
              {formatResolution(view.dataResolutionM)}
              <span className="hud-dim"> · L{view.zoom}</span>
            </span>
          </div>
          {view.overLimit && (
            <div className="hud-warn">
              Предел подложки ({formatResolution(view.nativeResolutionM)}). Детальнее — в{' '}
              <a href="/planner">планировщике</a>: CTX 5 м и HiRISE до 25 см.
            </div>
          )}
        </div>
      )}

      <div className="hud hud-hint">Вращайте · колесо — приближение · клик — выбрать точку</div>
    </div>
  );
}
