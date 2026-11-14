// Экран выхода (HUD) поверх вида от первого лица. Заглушка контракта: полную версию
// по docs/TZ_First_Person.md, раздел 6, делает отдельная задача; сигнатура не меняется.
import type { WalkState } from '@/app/modeContract';

export interface HudProps {
  state: WalkState;
}

export function Hud({ state }: HudProps) {
  return (
    <div className="hud-stub" style={{ position: 'absolute', top: 12, left: 12, color: '#fff' }}>
      {state.lat.toFixed(4)}°, {state.lonEast.toFixed(4)}° E · {Math.round(state.heightM)} м
    </div>
  );
}
