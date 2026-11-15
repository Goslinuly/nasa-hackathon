// Блок «Астронавт» в настройках прогулки: параметры человека и прыжок по модели.

import { useEffect, useState } from 'react';
// Прыжок — модель «та же работа ног» из crew.ts (tools/crew/README.md, docs/PHYSICS.md §6.6);
// мощность ходьбы — Santee с коридором марсианской тяжести (docs/PHYSICS.md §6.1, §6.4, §6.5)
// с массой тела W и грузом L из профиля.
import { G_MARS, jump } from '@/shared/eva/crew';
import { FLAT_SPEED_MS, marsPowerCorridorW, oxygenLpm, terrainFactor } from '@/shared/eva/traverse';
import { PROFILE_LIMITS, setCrewProfile, useCrewProfile, type CrewProfile } from '@/shared/eva/crewProfile';
import { getLang, useT } from '@/shared/i18n/lang';
import { eyeHeightM } from './jump';

export function fmtNum(v: number, digits: number): string {
  const s = v.toFixed(digits);
  return getLang() === 'en' ? s : s.replace('.', ',');
}

/** «Прыжок: 0,64 м · 1,1 с в воздухе (модель)». */
export function jumpNotice(r: { heightM: number; flightS: number }, t: (ru: string, en: string) => string): string {
  return t(
    `Прыжок: ${fmtNum(r.heightM, 2)} м · ${fmtNum(r.flightS, 1)} с в воздухе (модель)`,
    `Jump: ${fmtNum(r.heightM, 2)} m · ${fmtNum(r.flightS, 1)} s in the air (model)`,
  );
}

function NumberField({ label, value, scale, field, step }: {
  label: string;
  value: number;
  /** Множитель отображения: см для прыжка хранится в метрах. */
  scale: number;
  field: keyof CrewProfile;
  step: number;
}) {
  const [text, setText] = useState(String(Math.round(value * scale)));
  useEffect(() => setText(String(Math.round(value * scale))), [value, scale]);
  const [lo, hi] = PROFILE_LIMITS[field];
  return (
    <label className="walk-astro-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={lo * scale}
        max={hi * scale}
        step={step}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v) && v >= lo * scale && v <= hi * scale) setCrewProfile({ [field]: v / scale });
        }}
        onBlur={() => setText(String(Math.round(value * scale)))}
      />
    </label>
  );
}

export function AstronautSettings() {
  const t = useT();
  const p = useCrewProfile();
  const r = jump({ bodyKg: p.bodyKg, loadKg: p.loadKg, earthJumpM: p.earthJumpM });
  const rule = r.notes.find((n) => n.kind === 'rule');
  // Ровный плотный грунт, η = 1,0 (нижняя граница грунта), обе трактовки тяжести.
  const [eta] = terrainFactor('firm', FLAT_SPEED_MS);
  const [pLo, pHi] = marsPowerCorridorW(p.bodyKg, p.loadKg, FLAT_SPEED_MS, 0, eta);
  return (
    <div className="walk-astro">
      <strong>{t('Астронавт', 'Astronaut')}</strong>
      <div className="walk-astro-grid">
        <NumberField label={t('Рост, см', 'Height, cm')} value={p.heightCm} scale={1} field="heightCm" step={1} />
        <NumberField label={t('Вес, кг', 'Weight, kg')} value={p.bodyKg} scale={1} field="bodyKg" step={1} />
        <NumberField label={t('Скафандр с ранцем, кг', 'Suit with backpack, kg')} value={p.loadKg} scale={1} field="loadKg" step={1} />
        <NumberField label={t('Прыжок на Земле, см', 'Jump on Earth, cm')} value={p.earthJumpM} scale={100} field="earthJumpM" step={1} />
      </div>
      <p className="walk-muted">
        {t(
          `Прыжок на Марсе в скафандре: ${fmtNum(r.heightM, 2)} м, в воздухе ${fmtNum(r.flightS, 1)} с, скорость приземления ${fmtNum(r.landingMs, 1)} м/с (модель «та же работа ног», g = ${fmtNum(G_MARS, 2)} м/с²).`,
          `Jump on Mars in the suit: ${fmtNum(r.heightM, 2)} m, ${fmtNum(r.flightS, 1)} s in the air, landing speed ${fmtNum(r.landingMs, 1)} m/s (equal leg work model, g = ${fmtNum(G_MARS, 2)} m/s²).`,
        )}
      </p>
      <p className="walk-muted">
        {t(
          `Мощность на ровном при ${fmtNum(FLAT_SPEED_MS, 2)} м/с: ${Math.round(pLo)}–${Math.round(pHi)} Вт, кислород ${fmtNum(oxygenLpm(pLo), 2)}–${fmtNum(oxygenLpm(pHi), 2)} л/мин (модель Santee, вес и скафандр из профиля).`,
          `Power on level ground at ${FLAT_SPEED_MS.toFixed(2)} m/s: ${Math.round(pLo)}–${Math.round(pHi)} W, oxygen ${oxygenLpm(pLo).toFixed(2)}–${oxygenLpm(pHi).toFixed(2)} L/min (Santee model, weight and suit from the profile).`,
        )}
      </p>
      <p className="walk-muted">
        {t(
          `Высота глаз ${fmtNum(eyeHeightM(p.heightCm), 2)} м: 0,936 роста (модель). Прыжок — пробел или кнопка «Прыжок», только пешком.`,
          `Eye height ${fmtNum(eyeHeightM(p.heightCm), 2)} m: 0.936 of stature (model). Jump with Space or the Jump button, on foot only.`,
        )}
      </p>
      {rule && <p className="walk-astro-warn">{rule.text}</p>}
    </div>
  );
}
