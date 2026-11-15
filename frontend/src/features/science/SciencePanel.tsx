// Архив RAD на главной: что это за данные, итог за период, подробная таблица и технические заметки.
import { useEffect, useState } from 'react';

import { fetchRadAnalysis, fetchScienceIntake } from '@/shared/api/client';
import type { RadAnalysisResponse, ScienceIntake } from '@/shared/api/scienceTypes';

import './science.css';

const number = (value: number | null) => value == null ? 'Нет данных' : value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const utc = (value: string) => value.replace('T', ' ').replace(/Z$/, ' UTC');

const CHANNELS = [
  { id: 'b', name: 'Детектор B', material: 'кремний' },
  { id: 'e', name: 'Детектор E', material: 'пластик' },
] as const;

const PDS_PRODUCT = 'https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DATA/SOL_03290_03423/RAD_RDR_2021_311_00_43_3290_V00.TXT';
const PDS_SIS = 'https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DOCUMENT/RAD_RDR_SIS.HTM';

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
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить данные RAD'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  const analysis = result?.analysis;

  return <section className="section" id="science">
    <div className="section-head"><h2>Архив радиации в кратере Гейл</h2></div>
    <p className="section-intro">
      Здесь записи прибора RAD на марсоходе Curiosity за сол 3290, это 7 и 8 ноября 2021 года.
      RAD измеряет, сколько энергии излучения поглощает детектор за час. Это архив, а не текущие
      условия и не прогноз. Данные сняты только в кратере Гейл, поэтому выбор другой точки на шаре
      их не меняет.
    </p>

    <dl className="rad-glossary section-note">
      <div><dt>Детектор B</dt><dd>кремниевый полупроводниковый детектор.</dd></div>
      <div><dt>Детектор E</dt><dd>пластиковый сцинтиллятор. Пластик по составу ближе к тканям тела, чем кремний.</dd></div>
      <div><dt>мкГр/ч</dt><dd>мощность дозы, микрогрей в час. Грей равен одному джоулю излучения на килограмм вещества.</dd></div>
      <div><dt>мкГр</dt><dd>доза, накопленная за выбранный период: мощность × длительность в секундах / 3600.</dd></div>
    </dl>
    <p className="section-note">Это показания детекторов. Они не равны дозе, которую получил бы человек, и не говорят, безопасна ли прогулка.</p>

    {loading && <p className="section-note" role="status">Считаем…</p>}
    {error && <p className="section-note error-text" role="alert">{error}</p>}

    {result && analysis && <>
      <div className="rad-summary">
        <p className="rad-summary-period">
          С {utc(analysis.start_utc)} по {utc(analysis.end_utc)}. Учтено {analysis.selected_observations} из {analysis.total_source_observations} записей;
          исключено из-за флага качества: {analysis.excluded_flagged_observations}.
        </p>
        {analysis.status === 'no_observations'
          ? <p className="rad-summary-empty">В этом периоде с таким фильтром измерений нет. Это не значит, что доза равна нулю.</p>
          : <div className="rad-summary-values">
            {CHANNELS.map(channel => <div key={channel.id}>
              <span className="rad-summary-label">{channel.name} · {channel.material}</span>
              <span className="rad-summary-big">{number(analysis[channel.id].dose_microgy)} <small>мкГр</small></span>
              <span className="rad-summary-sub">в среднем {number(analysis[channel.id].weighted_mean_rate_microgy_h)} мкГр/ч</span>
            </div>)}
          </div>}
        <p className="rad-summary-period">
          Измерено: {number(analysis.measured_duration_s / 3600)} ч. Без измерений с выбранным QC: {number(analysis.unmeasured_duration_s / 3600)} ч.
          Временное покрытие: {number(analysis.coverage_fraction * 100)}%. Промежутки без измерений не заполняются.
        </p>
      </div>

      <div className="science-table-wrap"><table className="science-table">
        <caption>Подробно по двум детекторам</caption>
        <thead><tr><th>Детектор</th><th>Доза за период, мкГр</th><th>Средняя мощность, мкГр/ч</th><th>Минимум / максимум, мкГр/ч</th></tr></thead>
        <tbody>{CHANNELS.map(channel => <tr key={channel.id}>
          <th>{channel.id.toUpperCase()} · {channel.material}</th><td>{number(analysis[channel.id].dose_microgy)}</td>
          <td>{number(analysis[channel.id].weighted_mean_rate_microgy_h)}</td>
          <td>{number(analysis[channel.id].min_rate_microgy_h)} / {number(analysis[channel.id].max_rate_microgy_h)}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="section-note">Средняя мощность взвешена по длительности: длинные измерения весят больше коротких.</p>
    </>}

    <form className="science-controls" onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const start = String(form.get('start') ?? '');
      const end = String(form.get('end') ?? '');
      if (start && end && start >= end) { setError('Конец периода должен быть позже начала'); return; }
      setQuery({ start: start ? `${start}Z` : undefined, end: end ? `${end}Z` : undefined, include_flagged: String(includeFlagged) });
    }}>
      <h3>Другой период</h3>
      <p className="section-note">Пустые поля означают весь архив: с 7 ноября 2021, 00:43 UTC по 8 ноября, 01:16 UTC.</p>
      <div className="science-fields">
        <label>Начало, UTC<input name="start" type="datetime-local" step="1" /></label>
        <label>Конец, UTC<input name="end" type="datetime-local" step="1" /></label>
      </div>
      <label className="science-checkbox"><input type="checkbox" checked={includeFlagged} onChange={e => setIncludeFlagged(e.target.checked)} />Учитывать записи с флагом качества (QC не 00000000)</label>
      <div className="science-buttons">
        <button type="submit">Рассчитать</button>
        <button type="button" onClick={event => { event.currentTarget.form?.reset(); setIncludeFlagged(false); setQuery({ include_flagged: 'false' }); }}>Весь период</button>
      </div>
    </form>

    {result && <details><summary>Все измерения по отдельности</summary>
      <div className="science-table-wrap"><table className="science-table">
        <thead><tr><th>Строка файла</th><th>Начало, UTC</th><th>QC</th><th>Учтено, с</th><th>B, мкГр/ч</th><th>E, мкГр/ч</th><th>Доза B, мкГр</th><th>Доза E, мкГр</th></tr></thead>
        <tbody>{result.analysis.observations.map(row => <tr key={row.source_row}>
          <td>{row.source_row}</td><td>{row.interval_start_utc}</td><td>{row.qc}</td><td>{number(row.used_duration_s)}</td>
          <td>{number(row.rate_b_microgy_h)}</td><td>{number(row.rate_e_microgy_h)}</td><td>{number(row.dose_b_microgy)}</td><td>{number(row.dose_e_microgy)}</td>
        </tr>)}</tbody>
      </table></div>
    </details>}

    <details><summary>Флаги качества (QC)</summary>
      <p className="section-note">
        У каждой записи RAD есть восьмибитный флаг качества. 00000000 значит, что проблем не найдено.
        00000001 значит, что возможны неизвестные проблемы. В этом архиве так помечены 3 записи, по умолчанию
        они не учитываются. Описание флагов взято из <a href={PDS_SIS} target="_blank" rel="noopener noreferrer">документации продукта RAD (SIS)</a>,
        где флаг назван пока предварительным.
      </p>
    </details>

    {result && <details><summary>Откуда данные и ограничения расчёта</summary>
      <p className="section-note">
        Таблица команды выписана из архивного продукта PDS <a href={PDS_PRODUCT} target="_blank" rel="noopener noreferrer">RAD_RDR_2021_311_00_43_3290_V00</a>.
        Все 87 строк совпадают с ним до пятого знака. Координат в продукте нет.
      </p>
      <p className="section-note">{result.dataset.source_file} · лист {result.dataset.source_sheet} · {result.dataset.source_columns}</p>
      <p className="section-note science-hash">SHA-256: {result.dataset.source_sha256}</p>
      <ul className="section-note">{result.dataset.limitations.map(text => <li key={text}>{text}</li>)}</ul>
    </details>}

    {intake && <details><summary>Какие файлы удалось импортировать</summary>
      <ul className="section-note">{intake.sources.map(source => <li key={source.filename}><strong>{source.filename}</strong>: {source.reason}{source.duplicate_of && ` Оригинал: ${source.duplicate_of}`}</li>)}</ul>
    </details>}
  </section>;
}
