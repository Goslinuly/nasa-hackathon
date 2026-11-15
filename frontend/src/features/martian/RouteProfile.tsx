// Профиль высот маршрута Уотни по MOLA: SVG без библиотек, метки остановок и подсказка.
import { useMemo, useState } from 'react';

import { locale, pick, useT } from '@/shared/i18n/lang';

import { nearestProfileIndex, profileGeometry, type RouteStop } from './data';

interface RouteProfileProps {
  points: [number, number][];
  stops: RouteStop[];
  activeStopId: string | null;
}

const WIDTH = 320;
const HEIGHT = 150;

const fmt = (v: number) => Math.round(v).toLocaleString(locale());

export function RouteProfile({ points, stops, activeStopId }: RouteProfileProps) {
  const t = useT();
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
        aria-label={t('Профиль высот маршрута по MOLA', 'Route elevation profile from MOLA')}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {geo.yTicks.map(v => (
          <g key={`y${v}`}>
            <line className="mt-grid" x1={geo.x(0)} x2={WIDTH - 8} y1={geo.y(v)} y2={geo.y(v)} />
            <text className="mt-tick" x={geo.x(0) - 6} y={geo.y(v) + 3} textAnchor="end">
              {fmt(v)}
            </text>
          </g>
        ))}
        {geo.xTicks.map(v => (
          <text key={`x${v}`} className="mt-tick" x={geo.x(v)} y={HEIGHT - 6} textAnchor="middle">
            {fmt(v)}
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
              <title>{pick(stop.name, stop.name_en)}</title>
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
          ? t(`${fmt(hovered[0])} км от Ares 3 · ${fmt(hovered[1])} м`, `${fmt(hovered[0])} km from Ares 3 · ${fmt(hovered[1])} m`)
          : t('Высота, м над ареоидом · расстояние от Ares 3, км', 'Elevation, m above the areoid · distance from Ares 3, km')}
      </figcaption>
    </figure>
  );
}
