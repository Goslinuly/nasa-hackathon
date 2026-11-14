// Главная страница поверх шара: заголовок, кнопки входа, разделы о данных и источники.
import { useEffect, useRef, useState } from 'react';

import { CoverageCard } from '@/features/coverage/CoverageCard';
import { DataCredits } from '@/features/globe/DataCredits';
import { SciencePanel } from '@/features/science/SciencePanel';
import { fetchCoverage } from '@/shared/api/client';
import type { RegionCoverageCandidate } from '@/shared/api/types';
import type { MarsPoint } from '@/shared/coordinates/mars';

import type { ModeDefinition } from './modeContract';

interface LandingProps {
  active: boolean;
  point: MarsPoint | null;
  modes: ModeDefinition[];
  onExplore(): void;
  onMode(id: string): void;
  onRegion(region: RegionCoverageCandidate): void;
}

const SECTIONS = [
  ['coverage', 'Покрытие'],
  ['regions', 'Районы'],
  ['honesty', 'Данные'],
  ['science', 'Архив RAD'],
] as const;

export function Landing({ active, point, modes, onExplore, onMode, onRegion }: LandingProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [regions, setRegions] = useState<RegionCoverageCandidate[]>([]);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    fetchCoverage(0, 0)
      .then((coverage) => setRegions(coverage.local_candidates))
      .catch(() => setRegions([]));
  }, []);

  useEffect(() => {
    if (active) scrollRef.current?.scrollTo({ top: 0 });
  }, [active]);

  const scrollTo = (id: string) => {
    scrollRef.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      ref={scrollRef}
      className="landing"
      aria-hidden={!active}
      onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 40)}
    >
      <nav className={`topbar landing-topbar${scrolled ? ' scrolled' : ''}`}>
        <span className="brand">Martian&nbsp;Map</span>
        <div className="topbar-links">
          {SECTIONS.map(([id, title]) => (
            <button key={id} type="button" onClick={() => scrollTo(id)}>
              {title}
            </button>
          ))}
          <button type="button" className="topbar-cta" onClick={onExplore}>
            На шар →
          </button>
        </div>
        <span className="topbar-tag">Space&nbsp;Apps&nbsp;2026</span>
      </nav>

      <header className="hero">
        <div className="hero-copy">
          <span className="micro-label">Интерактивный атлас · вся планета</span>
          <h1>
            MARS
            <br />
            <span className="hero-thin">EXPLORER</span>
          </h1>
          <p>
            Выберите любые координаты — от Олимпа до безымянного кратера. Сервис покажет реальное
            покрытие данными и честно отметит, где деталей ещё нет.
          </p>
          <div className="hero-actions">
            <button type="button" className="hero-cta" onClick={onExplore}>
              Исследовать Марс
            </button>
            {modes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className="hero-mode"
                title={mode.description}
                onClick={() => onMode(mode.id)}
              >
                {mode.title}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="hero-scroll" onClick={() => scrollTo('coverage')}>
          вниз ↓
        </button>
      </header>

      <main className="landing-main">
        <section className="section" id="coverage">
          <div className="section-head">
            <span className="section-number">_01</span>
            <h2>Данные выбранной точки</h2>
          </div>
          {!point && (
            <p className="section-intro">
              Откройте шар и кликните по любой точке планеты — здесь и на шаре появится, какие данные
              для неё реально есть.
            </p>
          )}
          <CoverageCard point={point} />
        </section>

        <section className="section" id="regions">
          <div className="section-head">
            <span className="section-number">_02</span>
            <h2>Районы с подробным рельефом</h2>
          </div>
          <p className="section-intro">
            37 моделей рельефа HiRISE (~1 м/пикс) по шести районам — кандидаты для режима детальной
            прогулки. Это точки входа каталога, а не границы продукта: планировать экспедицию можно в
            любых координатах.
          </p>
          <div className="region-grid">
            {regions.map((region, index) => (
              <button
                type="button"
                className="region-card"
                key={region.slug}
                onClick={() => onRegion(region)}
                title="Показать на шаре"
              >
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
                      {region.best_dtm_resolution_m != null ? region.best_dtm_resolution_m.toFixed(2) : '—'}
                    </span>
                    <span className="micro-label">м/пикс лучший</span>
                  </div>
                </div>
                <div className="barcode" aria-hidden="true" />
                <span className="region-status">
                  {region.footprints_verified ? 'границы проверены' : 'кандидат · доступ проверен'}
                </span>
              </button>
            ))}
            {regions.length === 0 && <p className="dim">Каталог недоступен: запустите backend (порт 8001).</p>}
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
                Увеличение экрана не повышает разрешение данных. Подложка шара — 200 м/пикс, поверх неё
                CTX 5 м почти везде и HiRISE до 25 см в районах посадок. Когда вы приближаетесь сильнее,
                чем позволяют данные под центром экрана, HUD сообщает о пределе — вместо растянутых
                пикселей. Объём шара построен по MOLA (~7.4 км/пикс) с указанным преувеличением.
              </p>
            </div>
            <div>
              <h4>Контуры — это съёмка</h4>
              <p>
                Оранжевые контуры на шаре — границы стереосъёмки HiRISE, внутри которых 20–47&nbsp;%
                пробелов NoData. Контур не означает ровную проходимую площадку.
              </p>
            </div>
            <div>
              <h4>Каждое значение — с источником</h4>
              <p>
                Статусы каталога: кандидат → доступ проверен → скачан → геометрия проверена → обработан
                → научно проверен → опубликован. Уровень данных определяют только опубликованные
                продукты.
              </p>
            </div>
          </div>
        </section>

        <SciencePanel />
      </main>

      <footer className="footer">
        <DataCredits />
        <span className="mono dim">MARTIAN MAP · v0.2</span>
      </footer>
    </div>
  );
}
