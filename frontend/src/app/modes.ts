// Реестр режимов: оболочка сама находит features/*/mode.tsx, ничего регистрировать вручную не нужно.
import { collectModes, type ModeModule } from './collectModes';
import type { ModeDefinition } from './modeContract';

export const MODES: ModeDefinition[] = collectModes(
  import.meta.glob<ModeModule>('../features/*/mode.tsx', { eager: true }),
);

export const VISIBLE_MODES = MODES.filter((mode) => !mode.hidden);
