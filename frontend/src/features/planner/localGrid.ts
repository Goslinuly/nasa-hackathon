// Сетка детального рельефа из пакета участка (HiRISE DTM или процедурная модель): окно с метровым разрешением.

import { MARS_RADIUS_KM } from '@/features/globe/tiles';
import { decodeHeights } from '@/features/walk/heightGrid';
import { decodePng } from '@/features/walk/png';
import { fetchManifest, siteBaseUrl, type SiteIndexEntry, type SiteManifest } from '@/features/walk/sitePackage';
import { tr } from '@/shared/i18n/lang';

import type { HeightGrid, LonLat } from './routing';

const PIXEL_TOLERANCE = 2;

/** Паспорт участка с границами в градусах (долготы восточные, 0–360). */
export type SiteManifestBounds = SiteManifest & {
  bounds_lonlat: { west: number; south: number; east: number; north: number };
};

function east(lon: number): number {
  return ((lon % 360) + 360) % 360;
}

/** Ширина окна по долготе, градусы, с учётом перехода через 0° в. д. */
function lonSpan(west: number, eastEdge: number): number {
  return (east(eastEdge) - east(west) + 360) % 360;
}

/** Точка внутри границ участка; долготы приводятся к 0–360° в. д. */
export function siteContains(manifest: SiteManifestBounds, point: LonLat): boolean {
  const b = manifest.bounds_lonlat;
  if (!Number.isFinite(point.lon) || !Number.isFinite(point.lat)) return false;
  if (point.lat < b.south || point.lat > b.north) return false;
  return (east(point.lon) - east(b.west) + 360) % 360 <= lonSpan(b.west, b.east);
}

/** Первый участок индекса, паспорт которого загружен и содержит ВСЕ точки. */
export function findCoveringSite(
  index: SiteIndexEntry[],
  manifests: Map<string, SiteManifestBounds>,
  points: LonLat[],
): SiteIndexEntry | null {
  if (points.length === 0) return null;
  for (const entry of index) {
    const manifest = manifests.get(entry.id);
    if (manifest && points.every((p) => siteContains(manifest, p))) return entry;
  }
  return null;
}

/** Пикселей на градус: длина градуса по экватору Марса, м, делится на шаг пикселя, м. */
export function pixelsPerDegreeOf(pixelM: number): number {
  return (MARS_RADIUS_KM * 1000 * (Math.PI / 180)) / pixelM;
}

/** Проверяет согласованность размеров сетки с границами (допуск 2 пикселя); возвращает пикселей на градус. */
export function assertConsistent(manifest: SiteManifestBounds): number {
  const b = manifest.bounds_lonlat;
  const h = manifest.height;
  const ppd = pixelsPerDegreeOf(h.pixel_m);
  const widthPx = lonSpan(b.west, b.east) * ppd;
  const heightPx = (b.north - b.south) * ppd;
  if (Math.abs(widthPx - h.width) > PIXEL_TOLERANCE || Math.abs(heightPx - h.height) > PIXEL_TOLERANCE) {
    throw new Error(
      tr(
        `Границы участка ${manifest.id} не согласованы с сеткой: по границам ${widthPx.toFixed(1)}×${heightPx.toFixed(1)} пикс, ` +
          `в паспорте ${h.width}×${h.height} пикс при шаге ${h.pixel_m} м`,
        `Site ${manifest.id} bounds do not match the grid: ${widthPx.toFixed(1)}×${heightPx.toFixed(1)} px from the bounds, ` +
          `${h.width}×${h.height} px in the manifest at ${h.pixel_m} m step`,
      ),
    );
  }
  return ppd;
}

export async function loadLocalGrid(siteId: string, signal?: AbortSignal): Promise<HeightGrid> {
  const manifest = (await fetchManifest(siteId)) as SiteManifestBounds;
  if (!manifest.bounds_lonlat) throw new Error(tr(`В паспорте участка ${siteId} нет границ в градусах`, `Site ${siteId} manifest has no bounds in degrees`));
  const ppd = assertConsistent(manifest);
  const h = manifest.height;
  const res = await fetch(siteBaseUrl(siteId) + h.file, { signal });
  if (!res.ok) throw new Error(tr(`Высоты участка недоступны (${res.status})`, `Site heights unavailable (${res.status})`));
  const png = await decodePng(await res.arrayBuffer());
  if (png.width !== h.width || png.height !== h.height) throw new Error(tr('Размер height.png не совпадает с паспортом', 'height.png size does not match the manifest'));
  const decoded = decodeHeights(png.data, png.channels, png.width, png.height, h.base_m, h.step_m);
  return {
    width: png.width,
    height: png.height,
    pixelsPerDegree: ppd,
    heights: decoded.data,
    lonWestDeg: manifest.bounds_lonlat.west,
    latNorthDeg: manifest.bounds_lonlat.north,
    dataLevel: 'local_dtm',
  };
}
