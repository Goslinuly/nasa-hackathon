import { SPECTRA, trekTileUrl } from '@/features/globe/layers';

export const METERS_PER_DEGREE = Math.PI * 3389500 / 180;
export const MAP_LAYERS = [
  // minZoom: lunaserv рендерит мозаику 5 м/пикс на лету. Замеры по живому
  // серверу: участок 0.022° отдаётся за ~3 с, 0.18° — уже за 44 с, а от 5.6°
  // и крупнее запрос не возвращается вовсе. Ниже z12 слой просто не просим.
  { id: 'ctx', title: 'CTX · снимки поверхности', resolution: 5, nativeZoom: 13, minZoom: 12, credit: 'NASA/JPL/MSSS · Caltech Murray Lab · ASU', url: 'https://jmars.asu.edu/node/2844' },
  { id: 'viking', title: 'Viking · обзорная мозаика', resolution: 232, nativeZoom: 7, minZoom: 0, credit: 'NASA/JPL/USGS · Mars Trek', url: 'https://trek.nasa.gov/mars/' },
] as const;
export type MapLayer = typeof MAP_LAYERS[number];
export function mapTileUrl(id: string, z: number, x: number, y: number) {
  const cols = 2 ** (z + 1), span = 360 / cols;
  const wrapped = ((x % cols) + cols) % cols;
  if (id === 'viking') return trekTileUrl(SPECTRA.natural.color, z, wrapped, y);
  const west = -180 + wrapped * span, north = 90 - y * span;
  // Lunaserv ob_tran: north pole at 90°, lon_0=180-up_lon=0.
  // Thus x/y are east longitude / planetocentric latitude in degrees.
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
