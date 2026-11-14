// Профиль высот маршрута Уотни по MOLA: SVG без библиотек, метки остановок и подсказка.
import { useMemo, useState } from 'react';

import { nearestProfileIndex, profileGeometry, type RouteStop } from './data';

interface RouteProfileProps {
  points: [number, number][];
  stops: RouteStop[];
  activeStopId: string | null;
}

const WIDTH = 320;
const HEIGHT = 150;

const fmt = (v: number) => Math.round(v).toLocaleString('ru-RU');

export function RouteProfile({ points, stops, activeStopId }: RouteProfileProps) {
  const geo = useMemo(() => profileGeometry(points, WIDTH, HEIGHT), [points]);
  const [hover, setHover] = useState<number | null>(null);
  const hovered = hover === null ? null : points[hover];

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * WIDTH;
    const total = points[points.length - 1]?.[0] ?? 0;
    const km = ((px - geo.x(0)) / (geo.x(total) - geo.x(0) || 1)) * total;
    setHover(nearestProfileIndex(points, Math.max(0, Math.min(total, km))));
  };

  return (
    <figure className="mt-profile">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Профиль высот маршрута по MOLA"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {geo.yTicks.map(t => (
          <g key={`y${t}`}>
            <line className="mt-grid" x1={geo.x(0)} x2={WIDTH - 8} y1={geo.y(t)} y2={geo.y(t)} />
            <text className="mt-tick" x={geo.x(0) - 6} y={geo.y(t) + 3} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        {geo.xTicks.map(t => (
          <text key={`x${t}`} className="mt-tick" x={geo.x(t)} y={HEIGHT - 6} textAnchor="middle">
            {fmt(t)}
          </text>
        ))}
        <path className="mt-area" d={geo.area} />
        <path className="mt-line" d={geo.path} />
        {stops.map(stop =>
          stop.route_km === null ? null : (
            <circle
              key={stop.id}
              className={`mt-stop${stop.id === activeStopId ? ' is-active' : ''}`}
              cx={geo.x(stop.route_km)}
              cy={geo.y(stop.elevation_m)}
              r={stop.id === activeStopId ? 4.5 : 3}
            >
              <title>{stop.name}</title>
            </circle>
          ),
        )}
        {hovered && (
          <g>
            <line className="mt-cursor" x1={geo.x(hovered[0])} x2={geo.x(hovered[0])} y1={8} y2={HEIGHT - 22} />
            <circle className="mt-stop is-active" cx={geo.x(hovered[0])} cy={geo.y(hovered[1])} r={3} />
          </g>
        )}
      </svg>
      <figcaption className="mt-dim">
        {hovered
          ? `${fmt(hovered[0])} км от Ares 3 · ${fmt(hovered[1])} м`
          : 'Высота, м над ареоидом · расстояние от Ares 3, км'}
      </figcaption>
    </figure>
  );
}
