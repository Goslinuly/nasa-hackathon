// Раздел «Источники данных»: полный список из app/sources.ts по группам.
import { SOURCE_GROUPS } from '@/app/sources';

export function DataCredits() {
  return (
    <section className="section credits" id="sources" aria-labelledby="sources-title">
      <div className="section-head">
        <h2 id="sources-title">Источники данных</h2>
      </div>
      <p className="section-intro">
        Все данные, модели и методы, которые использует сайт. У каждого набора свои условия
        использования, они указаны по ссылкам.
      </p>
      <div className="credits-groups">
        {SOURCE_GROUPS.map((group) => (
          <div className="credits-group" key={group.id}>
            <h3>{group.title}</h3>
            <ul>
              {group.items.map((item) => (
                <li key={item.name}>
                  <strong>{item.name}</strong>
                  <span className="credits-use">{item.use}</span>
                  <span className="credits-credit">{item.credit}</span>
                  {item.links.length > 0 && (
                    <span className="credits-links">
                      {item.links.map((link) => (
                        <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">
                          {link.label}
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
