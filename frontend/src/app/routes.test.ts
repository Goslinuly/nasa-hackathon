import { describe, expect, it } from 'vitest';

import { formatRoute, legacyRedirect, parentRoute, parseHash, type ShellRoute } from './routes';

const MODES = [{ id: 'route' }, { id: 'walk', paramKey: 'site' }, { id: 'atlas' }];

describe('parseHash', () => {
  it('пустой адрес — главная', () => {
    expect(parseHash('', MODES)).toEqual({ view: 'landing' });
    expect(parseHash('#', MODES)).toEqual({ view: 'landing' });
  });

  it('#explore — шар', () => {
    expect(parseHash('#explore', MODES)).toEqual({ view: 'explore' });
  });

  it('режим без параметра', () => {
    expect(parseHash('#route', MODES)).toEqual({ view: 'mode', modeId: 'route', params: {} });
  });

  it('параметр попадает под ключ режима', () => {
    expect(parseHash('#walk/gale-boxwork', MODES)).toEqual({
      view: 'mode',
      modeId: 'walk',
      params: { site: 'gale-boxwork' },
    });
  });

  it('без paramKey — ключ param, кодировка снимается', () => {
    expect(parseHash('#atlas/%D0%93%D0%B5%D0%B9%D0%BB', MODES)).toEqual({
      view: 'mode',
      modeId: 'atlas',
      params: { param: 'Гейл' },
    });
  });

  it('неизвестный якорь — главная (якоря разделов страницы)', () => {
    expect(parseHash('#coverage', MODES)).toEqual({ view: 'landing' });
    expect(parseHash('#nope/x', MODES)).toEqual({ view: 'landing' });
  });

  it('битая кодировка не роняет разбор', () => {
    expect(parseHash('#walk/%E0%A4%A', MODES)).toEqual({ view: 'mode', modeId: 'walk', params: { site: '%E0%A4%A' } });
  });

  it('пустой параметр после слэша игнорируется', () => {
    expect(parseHash('#walk/', MODES)).toEqual({ view: 'mode', modeId: 'walk', params: {} });
  });
});

describe('formatRoute', () => {
  const cases: [ShellRoute, string][] = [
    [{ view: 'landing' }, ''],
    [{ view: 'explore' }, '#explore'],
    [{ view: 'mode', modeId: 'route', params: {} }, '#route'],
    [{ view: 'mode', modeId: 'walk', params: { site: 'gale-boxwork' } }, '#walk/gale-boxwork'],
  ];
  it.each(cases)('%j → %s', (route, hash) => {
    expect(formatRoute(route, MODES)).toBe(hash);
    expect(parseHash(hash, MODES)).toEqual(route);
  });
});

describe('parentRoute', () => {
  it('режим → шар → главная', () => {
    expect(parentRoute({ view: 'mode', modeId: 'route', params: {} })).toEqual({ view: 'explore' });
    expect(parentRoute({ view: 'explore' })).toEqual({ view: 'landing' });
    expect(parentRoute({ view: 'landing' })).toEqual({ view: 'landing' });
  });
});

describe('legacyRedirect', () => {
  it('старые страницы ведут на режимы', () => {
    expect(legacyRedirect('/planner')).toBe('/#route');
    expect(legacyRedirect('/planner/')).toBe('/#route');
    expect(legacyRedirect('/atlas')).toBe('/#atlas');
    expect(legacyRedirect('/')).toBeNull();
  });
});
