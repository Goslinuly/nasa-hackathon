// Сворачиваемая прокручиваемая легенда геологических юнитов с кредитом и статусом данных.
import type { GeologyLegend as Legend } from './geology';

export function GeologyLegend({ legend }: { legend: Legend }) {
  return <details className="geology-legend" open>
    <summary>Легенда: {legend.units.length} юнитов</summary>
    <ul>{legend.units.map(u => <li key={u.unit}><i style={{ background: `rgb(${u.color.join(',')})` }} /><b>{u.unit}</b> {u.label}</li>)}</ul>
    <p>{legend.credit}. {legend.status}. <a href={legend.source} target="_blank" rel="noreferrer">Источник ↗</a></p>
  </details>;
}
