// Ближайшая точка треков Perseverance и Curiosity к ломаной маршрута — для снимков с поверхности.
export interface LonLat {
  lon: number;
  lat: number;
}

export interface NearTrackHit {
  rover: 'perseverance' | 'curiosity';
  title: string;
  sol: number;
  distanceM: number;
  lon: number;
  lat: number;
}

interface TraverseFile {
  features: {
    properties: { sols: number[] };
    geometry: { coordinates: [number, number][] };
  }[];
}

const FILES: Record<NearTrackHit['rover'], string> = {
  perseverance: '/data/rovers/m20_traverse.geojson',
  curiosity: '/data/rovers/msl_traverse.geojson',
};
const TITLES: Record<NearTrackHit['rover'], string> = {
  perseverance: 'Perseverance',
  curiosity: 'Curiosity',
};
const MARS_RADIUS_M = 3_389_500;
const DEG = Math.PI / 180;

export function distanceM(a: LonLat, b: LonLat): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

let loading: Promise<Record<NearTrackHit['rover'], TraverseFile | null>> | null = null;

function loadTracks(): Promise<Record<NearTrackHit['rover'], TraverseFile | null>> {
  if (!loading) {
    loading = (async () => {
      const entries = await Promise.all(
        (Object.keys(FILES) as NearTrackHit['rover'][]).map(async (rover) => {
          try {
            const response = await fetch(FILES[rover]);
            return [rover, response.ok ? ((await response.json()) as TraverseFile) : null] as const;
          } catch {
            return [rover, null] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<NearTrackHit['rover'], TraverseFile | null>;
    })();
  }
  return loading;
}

function sampled(points: LonLat[], maxCount: number): LonLat[] {
  if (points.length <= maxCount) return points;
  const step = (points.length - 1) / (maxCount - 1);
  return Array.from({ length: maxCount }, (_, i) => points[Math.round(i * step)]);
}

/** Ближайшая к ломаной точка любого трека в пределах maxM; null — треки далеко или не загрузились. */
export async function findNearTrack(points: LonLat[], maxM: number): Promise<NearTrackHit | null> {
  if (points.length === 0) return null;
  const tracks = await loadTracks();
  const probes = sampled(points, 240);
  let best: NearTrackHit | null = null;
  for (const rover of Object.keys(tracks) as NearTrackHit['rover'][]) {
    const file = tracks[rover];
    if (!file) continue;
    for (const feature of file.features) {
      const coords = feature.geometry.coordinates;
      const sols = feature.properties.sols;
      for (let i = 0; i < coords.length; i++) {
        const at = { lon: coords[i][0], lat: coords[i][1] };
        for (const probe of probes) {
          const d = distanceM(probe, at);
          if (d <= maxM && (!best || d < best.distanceM)) {
            best = { rover, title: TITLES[rover], sol: sols[i] ?? 0, distanceM: d, ...at };
          }
        }
      }
    }
  }
  return best;
}
