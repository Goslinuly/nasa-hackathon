// Сгущение ломаной по дугам большого круга, чтобы длинные отрезки шли по поверхности шара, а не сквозь него.

export interface PathPoint {
  lon: number;
  lat: number;
}

const RAD = Math.PI / 180;

function toUnit({ lon, lat }: PathPoint): [number, number, number] {
  const cl = Math.cos(lat * RAD);
  return [cl * Math.cos(lon * RAD), Math.sin(lat * RAD), cl * Math.sin(lon * RAD)];
}

export function densifyPath(points: PathPoint[], maxStepDeg: number): PathPoint[] {
  const valid = points.filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat));
  if (valid.length < 2) return valid;
  const out: PathPoint[] = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    const a = toUnit(valid[i - 1]);
    const b = toUnit(valid[i]);
    const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const angle = Math.acos(dot);
    const steps = Math.ceil(angle / RAD / maxStepDeg - 1e-9);
    if (steps > 1 && Math.sin(angle) > 1e-9) {
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const wa = Math.sin((1 - t) * angle) / Math.sin(angle);
        const wb = Math.sin(t * angle) / Math.sin(angle);
        const x = a[0] * wa + b[0] * wb;
        const y = a[1] * wa + b[1] * wb;
        const z = a[2] * wa + b[2] * wb;
        out.push({ lon: Math.atan2(z, x) / RAD, lat: Math.atan2(y, Math.hypot(x, z)) / RAD });
      }
    }
    out.push(valid[i]);
  }
  return out;
}
