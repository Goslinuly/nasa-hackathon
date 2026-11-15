// Плоская карта Марса: тайловые слои с честным сообщением, когда источник не отдаёт данные.
import { useEffect, useRef, useState } from 'react';
import { formatMarsPoint, makeMarsPoint, signedLongitudeDelta, type MarsPoint } from '@/shared/coordinates/mars';
import type { ResearchRoute } from '@/shared/api/scienceTypes';
import { GeologyLegend } from './GeologyLegend';
import { GEOLOGY_DEFAULT_OPACITY, GEOLOGY_IMAGE_URL, geologyBackground, loadGeologyLegend, type GeologyLegend as Legend } from './geology';
import { loadNomenclature, selectLabels, type Nomenclature } from './nomenclature';
import { formatResolution } from '@/features/globe/format';
import { pick, useT } from '@/shared/i18n/lang';
import { MAP_LAYERS, METERS_PER_DEGREE, mapTileUrl, visibleTiles } from './mapTiles';

function Tile({ src, style, onFail }: { src: string; style: React.CSSProperties; onFail(): void }) {
  const [status, setStatus] = useState('loading');
  const t = useT();
  return <div className={'map-tile ' + status} style={style}>
    {status === 'loading' && <span>{t('Загрузка…', 'Loading…')}</span>}
    <img src={src} alt="" draggable={false} onLoad={() => setStatus('ready')}
      onError={() => { setStatus('error'); onFail(); }} style={{ opacity: status === 'ready' ? 1 : 0 }} />
  </div>;
}

