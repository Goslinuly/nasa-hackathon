import { useEffect, useMemo, useRef, useState } from 'react';

import type { RoutePoint } from './routing';

interface ElevationProfileProps {
  points: RoutePoint[];
  /** Индекс точки под курсором — чтобы показать её на глобусе. */
  onHover(index: number | null): void;
}

const HEIGHT = 150;
const PAD = { top: 10, right: 12, bottom: 24, left: 46 };

function niceStep(range: number, target: number): number {
  const raw = range / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit >= 5 ? 10 : unit >= 2 ? 5 : unit >= 1 ? 2 : 1) * power;
}

function ticks(min: number, max: number, target: number): number[] {
  if (max <= min) return [min];
  const step = niceStep(max - min, target);
  const result: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) result.push(v);
  return result;
}

const km = (m: number) => (m / 1000).toLocaleString('ru-RU', { maximumFractionDigits: m < 10_000 ? 1 : 0 });

/** Профиль высот маршрута: одна величина, одна ось, перекрестие с подсказкой. */
export function ElevationProfile({ points, onHover }: ElevationProfileProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width)));
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const length = points[points.length - 1]?.distanceM ?? 0;
    const heights = points.map((p) => p.heightM);
    const rawMin = Math.min(...heights);
    const rawMax = Math.max(...heights);
    const pad = Math.max(50, (rawMax - rawMin) * 0.08);
    const yMin = rawMin - pad;
    const yMax = rawMax + pad;
    const plotW = width - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const x = (d: number) => PAD.left + (length > 0 ? (d / length) * plotW : 0);
    const y = (h: number) => PAD.top + (1 - (h - yMin) / (yMax - yMin)) * plotH;
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.distanceM).toFixed(1)},${y(p.heightM).toFixed(1)}`).join('');
    const area = `${line}L${x(length).toFixed(1)},${PAD.top + plotH}L${PAD.left},${PAD.top + plotH}Z`;
    return { length, yMin, yMax, x, y, line, area, plotW, plotH };
  }, [points, width]);

  const { x, y, line, area, plotH, length } = geometry;
  const yTicks = ticks(geometry.yMin, geometry.yMax, 3);
  const xTicks = ticks(0, length, 4);

  const pick = (clientX: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const distance = ((clientX - rect.left - PAD.left) / geometry.plotW) * length;
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].distanceM < distance) lo = mid + 1;
      else hi = mid;
    }
    const index = lo > 0 && distance - points[lo - 1].distanceM < points[lo].distanceM - distance ? lo - 1 : lo;
    setActive(index);
    onHover(index);
  };

  const leave = () => {
    setActive(null);
    onHover(null);
  };

  const point = active != null ? points[active] : null;

  return (
    <div className="profile" ref={wrapRef}>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Профиль высот: от ${Math.round(geometry.yMin)} до ${Math.round(geometry.yMax)} м на ${km(length)} км`}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={leave}
      >
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line className="profile-grid" x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="profile-tick" x={PAD.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">
              {Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('ru-RU')} км` : `${v} м`}
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={`x${v}`} className="profile-tick" x={x(v)} y={HEIGHT - 6} textAnchor="middle">
            {km(v)}
          </text>
        ))}
        <path className="profile-area" d={area} />
        <path className="profile-line" d={line} />
        {point && (
          <g>
            <line className="profile-cursor" x1={x(point.distanceM)} x2={x(point.distanceM)} y1={PAD.top} y2={PAD.top + plotH} />
            <circle className="profile-dot" cx={x(point.distanceM)} cy={y(point.heightM)} r={4.5} />
          </g>
        )}
      </svg>
      {point && (
        <div
          className="profile-tooltip"
          style={{ left: Math.min(width - 150, Math.max(0, x(point.distanceM) - 70)) }}
        >
          <span>{km(point.distanceM)} км от A</span>
          <strong>{Math.round(point.heightM).toLocaleString('ru-RU')} м</strong>
          <span>уклон {point.slopeDeg.toFixed(1)}°</span>
        </div>
      )}
    </div>
  );
}
