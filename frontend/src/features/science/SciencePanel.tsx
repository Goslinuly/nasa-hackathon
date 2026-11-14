import { useEffect, useState } from 'react';

import { fetchRadAnalysis, fetchScienceIntake } from '@/shared/api/client';
import type { RadAnalysisResponse, ScienceIntake } from '@/shared/api/scienceTypes';

const number = (value: number | null) => value == null ? 'Нет данных' : value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });

export function SciencePanel() {
  const [result, setResult] = useState<RadAnalysisResponse | null>(null);
  const [intake, setIntake] = useState<ScienceIntake | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [includeFlagged, setIncludeFlagged] = useState(false);
  const [query, setQuery] = useState<{ start?: string; end?: string; include_flagged: string }>({ include_flagged: 'false' });

  useEffect(() => {
    let cancelled = false;
    fetchScienceIntake().then(value => { if (!cancelled) setIntake(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setResult(null);
    fetchRadAnalysis(query)
      .then(value => { if (!cancelled) setResult(value); })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить RAD'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  return <section className="section" id="science">
    <div className="section-head"><span className="section-number">_04</span><h2>Анализ архивных измерений RAD</h2></div>
    <p className="section-intro">Архивный набор команды. Координат в исходнике нет: выбор точки на глобусе не переносит на неё эти измерения. Первичный продукт NASA ещё не сверён. Это показания детекторов, без оценки безопасности Marswalk.</p>
    <form className="science-controls" onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const start = String(form.get('start') ?? '');
      const end = String(form.get('end') ?? '');
      if (start && end && start >= end) { setError('Конец периода должен быть позже начала'); return; }
      setQuery({ start: start ? `${start}Z` : undefined, end: end ? `${end}Z` : undefined, include_flagged: String(includeFlagged) });
    }}>
      <label>Начало (UTC)<input name="start" type="datetime-local" step="1" /></label>
      <label>Конец (UTC)<input name="end" type="datetime-local" step="1" /></label>
      <label className="science-checkbox"><input type="checkbox" checked={includeFlagged} onChange={e => setIncludeFlagged(e.target.checked)} />Включить записи с ненулевым QC</label>
      <button type="submit">Рассчитать</button>
      <button type="button" onClick={event => { event.currentTarget.form?.reset(); setIncludeFlagged(false); setQuery({ include_flagged: 'false' }); }}>Весь период</button>
    </form>
    <p className="dim">Пустые границы означают весь доступный период. Расчёт: скорость дозы × длительность / 3600, отдельно для каждого канала. Пробелы остаются без оценки.</p>
    {loading && <p role="status">Расчёт…</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    {result && <>
      <p>Период расчёта: {result.analysis.start_utc} — {result.analysis.end_utc}. Использовано {result.analysis.selected_observations} из {result.analysis.total_source_observations} записей набора; исключено по QC в периоде: {result.analysis.excluded_flagged_observations}.</p>
      {result.analysis.status === 'no_observations' && <p>В выбранном периоде с этим фильтром наблюдений нет. Это не нулевая доза.</p>}
      <div className="science-table-wrap"><table className="science-table">
        <caption>Производные результаты по выбранным интервалам наблюдения</caption>
        <thead><tr><th>Канал</th><th>Доза, мкГр</th><th>Средняя скорость с учётом длительности, мкГр/ч</th><th>Минимум / максимум, мкГр/ч</th></tr></thead>
        <tbody>{(['b', 'e'] as const).map(channel => <tr key={channel}>
          <th>{channel.toUpperCase()}</th><td>{number(result.analysis[channel].dose_microgy)}</td>
          <td>{number(result.analysis[channel].weighted_mean_rate_microgy_h)}</td>
          <td>{number(result.analysis[channel].min_rate_microgy_h)} / {number(result.analysis[channel].max_rate_microgy_h)}</td>
        </tr>)}</tbody>
      </table></div>
      <p>Измерено: {number(result.analysis.measured_duration_s / 3600)} ч. Без измерений с выбранным QC: {number(result.analysis.unmeasured_duration_s / 3600)} ч. Временное покрытие: {number(result.analysis.coverage_fraction * 100)}%.</p>
      <details><summary>Наблюдения и пересчитанные дозы</summary>
        <div className="science-table-wrap"><table className="science-table">
          <thead><tr><th>Строка XLSX</th><th>Начало UTC</th><th>QC</th><th>Учтено, с</th><th>B, мкГр/ч</th><th>E, мкГр/ч</th><th>Доза B, мкГр</th><th>Доза E, мкГр</th></tr></thead>
          <tbody>{result.analysis.observations.map(row => <tr key={row.source_row}>
            <td>{row.source_row}</td><td>{row.interval_start_utc}</td><td>{row.qc}</td><td>{number(row.used_duration_s)}</td>
            <td>{number(row.rate_b_microgy_h)}</td><td>{number(row.rate_e_microgy_h)}</td><td>{number(row.dose_b_microgy)}</td><td>{number(row.dose_e_microgy)}</td>
          </tr>)}</tbody>
        </table></div>
      </details>
      <details><summary>Источник и ограничения расчёта</summary>
        <p>{result.dataset.source_file} · лист {result.dataset.source_sheet} · {result.dataset.source_columns}</p>
        <p className="science-hash">SHA-256: {result.dataset.source_sha256}</p>
        <ul>{result.dataset.limitations.map(text => <li key={text}>{text}</li>)}</ul>
      </details>
    </>}
    {intake && <details><summary>Что удалось импортировать из пяти файлов</summary>
      <ul>{intake.sources.map(source => <li key={source.filename}><strong>{source.filename}</strong>: {source.reason}{source.duplicate_of && ` Оригинал: ${source.duplicate_of}`}</li>)}</ul>
    </details>}
  </section>;
}
