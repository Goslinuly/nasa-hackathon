// Описание участка прогулки: маршрут и почему выбран этот участок. Текст общий для выбора
// участка, «Маршрутов роверов» и «Маршрута „Марсианина“» — берётся из data/local/index.json.
// Файл лёгкий (без three.js), его можно импортировать из любых панелей.
import { useEffect, useState } from 'react';

import { fetchSiteIndex, type SiteIndexEntry } from './sitePackage';
import './siteBrief.css';

let indexLoading: Promise<SiteIndexEntry[]> | null = null;

/** Список участков, один запрос на сессию. */
export function useSiteIndex(): SiteIndexEntry[] | null {
  const [sites, setSites] = useState<SiteIndexEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    indexLoading ??= fetchSiteIndex().catch((e) => {
      indexLoading = null;
      throw e;
    });
    indexLoading.then((list) => alive && setSites(list)).catch(() => alive && setSites([]));
    return () => {
      alive = false;
    };
  }, []);
  return sites;
}

export function SiteBrief({ site }: { site: SiteIndexEntry }) {
  if (!site.route && !site.why?.length) return null;
  return (
    <div className="site-brief">
      {site.route && (
        <p className="site-brief-route">
          <b>Маршрут.</b> {site.route}
        </p>
      )}
      {site.why && site.why.length > 0 && (
        <>
          <b className="site-brief-head">Почему здесь</b>
          <ul>
            {site.why.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Карточка участка с кнопкой спуска — для панелей других режимов. */
export function SiteBriefCard({ siteId, onDescend, label = 'Спуститься' }: { siteId: string; onDescend(): void; label?: string }) {
  const sites = useSiteIndex();
  const site = sites?.find((s) => s.id === siteId);
  if (!site) return null;
  return (
    <section className="site-brief-card">
      <strong>{site.title}</strong>
      <SiteBrief site={site} />
      <button type="button" className="site-brief-go" onClick={onDescend}>
        {label}
      </button>
    </section>
  );
}
