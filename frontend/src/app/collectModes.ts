// Сбор режимов из найденных модулей: проверка, дубли, порядок.
import type { ModeDefinition } from './modeContract';

export type ModeModule = { mode?: ModeDefinition };

function isMode(value: unknown): value is ModeDefinition {
  const mode = value as ModeDefinition | undefined;
  return (
    !!mode &&
    typeof mode.id === 'string' &&
    mode.id !== '' &&
    mode.id !== 'explore' &&
    typeof mode.title === 'string' &&
    typeof mode.Panel === 'object' &&
    mode.Panel !== null
  );
}

/** Режимы из модулей: без дублей id, по возрастанию order. */
export function collectModes(modules: Record<string, ModeModule>): ModeDefinition[] {
  const byId = new Map<string, ModeDefinition>();
  for (const [path, module] of Object.entries(modules).sort(([a], [b]) => a.localeCompare(b))) {
    if (!isMode(module.mode)) {
      console.warn(`[режимы] ${path}: нет корректного export const mode`);
      continue;
    }
    if (byId.has(module.mode.id)) {
      console.warn(`[режимы] ${path}: id «${module.mode.id}» уже занят`);
      continue;
    }
    byId.set(module.mode.id, module.mode);
  }
  return [...byId.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

