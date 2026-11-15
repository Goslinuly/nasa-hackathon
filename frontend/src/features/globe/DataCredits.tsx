// Раздел «Источники данных»: полный список из app/sources.ts по группам.
import { SOURCE_GROUPS } from '@/app/sources';
import { pick, useT } from '@/shared/i18n/lang';

export function DataCredits() {
  const t = useT();
  return (
    <section className="section credits" id="sources" aria-labelledby="sources-title">
      <div className="section-head">
        <h2 id="sources-title">{t('Источники данных', 'Data sources')}</h2>
      </div>
      <p className="section-intro">
        {t(
          'Все данные, модели и методы, которые использует сайт. У каждого набора свои условия использования, они указаны по ссылкам.',
          'All data, models and methods used by the site. Each dataset has its own terms of use; see the links.',
        )}
      </p>
      <div className="credits-groups">
        {SOURCE_GROUPS.map((group) => (
          <div className="credits-group" key={group.id}>
            <h3>{pick(group.title, group.titleEn)}</h3>
            <ul>
              {group.items.map((item) => (
                <li key={item.name}>
                  <strong>{pick(item.name, item.nameEn)}</strong>
                  <span className="credits-use">{pick(item.use, item.useEn)}</span>
                  <span className="credits-credit">{pick(item.credit, item.creditEn)}</span>
                  {item.links.length > 0 && (
                    <span className="credits-links">
                      {item.links.map((link) => (
                        <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">
                          {pick(link.label, link.labelEn)}
                        </a>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
