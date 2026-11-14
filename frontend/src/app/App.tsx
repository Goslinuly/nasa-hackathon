import { useCallback, useEffect, useState } from 'react';

import { CoverageCard } from '@/features/coverage/CoverageCard';
import { DataCredits } from '@/features/globe/DataCredits';
import type { RegionMarker } from '@/features/globe/coverageData';
import { MarsGlobe } from '@/features/globe/MarsGlobe';
import { SciencePanel } from '@/features/science/SciencePanel';
import { fetchCoverage } from '@/shared/api/client';
import type { RegionCoverageCandidate } from '@/shared/api/types';
import { makeMarsPoint, type MarsPoint } from '@/shared/coordinates/mars';

export function App() {
  const [point, setPoint] = useState<MarsPoint | null>(null);
  const [regions, setRegions] = useState<RegionCoverageCandidate[]>([]);

  useEffect(() => {
    // Список районов с числом DTM берём из того же контракта /coverage,
    // чтобы не плодить второй источник правды.
    fetchCoverage(0, 0)
      .then((coverage) => setRegions(coverage.local_candidates))
      .catch(() => setRegions([]));
  }, []);

  const handleSelect = useCallback((selected: MarsPoint) => {
    setPoint(selected);
    document.getElementById('coverage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleRegionSelect = useCallback((marker: RegionMarker) => {
    setPoint(makeMarsPoint(marker.lat, marker.lon));
  }, []);

  return (
    <div className="page">
      <nav className="topbar">
        <span className="brand">Martian&nbsp;Map</span>
        <div className="topbar-links">
          <a href="/atlas">Атлас</a>
          <a href="#coverage">Покрытие</a>
          <a href="#regions">Районы</a>
          <a href="#honesty">Данные</a>
          <a href="#science">Архив RAD</a>
          <a href="/planner" className="topbar-cta">Маршрут →</a>
        </div>
        <span className="topbar-tag">Space&nbsp;Apps&nbsp;2026</span>
      </nav>

      <header className="hero">
        <MarsGlobe onSelect={handleSelect} onRegionSelect={handleRegionSelect} />
        <div className="hero-copy">
          <span className="micro-label">Интерактивный атлас · вся планета</span>
          <h1>
            MARS
            <br />
            <span className="hero-thin">EXPLORER</span>
          </h1>
          <p>
            Выберите любые координаты — от Олимпа до безымянного кратера. Сервис
            покажет реальное покрытие данными и честно отметит, где деталей ещё нет.
          </p>
          <a className="hero-cta" href="/planner">
            Построить маршрут A → Б
          </a>
        </div>
        <div className="hero-scroll">scroll ↓</div>
      </header>

      <main>
        <section className="section" id="coverage">
          <div className="section-head">
            <span className="section-number">_01</span>
            <h2>Данные выбранной точки</h2>
          </div>
          <CoverageCard point={point} />
        </section>

        <section className="section" id="regions">
          <div className="section-head">
            <span className="section-number">_02</span>
            <h2>Районы с подробным рельефом</h2>
          </div>
          <p className="section-intro">
            37 моделей рельефа HiRISE (~1 м/пикс) по шести районам — кандидаты для
            режима детальной прогулки. Это точки входа каталога, а не границы
            продукта: планировать экспедицию можно в любых координатах.
          </p>
          <div className="region-grid">
            {regions.map((region, index) => (
              <article className="region-card" key={region.slug}>
                <span className="region-index">{String(index + 1).padStart(2, '0')}_</span>
                <h3>{region.name_ru}</h3>
                <span className="region-en">{region.name_en}</span>
                <div className="region-stats">
                  <div>
                    <span className="mono big">{region.dtm_count}</span>
                    <span className="micro-label">HiRISE DTM</span>
                  </div>
                  <div>
                    <span className="mono big">
                      {region.best_dtm_resolution_m != null
                        ? region.best_dtm_resolution_m.toFixed(2)
                        : '—'}
                    </span>
                    <span className="micro-label">м/пикс лучший</span>
                  </div>
                </div>
                <div className="barcode" aria-hidden="true" />
                <span className="region-status">
                  {region.footprints_verified ? 'границы проверены' : 'кандидат · доступ проверен'}
                </span>
              </article>
            ))}
            {regions.length === 0 && (
              <p className="dim">Каталог недоступен: запустите backend (порт 8001).</p>
            )}
          </div>
        </section>

        <section className="section" id="honesty">
          <div className="section-head">
            <span className="section-number">_03</span>
            <h2>Честность данных</h2>
          </div>
          <div className="honesty-grid">
            <div>
              <h4>Зум ≠ детализация</h4>
              <p>
                Увеличение экрана не повышает разрешение данных. Когда вы приближаетесь
                сильнее, чем позволяет подложка (200 м/пикс), HUD сообщает о пределе —
                вместо растянутых пикселей. Детальнее — в планировщике: CTX 5 м почти
                везде и HiRISE до 25 см в районах посадок. Объём глобуса построен по MOLA
                (~7.4 км/пикс) с указанным преувеличением.
              </p>
            </div>
            <div>
              <h4>Контуры — это съёмка</h4>
              <p>
                Оранжевые контуры на глобусе — границы стереосъёмки HiRISE, внутри
                которых 20–47&nbsp;% пробелов NoData. Контур не означает ровную
                проходимую площадку.
              </p>
            </div>
            <div>
              <h4>Каждое значение — с источником</h4>
              <p>
                Статусы каталога: кандидат → доступ проверен → скачан → геометрия
                проверена → обработан → научно проверен → опубликован. Уровень данных
                определяют только опубликованные продукты.
              </p>
            </div>
          </div>
        </section>

        <SciencePanel />
      </main>

      <footer className="footer">
        <DataCredits />
        <span className="mono dim">MARTIAN MAP · v0.1</span>
      </footer>
    </div>
  );
}
