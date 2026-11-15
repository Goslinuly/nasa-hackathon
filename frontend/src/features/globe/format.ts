// Подписи разрешения и высоты для HUD и панелей.
import { locale, tr } from '@/shared/i18n/lang';

export function formatResolution(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} ${tr('км/пикс', 'km/px')}`;
  if (meters >= 10) return `${Math.round(meters)} ${tr('м/пикс', 'm/px')}`;
  return `${meters.toFixed(meters >= 1 ? 1 : 2)} ${tr('м/пикс', 'm/px')}`;
}

export function formatAltitude(km: number): string {
  if (km >= 100) return `${Math.round(km).toLocaleString(locale())} ${tr('км', 'km')}`;
  if (km >= 1) return `${km.toFixed(1)} ${tr('км', 'km')}`;
  return `${Math.round(km * 1000)} ${tr('м', 'm')}`;
}
