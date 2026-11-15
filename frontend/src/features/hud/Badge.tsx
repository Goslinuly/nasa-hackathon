// Метка происхождения значения и строка «подпись — значение — метка» с подсказкой.
import type { ReactNode } from 'react';

import type { Provenance } from '@/app/modeContract';
import { useT } from '@/shared/i18n/lang';

const LABEL: Record<Provenance, [string, string]> = {
  data: ['данные', 'data'],
  archive: ['архив', 'archive'],
  model: ['модель', 'model'],
  nodata: ['нет данных', 'no data'],
};

export function Badge({ prov, date, tip }: { prov: Provenance; date?: string; tip: string }) {
  const t = useT();
  const text = prov === 'archive' && date ? `${t('архив', 'archive')} ${date}` : t(...LABEL[prov]);
  return (
    <span className={`hud-badge hud-badge--${prov}`} title={tip} tabIndex={-1}>
      {text}
    </span>
  );
}

export interface RowProps {
  label?: ReactNode;
  value: ReactNode;
  prov: Provenance;
  date?: string;
  tip: string;
  tone?: 'ok' | 'warn' | 'danger';
}

export function Row({ label, value, prov, date, tip, tone }: RowProps) {
  return (
    <div className={`hud-row${tone ? ` hud-row--${tone}` : ''}`}>
      {label !== undefined && <span className="hud-label">{label}</span>}
      <span className="hud-value">{value}</span>
      <Badge prov={prov} date={date} tip={tip} />
    </div>
  );
}
