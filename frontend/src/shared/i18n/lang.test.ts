import { describe, expect, it } from 'vitest';

import { getLang, locale, pick, setLang, tr } from './lang';

describe('язык интерфейса', () => {
  it('tr, pick и locale следуют текущему языку', () => {
    setLang('en');
    expect(getLang()).toBe('en');
    expect(tr('Слои', 'Layers')).toBe('Layers');
    expect(pick('Гейл', 'Gale')).toBe('Gale');
    expect(pick('Гейл', undefined)).toBe('Гейл');
    expect(locale()).toBe('en-US');
    setLang('ru');
    expect(tr('Слои', 'Layers')).toBe('Слои');
    expect(pick('Гейл', 'Gale')).toBe('Гейл');
    expect(locale()).toBe('ru-RU');
  });
});
