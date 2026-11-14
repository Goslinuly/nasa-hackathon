// Марсианские координаты: planetocentric широта и восточная долгота [0, 360), зеркало контракта backend.
export interface MarsPoint {
  body: 'Mars';
  latitude_deg: number;
  longitude_deg: number;
  height_m?: number | null;
  vertical_datum?: string | null;
}

export function normalizeLongitudeEast(longitudeDeg: number): number {
  const normalized = ((longitudeDeg % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function signedLongitudeDelta(fromDeg: number, toDeg: number): number {
  let delta =
    (normalizeLongitudeEast(toDeg) - normalizeLongitudeEast(fromDeg)) % 360;
  if (delta > 180) delta -= 360;
  else if (delta <= -180) delta += 360;
  return delta;
}

export function makeMarsPoint(latitudeDeg: number, longitudeDeg: number): MarsPoint {
  if (!Number.isFinite(latitudeDeg) || latitudeDeg < -90 || latitudeDeg > 90) {
    throw new RangeError(`Широта вне диапазона [-90, 90]: ${latitudeDeg}`);
  }
  if (!Number.isFinite(longitudeDeg)) {
    throw new RangeError(`Долгота не число: ${longitudeDeg}`);
  }
  return {
    body: 'Mars',
    latitude_deg: latitudeDeg,
    longitude_deg: normalizeLongitudeEast(longitudeDeg),
  };
}

export function formatMarsPoint(point: MarsPoint, digits = 2): string {
  const latAbs = Math.abs(point.latitude_deg).toFixed(digits);
  const latHemisphere = point.latitude_deg >= 0 ? 'N' : 'S';
  const lon = point.longitude_deg.toFixed(digits);
  return `${latAbs}°${latHemisphere}, ${lon}°E`;
}
