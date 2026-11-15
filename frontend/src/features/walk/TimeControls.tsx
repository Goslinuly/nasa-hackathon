// Панель времени суток на Марсе: показания Солнца и режимы «реальное время» / «эксперимент».

import { useEffect, useRef, useState } from 'react';
import { formatSolClock, seasonLabel } from '@/features/sky/marsTime';
import { getLang, useT } from '@/shared/i18n/lang';
import type { WalkScene, SolarState } from './walkScene';

/** Местное истинное солнечное время, с которого начинаем, если на месте ночь. */
const START_LTST_IF_NIGHT = 9;
const NOTICE_MS = 12_000;

const PHASE_LABEL: Record<SolarState['phase'], [string, string]> = {
  day: ['день', 'day'],
  twilight: ['сумерки', 'twilight'],
  night: ['ночь', 'night'],
};

interface Props {
  scene: WalkScene | null;
  solar: SolarState | null;
}

export function TimeControls({ scene, solar }: Props) {
  const tt = useT();
  const [open, setOpen] = useState(false);
  const [experiment, setExperiment] = useState(false);
  // Если на месте сейчас ночь, грунт почти не виден. Стартуем утром и прямо говорим об этом.
  const [nightNotice, setNightNotice] = useState<string | null>(null);
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || !scene || !solar) return;
    decided.current = true;
    if (solar.phase !== 'night') return;
    setNightNotice(
      getLang() === 'en'
        ? `It is night here now (${formatSolClock(solar.ltstHours)} LTST). Showing the morning.`
        : `На месте сейчас ночь (${formatSolClock(solar.ltstHours)} LTST). Показано утро.`,
    );
    setExperiment(true);
    scene.setClockRunning(false);
    scene.setLtst(START_LTST_IF_NIGHT);
  }, [scene, solar]);
  useEffect(() => {
    if (!nightNotice) return;
    const t = window.setTimeout(() => setNightNotice(null), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [nightNotice]);

  const chooseMode = (exp: boolean) => {
    setExperiment(exp);
    setNightNotice(null);
    scene?.setClockRunning(!exp);
    if (!exp) scene?.setSimTime(Date.now());
  };

  if (!open || !solar) {
    return (
      <div className="walk-time">
        <button type="button" className="walk-btn" onClick={() => setOpen(true)}>
          {solar
            ? `${tt('Время', 'Time')} ${formatSolClock(solar.ltstHours)} · ${tt(...PHASE_LABEL[solar.phase])}${experiment ? ` · ${tt('эксперимент', 'experiment')}` : ''}`
            : tt('Время', 'Time')}
        </button>
        {nightNotice && (
          <p className="walk-time-note">
            {nightNotice}{' '}
            <button type="button" className="walk-link" onClick={() => chooseMode(false)}>{tt('Показать реальное время', 'Show real time')}</button>
          </p>
        )}
      </div>
    );
  }
  const fmt = (v: number, d: number) => (getLang() === 'en' ? v.toFixed(d) : v.toFixed(d).replace('.', ','));
  return (
    <div className="walk-time">
      <div className="walk-menu-row walk-time-head">
        <strong>{tt('Время на Марсе', 'Time on Mars')}</strong>
        <button type="button" className="walk-btn" onClick={() => setOpen(false)}>{tt('Свернуть', 'Collapse')}</button>
      </div>
      <dl className="walk-time-grid">
        <dt>{tt('Местное истинное солнечное время', 'Local true solar time')}</dt>
        <dd>{formatSolClock(solar.ltstHours)} LTST</dd>
        <dt>{tt('Сольная дата (MSD)', 'Mars Sol Date (MSD)')}</dt>
        <dd>{fmt(solar.msd, 2)} {tt('сол', 'sol')}</dd>
        <dt>{tt('Сезон', 'Season')}</dt>
        <dd>Ls {fmt(solar.ls, 1)}° · {seasonLabel(solar.ls)}</dd>
        <dt>{tt('Высота Солнца', 'Sun elevation')}</dt>
        <dd>{fmt(solar.elevationDeg, 1)}° · {tt(...PHASE_LABEL[solar.phase])}</dd>
        <dt>{tt('Поток на вершине атмосферы', 'Flux at top of atmosphere')}</dt>
        <dd>{Math.round(solar.irradianceWm2)} {tt('Вт/м²', 'W/m²')}</dd>
      </dl>
      <div className="walk-menu-row" role="group" aria-label={tt('Режим времени', 'Time mode')}>
        <button type="button" className={`walk-btn ${!experiment ? 'is-on' : ''}`} onClick={() => chooseMode(false)}>{tt('Реальное время Марса', 'Real Mars time')}</button>
        <button type="button" className={`walk-btn ${experiment ? 'is-on' : ''}`} onClick={() => chooseMode(true)}>{tt('Эксперимент', 'Experiment')}</button>
      </div>
      {experiment && (
        <>
          <label className="walk-time-slider">
            <span>{tt('Время суток', 'Time of day')}: {formatSolClock(solar.ltstHours)} LTST (0–24 {tt('ч', 'h')})</span>
            <input type="range" min={0} max={24} step={0.05} value={solar.ltstHours} onChange={(e) => scene?.setLtst(Number(e.target.value))} />
          </label>
          <div className="walk-menu-row">
            <button type="button" className="walk-btn" onClick={() => scene?.setSunCrossing(true)}>{tt('Рассвет', 'Sunrise')}</button>
            <button type="button" className="walk-btn" onClick={() => scene?.setLtst(12)}>{tt('Полдень', 'Noon')}</button>
            <button type="button" className="walk-btn" onClick={() => scene?.setSunCrossing(false)}>{tt('Закат', 'Sunset')}</button>
            <button type="button" className="walk-btn" onClick={() => scene?.setLtst(0)}>{tt('Полночь', 'Midnight')}</button>
          </div>
          <label className="walk-time-slider">
            <span>{tt('Пыль', 'Dust')}: τ = {fmt(solar.tau, 2)} ({tt('безразмерная', 'dimensionless')})</span>
            <input type="range" min={0.1} max={2} step={0.05} value={solar.tau} onChange={(e) => scene?.setTau(Number(e.target.value))} />
          </label>
        </>
      )}
      <p className="walk-muted">
        {tt(
          'Модель: Mars24 (Allison & McEwen). Панорама неба производная, её источник указывает команда. Оптическая толщина τ взята из модели, это не измерение.',
          'Model: Mars24 (Allison & McEwen). The sky panorama is derived; the team lists its source. Optical depth τ comes from a model, it is not a measurement.',
        )}
      </p>
    </div>
  );
}
