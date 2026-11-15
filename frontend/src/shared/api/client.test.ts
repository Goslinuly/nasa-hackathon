import { afterEach, describe, expect, it, vi } from 'vitest';

import { setLang } from '@/shared/i18n/lang';

import { ApiError, apiUrl, fetchCoverage, fetchWalkback } from './client';

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  setLang('ru');
});

describe('язык запросов к API', () => {
  it('apiUrl добавляет текущий язык к параметрам', () => {
    setLang('en');
    const url = apiUrl('/coverage', { lat: 18.4, lon: 77.5 });
    expect(url.searchParams.get('lang')).toBe('en');
    expect(url.searchParams.get('lat')).toBe('18.4');
    setLang('ru');
    expect(apiUrl('/eva/slopes').searchParams.get('lang')).toBe('ru');
  });

  it('GET и POST уходят с ?lang= текущего языка', async () => {
    const fetchMock = vi.fn(async () => okJson({}));
    vi.stubGlobal('fetch', fetchMock);
    setLang('en');

    await fetchCoverage(18.4, 77.5);
    await fetchWalkback({ points: [{ distance_from_base_m: 100 }], o2_remaining_l: 300 });

    const urls = fetchMock.mock.calls.map((call) => new URL(String((call as unknown[])[0])));
    expect(urls.map((u) => u.pathname)).toEqual(['/api/v1/coverage', '/api/v1/eva/walkback']);
    expect(urls.every((u) => u.searchParams.get('lang') === 'en')).toBe(true);
  });

  it('сообщение nginx о недоступном API переводится на английский', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { code: 'api_unreachable', message: 'API недоступен.' } }),
            { status: 503 },
          ),
      ),
    );
    setLang('en');
    const error = await fetchCoverage(0, 0).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toMatch(/^The API is unreachable/);
  });
});
