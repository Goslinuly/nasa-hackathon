// Источники тайлов плоской карты; ниже z12 тяжёлую мозаику 5 м/пикс не запрашиваем (lunaserv считает её на лету).
import { SPECTRA, trekTileUrl } from '@/features/globe/layers';

export const METERS_PER_DEGREE = Math.PI * 3389500 / 180;
export interface MapLayer {
  id: string;
  title: string;
  /** Название по-английски (shared/i18n). */
  titleEn: string;
  resolution: number;
  nativeZoom: number;
  minZoom: number;
  credit: string;
  url: string;
  visible: boolean;
}
const TREK_URL = 'https://trek.nasa.gov/mars/';
const TREK_SPECTRA = ['tes-albedo', 'tes-dust', 'tes-inertia', 'tes-pyroxene', 'tes-plagioclase', 'tes-silicates'] as const;
type TrekSpectrumId = typeof TREK_SPECTRA[number];
const trekAtlasLayers: MapLayer[] = TREK_SPECTRA.map(id => ({ id, title: `${SPECTRA[id].title} · ${SPECTRA[id].kind}`, titleEn: `${SPECTRA[id].titleEn} · ${SPECTRA[id].kindEn}`,
  resolution: SPECTRA[id].nativeResolutionM, nativeZoom: SPECTRA[id].maxNativeZoom, minZoom: 0, credit: SPECTRA[id].credit, url: TREK_URL, visible: false }));
export const MAP_LAYERS: MapLayer[] = [
  { id: 'ctx', title: 'CTX · снимки поверхности', titleEn: 'CTX · surface images', resolution: 5, nativeZoom: 13, minZoom: 12, credit: 'NASA/JPL/MSSS · Caltech Murray Lab · ASU', url: 'https://jmars.asu.edu/node/2844', visible: true },
  ...trekAtlasLayers,
  { id: 'viking', title: 'Viking · обзорная мозаика', titleEn: 'Viking · overview mosaic', resolution: 232, nativeZoom: 7, minZoom: 0, credit: 'NASA/JPL/USGS · Mars Trek', url: TREK_URL, visible: true },
];
const isTrekSpectrum = (id: string): id is TrekSpectrumId => (TREK_SPECTRA as readonly string[]).includes(id);
export function mapTileUrl(id: string, z: number, x: number, y: number) {
  const cols = 2 ** (z + 1), span = 360 / cols;
  const wrapped = ((x % cols) + cols) % cols;
  if (id === 'viking') return trekTileUrl(SPECTRA.natural.color, z, wrapped, y);
  if (isTrekSpectrum(id)) return trekTileUrl(SPECTRA[id].color, z, wrapped, y);
  const west = -180 + wrapped * span, north = 90 - y * span;
  return '/jmars-ctx?' + new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap',
    LAYERS: 'mars_ctx_global_mosaic_v1_m4', STYLES: '', FORMAT: 'image/png',
    SRS: 'JMARS:1,180,90', BBOX: [west, north - span, west + span, north].join(','), WIDTH: '256', HEIGHT: '256' });
}
export function visibleTiles(lon: number, lat: number, zoom: number, width: number, height: number, nativeZoom: number) {
  const z = Math.min(zoom, nativeZoom), size = 256 * 2 ** (zoom - z), cols = 2 ** (z + 1), rows = 2 ** z;
  const cx = (lon + 180) / 360 * cols, cy = (90 - lat) / 180 * rows;
  const tiles = [];
  for (let y = Math.max(0, Math.floor(cy - height / size / 2)); y <= Math.min(rows - 1, Math.floor(cy + height / size / 2)); y++) {
    for (let x = Math.floor(cx - width / size / 2); x <= Math.floor(cx + width / size / 2); x++) {
      tiles.push({ x, y, z, left: (x - cx) * size + width / 2, top: (y - cy) * size + height / 2, size });
    }
  }
  return tiles;
}