export function MarsMap({ selected, onSelect, focus, route }: {
  selected: MarsPoint | null; onSelect(p: MarsPoint): void; focus: MarsPoint | null; route: ResearchRoute | null;
}) {
  const t = useT();
  const [center, setCenter] = useState({ lon: 0, lat: 0 });
  const [zoom, setZoom] = useState(1);
  const [layers, setLayers] = useState(MAP_LAYERS.map(layer => ({ ...layer, opacity: 1 })));
  const [geology, setGeology] = useState({ visible: false, opacity: GEOLOGY_DEFAULT_OPACITY });
  const [legend, setLegend] = useState<Legend | null>(null);
  const [legendError, setLegendError] = useState('');
  const [names, setNames] = useState(true);
  const [nomenclature, setNomenclature] = useState<Nomenclature | null>(null);
  const [coords, setCoords] = useState('0, 0');
  const [unavailable, setUnavailable] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [size, setSize] = useState({ width: 800, height: 600 });
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; lon: number; lat: number } | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const resetDrag = () => { if (content.current) content.current.style.transform = ''; };
  useEffect(() => {
    if (!geology.visible || legend) return;
    loadGeologyLegend().then(setLegend).catch(() => setLegendError(t('Легенда геологии недоступна', 'Geology legend unavailable')));
  }, [geology.visible, legend, t]);
  useEffect(() => {
    if (!names || nomenclature) return;
    loadNomenclature().then(setNomenclature).catch(() => undefined);
  }, [names, nomenclature]);
  const ppd = 256 * 2 ** (zoom + 1) / 360;
  useEffect(() => { setUnavailable({}); }, [zoom, center.lon, center.lat]);
  const recenter = (lon: number, lat: number) => setCenter({ lon: ((lon + 180) % 360 + 360) % 360 - 180, lat: Math.max(-90, Math.min(90, lat)) });
  useEffect(() => {
    if (focus) { recenter(focus.longitude_deg, focus.latitude_deg); setZoom(10); }
  }, [focus]);
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const shown = (layer: typeof layers[number]) => layer.visible && layer.opacity > 0 && zoom >= layer.minZoom;
  const active = layers.find(shown);
  const pending = layers.find(l => l.visible && l.opacity > 0 && zoom < l.minZoom);
  const project = (lon: number, lat: number) => [size.width / 2 + signedLongitudeDelta(center.lon, lon) * ppd, size.height / 2 + (center.lat - lat) * ppd];
  const mapPoint = (x: number, y: number) => makeMarsPoint(Math.max(-90, Math.min(90, center.lat - (y - size.height / 2) / ppd)), center.lon + (x - size.width / 2) / ppd);
  const mpp = METERS_PER_DEGREE * Math.cos(center.lat * Math.PI / 180) / ppd;
  const scale = Math.max(.001, mpp * 120);
  const routeCoords = route?.geometry.coordinates ?? [];
  const layerTitle = (layer: { title: string; titleEn: string }) => pick(layer.title, layer.titleEn);
  // На телефоне панель слоёв — шторка поверх карты (atlas.css); на широком экране всегда открыта.
  const [layersOpen, setLayersOpen] = useState(false);
  function updateLayer(id: string, change: { visible?: boolean; opacity?: number }) { setLayers(value => value.map(layer => layer.id === id ? { ...layer, ...change } : layer)); }
  function zoomTo500() {
    const degrees = 500 / (METERS_PER_DEGREE * Math.max(.01, Math.cos(center.lat * Math.PI / 180)));
    setZoom(Math.min(18, Math.max(0, Math.round(Math.log2(size.width * 360 / (degrees * 512))))));
  }
  return <div className="map-workbench">
    {layersOpen && <div className="layer-scrim" onClick={() => setLayersOpen(false)} />}
    <aside className={'layer-manager' + (layersOpen ? ' is-open' : '')} id="atlas-layers">
      <div className="pane-title"><div>{t('Слои', 'Layers')} <span>{t('ПОРЯДОК СВЕРХУ ВНИЗ', 'TOP TO BOTTOM')}</span></div><button type="button" className="layer-close" aria-label={t('Закрыть слои', 'Close layers')} onClick={() => setLayersOpen(false)}>×</button></div>
      {layers.map((layer, i) => <article className="map-layer" key={layer.id}>
        <label><input type="checkbox" checked={layer.visible} onChange={e => updateLayer(layer.id, { visible: e.target.checked })} />{layerTitle(layer)}</label>
        <small>{formatResolution(layer.resolution)} · {layer.id === 'ctx' ? t('архивные снимки, возможны пробелы', 'archive images, gaps possible') : t('обзор поверхности', 'surface overview')}</small>
        <label className="layer-opacity">{t('Непрозрачность', 'Opacity')} <input aria-label={t('Непрозрачность ', 'Opacity ') + layer.id} type="range" min="0" max="1" step="0.05" value={layer.opacity} onChange={e => updateLayer(layer.id, { opacity: +e.target.value })} /></label>
        <div className="layer-actions"><a href={layer.url} target="_blank" rel="noreferrer">{t('Источник ↗', 'Source ↗')}</a><button disabled={i === 0} onClick={() => setLayers(value => { const next = [...value]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; return next; })}>{t('Выше ↑', 'Up ↑')}</button></div>
      </article>)}
      <article className="map-layer">
        <label><input type="checkbox" checked={names} onChange={e => setNames(e.target.checked)} />{t('Названия · IAU', 'Names · IAU')}</label>
        <small>{t('Подписи появляются по мере приближения, точечные объекты видны на крупных масштабах', 'Labels appear as you zoom in; small features show at large scales')}</small>
      </article>
      <article className="map-layer">
        <label><input type="checkbox" checked={geology.visible} onChange={e => setGeology(g => ({ ...g, visible: e.target.checked }))} />{t('Геология · карта SIM 3292', 'Geology · SIM 3292 map')}</label>
        <small>{t('Производный растр из векторной публикации USGS; обзор планеты целиком, без деталей масштаба участка', 'Raster derived from the USGS vector publication; a whole-planet overview without site-scale detail')}</small>
        <label className="layer-opacity">{t('Непрозрачность', 'Opacity')} <input aria-label={t('Непрозрачность geology', 'Opacity geology')} type="range" min="0" max="1" step="0.05" value={geology.opacity} onChange={e => setGeology(g => ({ ...g, opacity: +e.target.value }))} /></label>
        {geology.visible && legend && <GeologyLegend legend={legend} />}
        {geology.visible && legendError && <p role="alert">{legendError}</p>}
      </article>
      <div className="layer-note"><strong>{t('Что доступно', 'What is available')}</strong><p>{t('CTX даёт только снимки, без трёхмерного рельефа. Пустые области снимков не означают отсутствие исследований.', 'CTX provides images only, no 3D terrain. Empty image areas do not mean there is no research there.')}</p><p>{t('HiRISE DTM и числовые высоты пока не подключены к этой карте. Проверяйте покрытие выбранной точки справа.', 'HiRISE DTMs and numeric heights are not yet connected to this map. Check the coverage of the selected point on the right.')}</p><p>{t('Путь А → Б показывает обзорную линию для поиска исследований. Это не проверенная проходимая тропа.', 'The A → B path is an overview line for finding research. It is not a verified passable trail.')}</p></div>
    </aside>
    <section className="map-center">
      <div className="map-toolbar"><button type="button" className="map-layers-toggle" aria-controls="atlas-layers" aria-expanded={layersOpen} onClick={() => setLayersOpen(v => !v)}>{t('Слои', 'Layers')}</button><form onSubmit={event => {
        event.preventDefault();
        try { const parts = coords.split(',').map(s => s.trim()); if (parts.length !== 2 || parts.some(s => s === '')) throw new Error(); const p = makeMarsPoint(+parts[0], +parts[1]); recenter(p.longitude_deg, p.latitude_deg); onSelect(p); setError(''); } catch { setError(t('Введите широту −90…90 и восточную долготу через запятую.', 'Enter latitude −90…90 and east longitude, separated by a comma.')); }
      }}><input aria-label={t('Широта, восточная долгота', 'Latitude, east longitude')} value={coords} onChange={e => setCoords(e.target.value)} /><button>{t('Перейти', 'Go')}</button></form>
        <button onClick={() => setZoom(z => Math.min(18, z + 1))} aria-label={t('Приблизить', 'Zoom in')}>＋</button><button onClick={() => setZoom(z => Math.max(0, z - 1))} aria-label={t('Отдалить', 'Zoom out')}>−</button><button onClick={zoomTo500}>{t('Участок ≈500 м', 'Site ≈500 m')}</button><button onClick={() => { recenter(0, 0); setZoom(0); }}>{t('Вся планета', 'Whole planet')}</button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="map-surface" ref={surface} tabIndex={0} aria-label={t('Карта Марса. Стрелки перемещают карту, Enter выбирает центр.', 'Map of Mars. Arrow keys pan the map, Enter selects the center.')} onKeyDown={event => {
        const step = 80 / ppd;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) event.preventDefault();
        if (event.key === 'ArrowLeft') recenter(center.lon - step, center.lat);
        if (event.key === 'ArrowRight') recenter(center.lon + step, center.lat);
        if (event.key === 'ArrowUp') recenter(center.lon, center.lat + step);
        if (event.key === 'ArrowDown') recenter(center.lon, center.lat - step);
        if (event.key === 'Enter') onSelect(makeMarsPoint(center.lat, center.lon));
      }} onPointerDown={event => { if (event.button !== 0) return; surface.current?.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, ...center }; }} onPointerMove={event => {
        if (drag.current && content.current) content.current.style.transform = `translate3d(${event.clientX - drag.current.x}px, ${event.clientY - drag.current.y}px, 0)`;
      }} onPointerUp={event => {
        resetDrag();
        const start = drag.current; drag.current = null; if (!start) return;
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (Math.hypot(dx, dy) > 4) recenter(start.lon - dx / ppd, start.lat + dy / ppd);
        else { const bounds = surface.current!.getBoundingClientRect(); onSelect(mapPoint(event.clientX - bounds.left, event.clientY - bounds.top)); }
      }} onPointerCancel={() => { drag.current = null; resetDrag(); }}>
        <div className="map-moving-content" ref={content}>
        {[...layers].reverse().filter(shown).map(layer => <div key={layer.id} className="map-layer-tiles" style={{ opacity: layer.opacity }}>{visibleTiles(center.lon, center.lat, zoom, size.width, size.height, layer.nativeZoom).map(tile => {
          const src = mapTileUrl(layer.id, tile.z, tile.x, tile.y);
          return <Tile key={`${tile.x}/${tile.y}/${src}`} src={src} onFail={() => setUnavailable(prev => prev[layer.id] ? prev : { ...prev, [layer.id]: true })} style={{ left: tile.left, top: tile.top, width: tile.size + .5, height: tile.size + .5 }} />;
        })}</div>)}
        {geology.visible && geology.opacity > 0 && (() => {
          const g = geologyBackground(legend?.extent ?? { lon_min: -180, lon_max: 180, lat_min: -90, lat_max: 90 }, center.lon, center.lat, ppd, size.width, size.height);
          return <div className="map-geology" style={{ opacity: geology.opacity, backgroundImage: `url(${GEOLOGY_IMAGE_URL})`, backgroundSize: `${g.width}px ${g.height}px`,
            backgroundPosition: `${g.left}px ${g.top}px`, backgroundRepeat: g.wrapsLongitude ? 'repeat-x' : 'no-repeat' }} />;
        })()}
        <svg className="map-overlay" width={size.width} height={size.height}>
          {names && nomenclature && selectLabels(nomenclature.features, { centerLon: center.lon, centerLat: center.lat, pixelsPerDegree: ppd, width: size.width, height: size.height })
            .map(label => <text key={label.name} className={label.major ? 'map-name major' : 'map-name'} x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle">{label.name}</text>)}
          {routeCoords.slice(1).map((p, i) => {
            const a = project(...routeCoords[i]), b = project(...p);
            if (Math.abs(b[0] - a[0]) > 180 * ppd) return null;
            return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#70f5d1" strokeWidth="3" />;
          })}
          {route?.studies.filter(study => study.longitude_deg != null && study.latitude_deg != null).map(study => { const p = project(study.longitude_deg!, study.latitude_deg!); return <circle key={study.id} cx={p[0]} cy={p[1]} r="5" fill="#ffc66f"><title>{study.title}</title></circle>; })}
          {selected && <g transform={`translate(${project(selected.longitude_deg, selected.latitude_deg).join(' ')})`}><circle r="8" fill="none" stroke="#fff" strokeWidth="2" /><path d="M-15 0H15M0 -15V15" stroke="#fff" /></g>}
        </svg>
        </div>
        <div className="map-badge">{active ? layerTitle(active) : pending ? layerTitle(pending) : t('Слои выключены', 'Layers off')}<br />{active && unavailable[active.id] ? (() => { const fallback = layers.find(l => l.id === 'viking' && l.id !== active.id); return `${t('Источник не отвечает, показана', 'Source not responding, showing')} ${fallback ? layerTitle(fallback) : t('обзорная мозаика', 'overview mosaic')}`; })() : pending && !active ? `${t('Появится с', 'Appears from')} z${pending.minZoom}: ${t('источник не отдаёт такую область целиком', 'the source does not serve an area this large')}` : active && zoom > active.nativeZoom ? `${t('Увеличение пикселей: новых деталей нет', 'Pixel magnification: no new detail')} (${formatResolution(active.resolution)})` : t('Архивная карта · покрытие зависит от участка', 'Archive map · coverage varies by area')}{pending && active ? <><br />{`${layerTitle(pending)}: ${t('с', 'from')} z${pending.minZoom}`}</> : null}</div>
        <div className="map-scale"><span style={{ width: 120 }} />≈{scale >= 1000 ? `${(scale / 1000).toFixed(1)} ${t('км', 'km')}` : `${scale.toFixed(1)} ${t('м', 'm')}`} {t('на широте центра', 'at center latitude')}</div>
        <div className="map-credit">{[...layers.filter(l => l.visible && l.opacity > 0).map(l => l.credit), ...(names && nomenclature ? [t('Названия: ', 'Names: ') + nomenclature.credit] : []), ...(geology.visible && geology.opacity > 0 ? [t('Геология: ', 'Geology: ') + (legend ? pick(legend.credit, legend.credit_en) : 'USGS SIM 3292, Tanaka et al. (2014)')] : [])].join(' / ')}</div>
      </div>
      <div className="map-panner" role="button" tabIndex={0} aria-label={t('Обзор Марса: клик перемещает центр, Enter показывает всю планету', 'Mars overview: click to move the center, Enter shows the whole planet')} onKeyDown={e => { if (e.key === 'Enter') { recenter(0, 0); setZoom(0); } }} onClick={event => { const b = event.currentTarget.getBoundingClientRect(); recenter((event.clientX - b.left) / b.width * 360 - 180, 90 - (event.clientY - b.top) / b.height * 180); }}>
        {[0, 1].map(x => <img key={x} src={mapTileUrl('viking', 0, x, 0)} alt="" draggable={false} />)}
        <svg viewBox="0 0 360 180" preserveAspectRatio="none">{[-360, 0, 360].map(offset => <rect key={offset} x={center.lon + 180 - size.width / ppd / 2 + offset} y={90 - center.lat - size.height / ppd / 2} width={size.width / ppd} height={size.height / ppd} fill="#21d9c333" stroke="#64ffe5" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}<circle cx={center.lon + 180} cy={90 - center.lat} r="2" fill="#fff" /></svg><span>{t('ОБЗОР ПЛАНЕТЫ', 'PLANET OVERVIEW')}</span>
      </div>
      <footer className="map-status">{formatMarsPoint(makeMarsPoint(center.lat, center.lon), 5)} · {t('планетоцентрические координаты', 'planetocentric coordinates')} · z{zoom} · {t('перетащите карту для перемещения', 'drag the map to pan')}</footer>
    </section>
  </div>;
}
