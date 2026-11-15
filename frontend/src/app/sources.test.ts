import { describe, expect, it } from 'vitest';

import { SOURCE_GROUPS } from './sources';

describe('SOURCE_GROUPS', () => {
  it('у каждой группы есть записи, у каждой записи есть автор', () => {
    expect(SOURCE_GROUPS.length).toBeGreaterThan(5);
    for (const group of SOURCE_GROUPS) {
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(item.name).not.toBe('');
        expect(item.credit).not.toBe('');
      }
    }
  });

  it('ссылки абсолютные и не повторяются внутри записи', () => {
    for (const item of SOURCE_GROUPS.flatMap((group) => group.items)) {
      for (const link of item.links) expect(link.url).toMatch(/^https?:\/\//);
      expect(new Set(item.links.map((link) => link.url)).size).toBe(item.links.length);
    }
  });

  it('id групп уникальны, в тексте нет длинных тире', () => {
    expect(new Set(SOURCE_GROUPS.map((group) => group.id)).size).toBe(SOURCE_GROUPS.length);
    expect(JSON.stringify(SOURCE_GROUPS)).not.toContain('—');
  });

  it('есть ключевые источники из README', () => {
    const text = JSON.stringify(SOURCE_GROUPS);
    const keys = ['MOLA', 'CTX', 'Mars 2020 TRN', 'MMGIS', 'PIA19796', 'PIA19800', 'ISWA', 'GOES', 'DONKI', 'Mars24', 'Horizons', 'SIM 3292', 'Perseverance'];
    for (const key of keys) expect(text).toContain(key);
  });
});
