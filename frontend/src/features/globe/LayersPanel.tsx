// Режим «Слои»: спектр подложки, детальные снимки, преувеличение рельефа.
import { useState } from 'react';

import { useGlobeState, useValue } from '@/app/globeState';
import type { ModeContext } from '@/app/modeContract';
import { pick, useLang, useT } from '@/shared/i18n/lang';

import { EXAGGERATION_OPTIONS } from './engine';
import { formatResolution } from './format';
import { CTX_OVERLAY, HIRISE_OVERLAYS, SPECTRA, type SpectrumId } from './layers';

const SPECTRUM_ORDER: SpectrumId[] = [
  'natural',
  'hypsometry',
  'shade',
  'themis-day',
  'themis-night',
  'tes-albedo',
  'tes-dust',
  'tes-inertia',
  'tes-pyroxene',
  'tes-plagioclase',
  'tes-silicates',
];

export default function LayersPanel(_: ModeContext) {
  const { engine, terrain: terrainStore } = useGlobeState();
  const t = useT();
  const lang = useLang();
  const terrain = useValue(terrainStore);
  const [spectrumId, setSpectrumId] = useState<SpectrumId>(() => engine.getSpectrum());
  const [ctxOn, setCtxOn] = useState(() => engine.isOverlayEnabled(CTX_OVERLAY.id));
  const [hiriseOn, setHiriseOn] = useState(() => HIRISE_OVERLAYS.some((o) => engine.isOverlayEnabled(o.id)));
  const [footprintsOn, setFootprintsOn] = useState(() => engine.getFootprintsVisible());
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
  const toggleFootprints = () => {
    engine.setFootprintsVisible(!footprintsOn);
    setFootprintsOn(!footprintsOn);
  };
  const chooseExaggeration = (value: number) => {
    setExaggeration(value);
    engine.setExaggeration(value);
  };

  return (
    <div className="layers-panel">
      <span className="hud-label">{t('Спектр', 'Spectrum')}</span>
      <div className="layer-list" role="radiogroup" aria-label={t('Спектр', 'Spectrum')}>
        {SPECTRUM_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={id === spectrumId}
            className={id === spectrumId ? 'active' : undefined}
            onClick={() => chooseSpectrum(id)}
          >
            {pick(SPECTRA[id].title, SPECTRA[id].titleEn)}
          </button>
        ))}
      </div>
      <p className="layer-desc">{pick(spectrum.description, spectrum.descriptionEn)}</p>
      {spectrum.legend && (
        <div className="legend">
          <span className="legend-quantity">{pick(spectrum.legend.quantity, spectrum.legend.quantityEn)}</span>
          <span className="legend-bar" style={{ background: spectrum.legend.gradient }} />
          <span className="legend-ends">
            <span>{pick(spectrum.legend.low, spectrum.legend.lowEn)}</span>
            <span>{pick(spectrum.legend.high, spectrum.legend.highEn)}</span>
          </span>
        </div>
      )}
      <span className="layer-meta">
        {pick(spectrum.kind, spectrum.kindEn)} · {formatResolution(spectrum.nativeResolutionM)} ·{' '}
        {pick(spectrum.coverage, spectrum.coverageEn)}
      </span>

      <span className="hud-label">{t('Детальные снимки', 'Detailed images')}</span>
      <label className="check">
        <input type="checkbox" checked={ctxOn} onChange={toggleCtx} />
        <span>
          {pick(CTX_OVERLAY.title, CTX_OVERLAY.titleEn)}
          <small>{t('почти вся планета, с ~160 м/пикс экрана', 'almost the whole planet, from ~160 m/px on screen')}</small>
        </span>
      </label>
      <label className="check">
        <input type="checkbox" checked={hiriseOn} onChange={toggleHirise} />
        <span>
          {t('HiRISE · 0.25–0.5 м (ч/б)', 'HiRISE · 0.25–0.5 m (B/W)')}
          <small>{HIRISE_OVERLAYS.map((o) => pick(o.title, o.titleEn)).join(', ')}</small>
        </span>
      </label>
      {!ctxOn && !hiriseOn && (
        <p className="layer-desc">
          {t('Без снимков приближение ограничено разрешением подложки.', 'Without images, zoom is limited by the base map resolution.')}
        </p>
      )}
      <label className="check">
        <input type="checkbox" checked={footprintsOn} onChange={toggleFootprints} />
        <span>
          {t('Участки прогулки', 'Walk sites')}
          <small>
            {t('оранжевые контуры DTM HiRISE для режима «От первого лица»', 'orange HiRISE DTM outlines for the First person mode')}
          </small>
        </span>
      </label>

      <span className="hud-label">{t('Рельеф по высоте', 'Vertical relief')}</span>
      <div className="hud-toggle" role="radiogroup" aria-label={t('Вертикальное преувеличение', 'Vertical exaggeration')}>
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
          `${exaggeration === 1 ? t('Реальный масштаб', 'True scale') : `${t('Преувеличение', 'Exaggeration')} ×${exaggeration}`} · ${t('геометрия', 'geometry')} MOLA ${formatResolution(terrain.resolutionM)}`}
        {terrain.status === 'loading' && t('Загрузка карты высот…', 'Loading the elevation map…')}
        {terrain.status === 'failed' &&
          (lang === 'en'
            ? 'Elevation map unavailable: showing a smooth sphere'
            : `${terrain.message ?? 'Карта высот недоступна'}: показана гладкая сфера`)}
      </span>
    </div>
  );
}
