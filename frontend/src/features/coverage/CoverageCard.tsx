import { useEffect, useState } from 'react';

import { ApiError, fetchCoverage } from '@/shared/api/client';
import type { CoverageResponse } from '@/shared/api/types';
import { formatMarsPoint, type MarsPoint } from '@/shared/coordinates/mars';

const DATA_LEVEL_LABEL: Record<CoverageResponse['data_level'], string> = {
  local_dtm: 'Подробный локальный рельеф',
  orbital_overview: 'Обзорное орбитальное покрытие',
  unassessed: 'Недостаточно данных для оценки',
};

/** Карточка покрытия для точки, выбранной на глобусе. */
export function CoverageCard({ point }: { point: MarsPoint | null }) {
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
            : 'Сервер недоступен. Запущен ли backend на порту 8001?',
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
          Кликните по любой точке планеты — сервис определит, какие данные реально
          доступны для этого направления: обзорная карта, подробный рельеф или
          пробел покрытия.
        </p>
      </div>
    );
  }

  return (
    <div className="coverage-card">
      <div className="coverage-head">
        <div>
          <span className="micro-label">Выбранная точка</span>
          <div className="coverage-point">{formatMarsPoint(point, 4)}</div>
        </div>
        {coverage && (
          <span className={`level-badge ${coverage.data_level}`}>
            {DATA_LEVEL_LABEL[coverage.data_level]}
          </span>
        )}
      </div>

      {loading && <p className="dim">Запрос покрытия…</p>}
      {error && <p className="error-text">{error}</p>}

      {coverage && !loading && (
        <>
          <p className="dim">{coverage.explanation}</p>

          <span className="micro-label">Обзорные продукты · кандидаты</span>
          <ul className="data-list">
            {coverage.overview_candidates.map((product) => (
              <li key={product.product_id ?? product.title}>
                <span>{product.title}</span>
                <span className="mono">
                  {product.resolution_m != null ? `${product.resolution_m} м/пикс` : '—'}
                </span>
              </li>
            ))}
          </ul>

          <span className="micro-label">Районы с кандидатными HiRISE DTM</span>
          <ul className="data-list">
            {coverage.local_candidates.map((region) => (
              <li key={region.slug}>
                <span>{region.name_ru}</span>
                <span className="mono">
                  {region.dtm_count} DTM
                  {region.best_dtm_resolution_m != null &&
                    ` · ${region.best_dtm_resolution_m.toFixed(2)} м/пикс`}
                </span>
              </li>
            ))}
          </ul>
          <p className="dim small">
            Кандидатные записи — зарегистрированные в каталоге продукты, а не
            подтверждённое покрытие этой точки. Footprints проверяются при импорте.
          </p>
        </>
      )}
    </div>
  );
}
