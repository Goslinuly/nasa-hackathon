// Архив RAD на главной: что это за данные, итог за период, подробная таблица и технические заметки.
import { useEffect, useState } from 'react';

import { fetchRadAnalysis, fetchScienceIntake } from '@/shared/api/client';
import type { RadAnalysisResponse, ScienceIntake } from '@/shared/api/scienceTypes';
import { locale, tr, useT } from '@/shared/i18n/lang';

import './science.css';

const number = (value: number | null) => value == null ? tr('Нет данных', 'No data') : value.toLocaleString(locale(), { maximumFractionDigits: 3 });
const utc = (value: string) => value.replace('T', ' ').replace(/Z$/, ' UTC');

const CHANNELS = [
  { id: 'b', name: 'Детектор B', nameEn: 'Detector B', material: 'кремний', materialEn: 'silicon' },
  { id: 'e', name: 'Детектор E', nameEn: 'Detector E', material: 'пластик', materialEn: 'plastic' },
] as const;

const PDS_PRODUCT = 'https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DATA/SOL_03290_03423/RAD_RDR_2021_311_00_43_3290_V00.TXT';
const PDS_SIS = 'https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/DOCUMENT/RAD_RDR_SIS.HTM';

export function SciencePanel() {
  const t = useT();
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
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : tr('Не удалось загрузить данные RAD', 'Could not load RAD data')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  const analysis = result?.analysis;
  const uGy = t('мкГр', 'µGy');
  const uGyH = t('мкГр/ч', 'µGy/h');

  return <section className="section" id="science">
    <div className="section-head"><h2>{t('Архив радиации в кратере Гейл', 'Radiation archive in Gale crater')}</h2></div>
    <p className="section-intro">
      {t(
        'Здесь записи прибора RAD на марсоходе Curiosity за сол 3290, это 7 и 8 ноября 2021 года. RAD измеряет, сколько энергии излучения поглощает детектор за час. Это архив, а не текущие условия и не прогноз. Данные сняты только в кратере Гейл, поэтому выбор другой точки на шаре их не меняет.',
        'These are records from the RAD instrument on the Curiosity rover for sol 3290, November 7–8, 2021. RAD measures how much radiation energy a detector absorbs per hour. This is an archive, not current conditions and not a forecast. The data were taken only in Gale crater, so picking another point on the globe does not change them.',
      )}
    </p>

    <dl className="rad-glossary section-note">
      <div><dt>{t('Детектор B', 'Detector B')}</dt><dd>{t('кремниевый полупроводниковый детектор.', 'a silicon solid-state detector.')}</dd></div>
      <div><dt>{t('Детектор E', 'Detector E')}</dt><dd>{t('пластиковый сцинтиллятор. Пластик по составу ближе к тканям тела, чем кремний.', 'a plastic scintillator. Plastic is closer in composition to body tissue than silicon.')}</dd></div>
      <div><dt>{uGyH}</dt><dd>{t('мощность дозы, микрогрей в час. Грей равен одному джоулю излучения на килограмм вещества.', 'dose rate, micrograys per hour. One gray is one joule of radiation per kilogram of matter.')}</dd></div>
      <div><dt>{uGy}</dt><dd>{t('доза, накопленная за выбранный период: мощность × длительность в секундах / 3600.', 'dose accumulated over the selected period: rate × duration in seconds / 3600.')}</dd></div>
    </dl>
    <p className="section-note">{t('Это показания детекторов. Они не равны дозе, которую получил бы человек, и не говорят, безопасна ли прогулка.', 'These are detector readings. They are not the dose a person would receive and do not tell whether a walk is safe.')}</p>

    {loading && <p className="section-note" role="status">{t('Считаем…', 'Calculating…')}</p>}
    {error && <p className="section-note error-text" role="alert">{error}</p>}

    {result && analysis && <>
      <div className="rad-summary">
        <p className="rad-summary-period">
          {t('С', 'From')} {utc(analysis.start_utc)} {t('по', 'to')} {utc(analysis.end_utc)}. {t('Учтено', 'Used')} {analysis.selected_observations} {t('из', 'of')} {analysis.total_source_observations} {t('записей', 'records')};{' '}
          {t('исключено из-за флага качества', 'excluded by quality flag')}: {analysis.excluded_flagged_observations}.
        </p>
        {analysis.status === 'no_observations'
          ? <p className="rad-summary-empty">{t('В этом периоде с таким фильтром измерений нет. Это не значит, что доза равна нулю.', 'There are no measurements in this period with this filter. That does not mean the dose is zero.')}</p>
          : <div className="rad-summary-values">
            {CHANNELS.map(channel => <div key={channel.id}>
              <span className="rad-summary-label">{t(channel.name, channel.nameEn)} · {t(channel.material, channel.materialEn)}</span>
              <span className="rad-summary-big">{number(analysis[channel.id].dose_microgy)} <small>{uGy}</small></span>
              <span className="rad-summary-sub">{t('в среднем', 'average')} {number(analysis[channel.id].weighted_mean_rate_microgy_h)} {uGyH}</span>
            </div>)}
          </div>}
        <p className="rad-summary-period">
          {t('Измерено', 'Measured')}: {number(analysis.measured_duration_s / 3600)} {t('ч', 'h')}. {t('Без измерений с выбранным QC', 'No measurements with the selected QC')}: {number(analysis.unmeasured_duration_s / 3600)} {t('ч', 'h')}.{' '}
          {t('Временное покрытие', 'Time coverage')}: {number(analysis.coverage_fraction * 100)}%. {t('Промежутки без измерений не заполняются.', 'Gaps without measurements are not filled in.')}
        </p>
      </div>

      <div className="science-table-wrap"><table className="science-table">
        <caption>{t('Подробно по двум детекторам', 'Details for both detectors')}</caption>
        <thead><tr><th>{t('Детектор', 'Detector')}</th><th>{t('Доза за период, мкГр', 'Dose for the period, µGy')}</th><th>{t('Средняя мощность, мкГр/ч', 'Mean rate, µGy/h')}</th><th>{t('Минимум / максимум, мкГр/ч', 'Minimum / maximum, µGy/h')}</th></tr></thead>
        <tbody>{CHANNELS.map(channel => <tr key={channel.id}>
          <th>{channel.id.toUpperCase()} · {t(channel.material, channel.materialEn)}</th><td>{number(analysis[channel.id].dose_microgy)}</td>
          <td>{number(analysis[channel.id].weighted_mean_rate_microgy_h)}</td>
          <td>{number(analysis[channel.id].min_rate_microgy_h)} / {number(analysis[channel.id].max_rate_microgy_h)}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="section-note">{t('Средняя мощность взвешена по длительности: длинные измерения весят больше коротких.', 'The mean rate is weighted by duration: longer measurements count more than short ones.')}</p>
    </>}

    <form className="science-controls" onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const start = String(form.get('start') ?? '');
      const end = String(form.get('end') ?? '');
      if (start && end && start >= end) { setError(t('Конец периода должен быть позже начала', 'The end of the period must be after the start')); return; }
      setQuery({ start: start ? `${start}Z` : undefined, end: end ? `${end}Z` : undefined, include_flagged: String(includeFlagged) });
    }}>
      <h3>{t('Другой период', 'Another period')}</h3>
      <p className="section-note">{t('Пустые поля означают весь архив: с 7 ноября 2021, 00:43 UTC по 8 ноября, 01:16 UTC.', 'Empty fields mean the whole archive: from November 7, 2021, 00:43 UTC to November 8, 01:16 UTC.')}</p>
      <div className="science-fields">
        <label>{t('Начало, UTC', 'Start, UTC')}<input name="start" type="datetime-local" step="1" /></label>
        <label>{t('Конец, UTC', 'End, UTC')}<input name="end" type="datetime-local" step="1" /></label>
      </div>
      <label className="science-checkbox"><input type="checkbox" checked={includeFlagged} onChange={e => setIncludeFlagged(e.target.checked)} />{t('Учитывать записи с флагом качества (QC не 00000000)', 'Include records with a quality flag (QC not 00000000)')}</label>
      <div className="science-buttons">
        <button type="submit">{t('Рассчитать', 'Calculate')}</button>
        <button type="button" onClick={event => { event.currentTarget.form?.reset(); setIncludeFlagged(false); setQuery({ include_flagged: 'false' }); }}>{t('Весь период', 'Whole period')}</button>
      </div>
    </form>

    {result && <details><summary>{t('Все измерения по отдельности', 'All measurements individually')}</summary>
      <div className="science-table-wrap"><table className="science-table">
        <thead><tr><th>{t('Строка файла', 'File row')}</th><th>{t('Начало, UTC', 'Start, UTC')}</th><th>QC</th><th>{t('Учтено, с', 'Used, s')}</th><th>B, {uGyH}</th><th>E, {uGyH}</th><th>{t('Доза B, мкГр', 'Dose B, µGy')}</th><th>{t('Доза E, мкГр', 'Dose E, µGy')}</th></tr></thead>
        <tbody>{result.analysis.observations.map(row => <tr key={row.source_row}>
          <td>{row.source_row}</td><td>{row.interval_start_utc}</td><td>{row.qc}</td><td>{number(row.used_duration_s)}</td>
          <td>{number(row.rate_b_microgy_h)}</td><td>{number(row.rate_e_microgy_h)}</td><td>{number(row.dose_b_microgy)}</td><td>{number(row.dose_e_microgy)}</td>
        </tr>)}</tbody>
      </table></div>
    </details>}

    <details><summary>{t('Флаги качества (QC)', 'Quality flags (QC)')}</summary>
      <p className="section-note">
        {t(
          'У каждой записи RAD есть восьмибитный флаг качества. 00000000 значит, что проблем не найдено. 00000001 значит, что возможны неизвестные проблемы. В этом архиве так помечены 3 записи, по умолчанию они не учитываются. Описание флагов взято из ',
          'Each RAD record has an eight-bit quality flag. 00000000 means no problems were found. 00000001 means there may be unknown problems. Three records in this archive are flagged this way and are excluded by default. The flag description comes from the ',
        )}
        <a href={PDS_SIS} target="_blank" rel="noopener noreferrer">{t('документации продукта RAD (SIS)', 'RAD product documentation (SIS)')}</a>
        {t(', где флаг назван пока предварительным.', ', where the flag is still described as preliminary.')}
      </p>
    </details>

    {result && <details><summary>{t('Откуда данные и ограничения расчёта', 'Data origin and calculation limits')}</summary>
      <p className="section-note">
        {t('Таблица команды выписана из архивного продукта PDS ', "The team's table was transcribed from the PDS archive product ")}
        <a href={PDS_PRODUCT} target="_blank" rel="noopener noreferrer">RAD_RDR_2021_311_00_43_3290_V00</a>.{' '}
        {t('Все 87 строк совпадают с ним до пятого знака. Координат в продукте нет.', 'All 87 rows match it to the fifth decimal place. The product has no coordinates.')}
      </p>
      <p className="section-note">{result.dataset.source_file} · {t('лист', 'sheet')} {result.dataset.source_sheet} · {result.dataset.source_columns}</p>
      <p className="section-note science-hash">SHA-256: {result.dataset.source_sha256}</p>
      <ul className="section-note">{result.dataset.limitations.map(text => <li key={text}>{text}</li>)}</ul>
    </details>}

    {intake && <details><summary>{t('Какие файлы удалось импортировать', 'Which files were imported')}</summary>
      <ul className="section-note">{intake.sources.map(source => <li key={source.filename}><strong>{source.filename}</strong>: {source.reason}{source.duplicate_of && ` ${t('Оригинал', 'Original')}: ${source.duplicate_of}`}</li>)}</ul>
    </details>}
  </section>;
}
