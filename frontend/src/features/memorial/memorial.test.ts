// Тесты мемориала: полнота и корректность missions.json, свечи и ноты музыки.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { BELL_NOTES, CHORDS, midiToHz } from './ambient';
import { daysBetween, formatDate, missionProblems, readCandles, writeCandles, type MissionsFile } from './data';
import { setLang } from '@/shared/i18n/lang';

// Тексты проверяются на русском; английские — отдельными проверками.
setLang('ru');

const file = JSON.parse(
  readFileSync(new URL('../../../public/data/memorial/missions.json', import.meta.url), 'utf-8'),
) as MissionsFile;

describe('missions.json', () => {
  it('все обязательные миссии на месте', () => {
    const ids = file.missions.map(m => m.id);
    for (const id of ['sojourner', 'spirit', 'opportunity', 'ingenuity', 'viking1', 'viking2', 'phoenix', 'insight']) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('у каждой записи есть источники, координаты в диапазоне и даты', () => {
    for (const m of file.missions) {
      expect(missionProblems(m), m.id).toEqual([]);
    }
  });

  it('сверка с Mars24: Opportunity и Spirit', () => {
    const opp = file.missions.find(m => m.id === 'opportunity')!;
    expect(opp.lat).toBeCloseTo(-1.95, 2);
    expect(opp.lon).toBeCloseTo(354.47, 2);
    expect(opp.last_contact).toBe('2018-06-10');
    expect(opp.quote_note).toMatch(/не буквальное/);
    const spirit = file.missions.find(m => m.id === 'spirit')!;
    expect(spirit.last_contact).toBe('2010-03-22');
  });

  it('Zhurong подписан как миссия CNSA', () => {
    expect(file.missions.find(m => m.id === 'zhurong')?.agency).toBe('CNSA');
  });

  it('missionProblems ловит ошибки', () => {
    const bad = { ...file.missions[0], lat: 95, lon: -10, sources: ['http://x'] };
    expect(missionProblems(bad)).toHaveLength(3);
  });
});

describe('даты', () => {
  it('formatDate и daysBetween', () => {
    expect(formatDate('2004-01-25')).toBe('25 января 2004');
    setLang('en');
    expect(formatDate('2004-01-25')).toBe('January 25, 2004');
    setLang('ru');
    expect(daysBetween('2004-01-25', '2004-02-25')).toBe(31);
  });
});

describe('свечи', () => {
  it('записываются и читаются, битые данные не ломают панель', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    writeCandles(storage, new Set(['spirit']));
    expect([...readCandles(storage)]).toEqual(['spirit']);
    store.set('martian-map:memorial-candles', '{не json');
    expect(readCandles(storage).size).toBe(0);
    const throwing = {
      getItem: () => {
        throw new Error('нет доступа');
      },
      setItem: () => {
        throw new Error('нет доступа');
      },
    };
    expect(readCandles(throwing).size).toBe(0);
    expect(() => writeCandles(throwing, new Set(['x']))).not.toThrow();
    expect(readCandles(null).size).toBe(0);
  });
});

describe('музыка', () => {
  it('ноты в слышимом мягком диапазоне', () => {
    expect(midiToHz(69)).toBe(440);
    for (const note of [...CHORDS.flat(), ...BELL_NOTES]) {
      const hz = midiToHz(note);
      expect(hz).toBeGreaterThan(80);
      expect(hz).toBeLessThan(1000);
    }
  });
});

describe('определение режима', () => {
  it('id, порядок и боковая панель', async () => {
    const { mode } = await import('./mode');
    expect(mode.id).toBe('memorial');
    expect(mode.order).toBe(40);
    expect(mode.fullscreen).toBe(false);
    expect(mode.Panel).toBeTruthy();
  });
});
