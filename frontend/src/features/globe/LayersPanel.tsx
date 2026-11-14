// Режим «Слои»: спектр подложки, детальные снимки, преувеличение рельефа.
import { useState } from 'react';

import { useGlobeState, useValue } from '@/app/globeState';
import type { ModeContext } from '@/app/modeContract';

import { EXAGGERATION_OPTIONS } from './engine';
import { formatResolution } from './format';
import { CTX_OVERLAY, HIRISE_OVERLAYS, SPECTRA, type SpectrumId } from './layers';

const SPECTRUM_ORDER: SpectrumId[] = ['natural', 'hypsometry', 'shade', 'themis-day', 'themis-night'];

export default function LayersPanel(_: ModeContext) {
  const { engine, terrain: terrainStore } = useGlobeState();
  const terrain = useValue(terrainStore);
  const [spectrumId, setSpectrumId] = useState<SpectrumId>(() => engine.getSpectrum());
  const [ctxOn, setCtxOn] = useState(() => engine.isOverlayEnabled(CTX_OVERLAY.id));
  const [hiriseOn, setHiriseOn] = useState(() => HIRISE_OVERLAYS.some((o) => engine.isOverlayEnabled(o.id)));
  const [exaggeration, setExaggeration] = useState(() => engine.getExaggeration());

  const spectrum = SPECTRA[spectrumId];

  const chooseSpectrum = (id: SpectrumId) => {
    setSpectrumId(id);
    engine.setSpectrum(id);
  };
  const toggleCtx = () => {
    engine.setOverlayEnabled(CTX_OVERLAY.id, !ctxOn);
    setCtxOn(!ctxOn);
  };
  const toggleHirise = () => {
    HIRISE_OVERLAYS.forEach((overlay) => engine.setOverlayEnabled(overlay.id, !hiriseOn));
    setHiriseOn(!hiriseOn);
  };
  const chooseExaggeration = (value: number) => {
    setExaggeration(value);
    engine.setExaggeration(value);
  };

  return (
    <div className="layers-panel">
      <span className="hud-label">Спектр</span>
      <div className="layer-list" role="radiogroup" aria-label="Спектр">
        {SPECTRUM_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={id === spectrumId}
            className={id === spectrumId ? 'active' : undefined}
            onClick={() => chooseSpectrum(id)}
          >
            {SPECTRA[id].title}
          </button>
        ))}
      </div>
      <p className="layer-desc">{spectrum.description}</p>
      {spectrum.legend && (
        <div className="legend">
          <span className="legend-quantity">{spectrum.legend.quantity}</span>
          <span className="legend-bar" style={{ background: spectrum.legend.gradient }} />
          <span className="legend-ends">
            <span>{spectrum.legend.low}</span>
            <span>{spectrum.legend.high}</span>
          </span>
        </div>
      )}
      <span className="layer-meta">
        {formatResolution(spectrum.nativeResolutionM)} · {spectrum.coverage}
      </span>

      <span className="hud-label">Детальные снимки</span>
      <label className="check">
        <input type="checkbox" checked={ctxOn} onChange={toggleCtx} />
        <span>
          {CTX_OVERLAY.title}
          <small>почти вся планета, с ~160 м/пикс экрана</small>
        </span>
      </label>
      <label className="check">
        <input type="checkbox" checked={hiriseOn} onChange={toggleHirise} />
        <span>
          HiRISE · 0.25–0.5 м (ч/б)
          <small>{HIRISE_OVERLAYS.map((o) => o.title).join(', ')}</small>
        </span>
      </label>
      {!ctxOn && !hiriseOn && (
        <p className="layer-desc">Без снимков приближение ограничено разрешением подложки.</p>
      )}

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
      <span className="layer-meta">
        {terrain.status === 'ready' &&
          `${exaggeration === 1 ? 'Реальный масштаб' : `Преувеличение ×${exaggeration}`} · геометрия MOLA ${formatResolution(terrain.resolutionM)}`}
        {terrain.status === 'loading' && 'Загрузка карты высот…'}
        {terrain.status === 'failed' && `${terrain.message ?? 'Карта высот недоступна'}: показана гладкая сфера`}
      </span>
    </div>
  );
}
