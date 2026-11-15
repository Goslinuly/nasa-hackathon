// Сворачиваемая прокручиваемая легенда геологических юнитов с кредитом и статусом данных.
import { pick, useT } from '@/shared/i18n/lang';

import type { GeologyLegend as Legend } from './geology';

export function GeologyLegend({ legend }: { legend: Legend }) {
  const t = useT();
  return <details className="geology-legend" open>
    <summary>{t('Легенда', 'Legend')}: {legend.units.length} {t('юнитов', 'units')}</summary>
    <ul>{legend.units.map(u => <li key={u.unit}><i style={{ background: `rgb(${u.color.join(',')})` }} /><b>{u.unit}</b> {u.label}</li>)}</ul>
    <p>{pick(legend.credit, legend.credit_en)}. {pick(legend.status, legend.status_en)}. <a href={legend.source} target="_blank" rel="noreferrer">{t('Источник ↗', 'Source ↗')}</a></p>
  </details>;
}
