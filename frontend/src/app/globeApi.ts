// GlobeApi для одного режима: слои режима живут в своём пространстве имён и снимаются при выходе.
import type { LonLat as EngineLonLat, MarsGlobeEngine } from '@/features/globe/engine';

import type { GlobeApi, LonLat } from './modeContract';

export type PickHandler = (point: LonLat) => void;

export interface PickSlot {
  current: PickHandler | null;
}

export interface ScopedGlobeApi extends GlobeApi {
  /** Убрать все линии, метки и обработчик клика этого режима. */
  release(): void;
}

const lonEast = (lon: number) => ((lon % 360) + 360) % 360;

export function createScopedGlobeApi(engine: MarsGlobeEngine, scope: string, pick: PickSlot): ScopedGlobeApi {
  const lines = new Set<string>();
  const markers = new Set<string>();
  let roverSet = false;
  let ownHandler: PickHandler | null = null;
  const key = (layerId: string) => `${scope}:${layerId}`;

  return {
    flyTo(target, durationMs = 1500) {
      return engine.flyTo(target.lon, target.lat, target.altitude ?? 0.35, durationMs);
    },
    setLines(layerId, value) {
      engine.setLines(key(layerId), value);
      if (value) lines.add(layerId);
      else lines.delete(layerId);
    },
    setMarkers(layerId, value, onClick) {
      engine.setMarkers(key(layerId), value, onClick);
      if (value) markers.add(layerId);
      else markers.delete(layerId);
    },
    setRoverRoute(value) {
      roverSet = Boolean(value && value.length > 1);
      return engine.setRoverRoute(value);
    },
    onPick(handler) {
      ownHandler = handler ? (point: EngineLonLat) => handler({ lon: lonEast(point.lon), lat: point.lat }) : null;
      pick.current = ownHandler;
    },
    release() {
      lines.forEach((id) => engine.setLines(key(id), null));
      markers.forEach((id) => engine.setMarkers(key(id), null));
      if (roverSet) {
        engine.setRoverRoute(null);
        roverSet = false;
      }
      lines.clear();
      markers.clear();
      if (ownHandler && pick.current === ownHandler) pick.current = null;
      ownHandler = null;
    },
  };
}
