// Блок со ссылками на все источники данных глобуса.
import { CTX_OVERLAY, HIRISE_OVERLAYS, SPECTRA } from './layers';

export function DataCredits() {
  const spectra = Object.values(SPECTRA);
  return (
    <section className="credits" aria-label="Источники данных">
      <h2 className="credits-title">Источники данных</h2>
      <ul>
        {spectra.map((layer) => (
          <li key={layer.id}>
            <strong>{layer.title}</strong> — {layer.credit}
          </li>
        ))}
        <li>
          <strong>{CTX_OVERLAY.title}</strong> — {CTX_OVERLAY.credit}. Свободное использование V01 с
          указанием авторства.
        </li>
        <li>
          <strong>HiRISE</strong> ({HIRISE_OVERLAYS.map((o) => o.title).join(', ')}) — {HIRISE_OVERLAYS[0].credit}
        </li>
        <li>
          <strong>Объём рельефа и маршруты</strong> — MOLA MEGDR 16 px/° (MGS-M-MOLA-5-MEGDR-L3-V1.0),
          NASA/GSFC MOLA Science Team, PDS Geosciences Node; уменьшено до 8 px/°.
        </li>
        <li>
          <strong>Тайловые сервисы</strong> — NASA Mars Trek (JPL), Caltech Murray Lab.
        </li>
      </ul>
    </section>
  );
}
