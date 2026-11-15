// Карточка покрытия для точки, выбранной на глобусе.
import { useEffect, useState } from 'react';

import { ApiError, fetchCoverage } from '@/shared/api/client';
import type { CoverageResponse } from '@/shared/api/types';
import { formatMarsPoint, type MarsPoint } from '@/shared/coordinates/mars';
import { pick, tr, useT } from '@/shared/i18n/lang';

const DATA_LEVEL_LABEL: Record<CoverageResponse['data_level'], [string, string]> = {
  local_dtm: ['Подробный локальный рельеф', 'Detailed local terrain'],
  orbital_overview: ['Обзорное орбитальное покрытие', 'Orbital overview coverage'],
  unassessed: ['Недостаточно данных для оценки', 'Not enough data to assess'],
};

export function CoverageCard({ point }: { point: MarsPoint | null }) {
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const t = useT();

  useEffect(() => {
    if (!point) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCoverage(point.latitude_deg, point.longitude_deg)
      .then((response) => {
        if (!cancelled) setCoverage(response);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setCoverage(null);
        setError(
          requestError instanceof ApiError
            ? `${requestError.message} (${requestError.code})`
            : tr('Сервер недоступен. Проверьте, что backend запущен на порту 8001.', 'The server is unavailable. Check that the backend is running on port 8001.'),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [point]);

  if (!point) {
    return (
      <div className="coverage-card coverage-empty">
        <p>
          {t(
            'Нажмите на любую точку планеты. Здесь появится список данных для этого места: обзорные карты, подробный рельеф или пробел в покрытии.',
            'Click any point on the planet. The data available for that place will appear here: overview maps, detailed terrain or a gap in coverage.',
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="coverage-card">
      <div className="coverage-head">
        <div>
          <span className="micro-label">{t('Выбранная точка', 'Selected point')}</span>
          <div className="coverage-point">{formatMarsPoint(point, 4)}</div>
        </div>
        {coverage && (
          <span className={`level-badge ${coverage.data_level}`}>
            {t(...DATA_LEVEL_LABEL[coverage.data_level])}
          </span>
        )}
      </div>

      {loading && <p className="dim">{t('Запрос покрытия…', 'Loading coverage…')}</p>}
      {error && <p className="error-text">{error}</p>}

      {coverage && !loading && (
        <>
          <p className="dim">{coverage.explanation}</p>

          <span className="micro-label">{t('Обзорные продукты · кандидаты', 'Overview products · candidates')}</span>
          <ul className="data-list">
            {coverage.overview_candidates.map((product) => (
              <li key={product.product_id ?? product.title}>
                <span>{product.title}</span>
                <span className="mono">
                  {product.resolution_m != null ? `${product.resolution_m} ${t('м/пикс', 'm/px')}` : '—'}
                </span>
              </li>
            ))}
          </ul>

          <span className="micro-label">{t('Районы с кандидатными HiRISE DTM', 'Regions with candidate HiRISE DTMs')}</span>
          <ul className="data-list">
            {coverage.local_candidates.map((region) => (
              <li key={region.slug}>
                <span>{pick(region.name_ru, region.name_en)}</span>
                <span className="mono">
                  {region.dtm_count} DTM
                  {region.best_dtm_resolution_m != null &&
                    ` · ${region.best_dtm_resolution_m.toFixed(2)} ${t('м/пикс', 'm/px')}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="dim small">
            {t(
              'Эти записи взяты из каталога продуктов и не подтверждают, что снимок покрывает именно эту точку. Границы снимков проверяются при импорте.',
              'These entries come from the product catalog and do not confirm that an image covers this exact point. Image footprints are checked on import.',
            )}
          </p>
        </>
      )}
    </div>
  );
}
