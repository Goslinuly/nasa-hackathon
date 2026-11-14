import { lazy } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { collectModes } from './collectModes';
import type { ModeDefinition } from './modeContract';

const Panel = lazy(async () => ({ default: () => null }));

function mode(id: string, order: number, extra: Partial<ModeDefinition> = {}): ModeDefinition {
  return { id, title: id, description: '', order, fullscreen: false, Panel, ...extra };
}

describe('collectModes', () => {
  it('сортирует по order и пропускает битые модули и дубли', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const modes = collectModes({
      '../features/b/mode.tsx': { mode: mode('walk', 30) },
      '../features/a/mode.tsx': { mode: mode('route', 10) },
      '../features/c/mode.tsx': {},
      '../features/d/mode.tsx': { mode: mode('route', 5) },
      '../features/e/mode.tsx': { mode: mode('explore', 1) },
    });
    expect(modes.map((m) => m.id)).toEqual(['route', 'walk']);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});
