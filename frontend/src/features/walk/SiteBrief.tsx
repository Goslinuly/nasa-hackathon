// Описание участка прогулки: маршрут и почему выбран этот участок. Текст общий для выбора
// участка, «Маршрутов роверов» и «Маршрута „Марсианина“» — берётся из data/local/index.json.
// Файл лёгкий (без three.js), его можно импортировать из любых панелей.
import { useEffect, useState } from 'react';

import { pick, useLang, useT } from '@/shared/i18n/lang';

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
  const t = useT();
  const lang = useLang();
  if (!site.route && !site.why?.length) return null;
  const route = site.route ? pick(site.route, site.route_en) : '';
  const why = lang === 'en' && site.why_en?.length ? site.why_en : site.why;
  return (
    <div className="site-brief">
      {site.route && (
        <p className="site-brief-route">
          <b>{t('Маршрут.', 'Route.')}</b> {route}
        </p>
      )}
      {why && why.length > 0 && (
        <>
          <b className="site-brief-head">{t('Почему здесь', 'Why here')}</b>
          <ul>
            {why.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Карточка участка с кнопкой спуска — для панелей других режимов. */
export function SiteBriefCard({ siteId, onDescend, label }: { siteId: string; onDescend(): void; label?: string }) {
  const t = useT();
  const sites = useSiteIndex();
  const site = sites?.find((s) => s.id === siteId);
  if (!site) return null;
  return (
    <section className="site-brief-card">
      <strong>{pick(site.title, site.title_en)}</strong>
      <SiteBrief site={site} />
      <button type="button" className="site-brief-go" onClick={onDescend}>
        {label ?? t('Спуститься', 'Descend')}
      </button>
    </section>
  );
}
