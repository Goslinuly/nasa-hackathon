// Адреса главного экрана: '' — главная, #explore — шар, #<режим> и #<режим>/<параметр>.

export type ShellRoute =
  | { view: 'landing' }
  | { view: 'explore' }
  | { view: 'mode'; modeId: string; params: Record<string, string> };

export interface RouteModeInfo {
  id: string;
  paramKey?: string;
}

/** Ключ параметра из адреса, если режим не назвал свой. */
export const DEFAULT_PARAM_KEY = 'param';

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Разбор `location.hash`. Неизвестные якоря (#coverage и т.п.) — главная страница. */
export function parseHash(hash: string, modes: RouteModeInfo[]): ShellRoute {
  const raw = hash.replace(/^#/, '').trim();
  if (raw === '') return { view: 'landing' };
  if (raw === 'explore') return { view: 'explore' };
  const slash = raw.indexOf('/');
  const id = safeDecode(slash === -1 ? raw : raw.slice(0, slash));
  const mode = modes.find((m) => m.id === id);
  if (!mode) return { view: 'landing' };
  const params: Record<string, string> = {};
  const param = slash === -1 ? '' : safeDecode(raw.slice(slash + 1)).replace(/\/+$/, '');
  if (param !== '') params[mode.paramKey ?? DEFAULT_PARAM_KEY] = param;
  return { view: 'mode', modeId: mode.id, params };
}

/** Обратная операция: адрес для истории браузера ('' — главная). */
export function formatRoute(route: ShellRoute, modes: RouteModeInfo[]): string {
  if (route.view === 'landing') return '';
  if (route.view === 'explore') return '#explore';
  const mode = modes.find((m) => m.id === route.modeId);
  const param = route.params[mode?.paramKey ?? DEFAULT_PARAM_KEY];
  return param ? `#${encodeURIComponent(route.modeId)}/${encodeURIComponent(param)}` : `#${encodeURIComponent(route.modeId)}`;
}

/** На уровень выше: режим → шар → главная. */
export function parentRoute(route: ShellRoute): ShellRoute {
  return route.view === 'mode' ? { view: 'explore' } : { view: 'landing' };
}

/** Старые адреса отдельных страниц ведут на режимы единого экрана. */
export function legacyRedirect(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '');
  if (path === '/planner') return '/#route';
  if (path === '/atlas') return '/#atlas';
  return null;
}

export function sameRoute(a: ShellRoute, b: ShellRoute, modes: RouteModeInfo[]): boolean {
  return a.view === b.view && formatRoute(a, modes) === formatRoute(b, modes);
}
