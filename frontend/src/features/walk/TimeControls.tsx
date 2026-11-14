// Панель времени суток на Марсе: показания Солнца и режимы «реальное время» / «эксперимент».

import { useState } from 'react';
import { formatSolClock, seasonLabel } from '@/features/sky/marsTime';
import type { WalkScene, SolarState } from './walkScene';

const PHASE_LABEL = { day: 'день', twilight: 'сумерки', night: 'ночь' } as const;

interface Props {
  scene: WalkScene | null;
  solar: SolarState | null;
}

export function TimeControls({ scene, solar }: Props) {
  const [open, setOpen] = useState(false);
  const [experiment, setExperiment] = useState(false);

  const chooseMode = (exp: boolean) => {
    setExperiment(exp);
    scene?.setClockRunning(!exp);
    if (!exp) scene?.setSimTime(Date.now());
  };

  if (!open || !solar) {
    return (
      <div className="walk-time">
        <button type="button" className="walk-btn" onClick={() => setOpen(true)}>
          {solar ? `Время ${formatSolClock(solar.ltstHours)} · ${PHASE_LABEL[solar.phase]}` : 'Время'}
        </button>
      </div>
    );
  }
  const fmt = (v: number, d: number) => v.toFixed(d).replace('.', ',');
  return (
    <div className="walk-time">
      <div className="walk-menu-row walk-time-head">
        <strong>Время на Марсе</strong>
        <button type="button" className="walk-btn" onClick={() => setOpen(false)}>Свернуть</button>
      </div>
      <dl className="walk-time-grid">
        <dt>Местное истинное солнечное время</dt>
        <dd>{formatSolClock(solar.ltstHours)} LTST</dd>
        <dt>Сольная дата (MSD)</dt>
        <dd>{fmt(solar.msd, 2)} сол</dd>
        <dt>Сезон</dt>
        <dd>Ls {fmt(solar.ls, 1)}° · {seasonLabel(solar.ls)}</dd>
        <dt>Высота Солнца</dt>
        <dd>{fmt(solar.elevationDeg, 1)}° · {PHASE_LABEL[solar.phase]}</dd>
        <dt>Поток на вершине атмосферы</dt>
        <dd>{Math.round(solar.irradianceWm2)} Вт/м²</dd>
      </dl>
      <div className="walk-menu-row" role="group" aria-label="Режим времени">
        <button type="button" className={`walk-btn ${!experiment ? 'is-on' : ''}`} onClick={() => chooseMode(false)}>Реальное время Марса</button>
        <button type="button" className={`walk-btn ${experiment ? 'is-on' : ''}`} onClick={() => chooseMode(true)}>Эксперимент</button>
      </div>
      {experiment && (
        <>
          <label className="walk-time-slider">
            <span>Время суток: {formatSolClock(solar.ltstHours)} LTST (0–24 ч)</span>
            <input type="range" min={0} max={24} step={0.05} value={solar.ltstHours} onChange={(e) => scene?.setLtst(Number(e.target.value))} />
          </label>
          <div className="walk-menu-row">
            <button type="button" className="walk-btn" onClick={() => scene?.setSunCrossing(true)}>Рассвет</button>
            <button type="button" className="walk-btn" onClick={() => scene?.setLtst(12)}>Полдень</button>
            <button type="button" className="walk-btn" onClick={() => scene?.setSunCrossing(false)}>Закат</button>
            <button type="button" className="walk-btn" onClick={() => scene?.setLtst(0)}>Полночь</button>
          </div>
          <label className="walk-time-slider">
            <span>Пыль: τ = {fmt(solar.tau, 2)} (безразмерная)</span>
            <input type="range" min={0.1} max={2} step={0.05} value={solar.tau} onChange={(e) => scene?.setTau(Number(e.target.value))} />
          </label>
        </>
      )}
      <p className="walk-muted">Модель: Mars24 (Allison &amp; McEwen). Панорама неба: производная, источник указывает команда. τ — модельная оптическая толщина, не измерение.</p>
    </div>
  );
}
