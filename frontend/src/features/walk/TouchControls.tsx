// Сенсорное управление: джойстик слева — шаг, протяжка справа — взгляд.

import { useRef, useState } from 'react';
import { isTap } from './surfacePoint';

const RADIUS = 56;

export function Joystick({ onMove }: { onMove(x: number, y: number): void }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const center = useRef<{ x: number; y: number; id: number } | null>(null);

  const update = (e: React.PointerEvent) => {
    const c = center.current;
    if (!c || e.pointerId !== c.id) return;
    let dx = e.clientX - c.x;
    let dy = e.clientY - c.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    onMove(dx / RADIUS, -dy / RADIUS);
  };
  const end = () => {
    center.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      className="walk-joystick"
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={update}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="walk-joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

export function TouchLook({ onLook, onTap }: { onLook(dx: number, dy: number): void; onTap?(x: number, y: number): void }) {
  const last = useRef<{ x: number; y: number; id: number } | null>(null);
  // Начало касания: короткое касание без протяжки — выбор точки на поверхности, а не взгляд.
  const start = useRef<{ x: number; y: number; at: number; id: number } | null>(null);
  return (
    <div
      className="walk-touchlook"
      onPointerDown={(e) => {
        last.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        start.current = { x: e.clientX, y: e.clientY, at: performance.now(), id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const l = last.current;
        if (!l || l.id !== e.pointerId) return;
        onLook(e.clientX - l.x, e.clientY - l.y);
        last.current = { ...l, x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = start.current;
        last.current = null;
        start.current = null;
        if (s && s.id === e.pointerId && onTap && isTap(e.clientX - s.x, e.clientY - s.y, performance.now() - s.at)) {
          onTap(e.clientX, e.clientY);
        }
      }}
      onPointerCancel={() => {
        last.current = null;
        start.current = null;
      }}
    />
  );
}
