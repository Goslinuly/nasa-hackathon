// Подписи разрешения и высоты для HUD и панелей.

export function formatResolution(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} км/пикс`;
  if (meters >= 10) return `${Math.round(meters)} м/пикс`;
  return `${meters.toFixed(meters >= 1 ? 1 : 2)} м/пикс`;
}

export function formatAltitude(km: number): string {
  if (km >= 100) return `${Math.round(km).toLocaleString('ru-RU')} км`;
  if (km >= 1) return `${km.toFixed(1)} км`;
  return `${Math.round(km * 1000)} м`;
}
