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
  ['science', 'Архив'],
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
          <div className="hero-actions">
            <button type="button" className="hero-cta" onClick={onExplore}>
              Открыть шар
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
      </header>

      <main className="landing-main">
        <section className="section" id="coverage">
          <div className="section-head">
            <h2>Данные выбранной точки</h2>
          </div>
          <p className="section-intro">
            {point
              ? 'Карты и модели рельефа, которые есть для точки, выбранной на шаре, и их разрешение.'
              : 'Откройте шар и нажмите на любую точку планеты. Здесь появится список карт и моделей рельефа для этого места и их разрешение.'}
          </p>
          {point && <CoverageCard point={point} />}
        </section>

        <section className="section" id="regions">
          <div className="section-head">
            <h2>Районы с подробным рельефом</h2>
          </div>
          <p className="section-intro">
            Для шести районов есть 37 моделей рельефа HiRISE с шагом около 1 м. Нажмите на карточку,
            чтобы открыть район на шаре. Маршрут можно строить и в любом другом месте планеты.
          </p>
          <div className="region-grid">
            {regions.map((region) => (
              <button
                type="button"
                className="region-card"
                key={region.slug}
                onClick={() => onRegion(region)}
                title="Показать на шаре"
              >
                <h3>{region.name_ru}</h3>
                <span className="region-en">{region.name_en}</span>
                <div className="region-stats">
                  <div>
                    <span className="mono big">{region.dtm_count}</span>
                    <span className="micro-label">HiRISE DTM</span>
                  </div>
                  <div>
                    <span className="mono big">
                      {region.best_dtm_resolution_m != null ? region.best_dtm_resolution_m.toFixed(2) : 'нет'}
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
            {regions.length === 0 && <p className="section-note">Каталог районов сейчас недоступен.</p>}
          </div>
        </section>

        <section className="section" id="honesty">
          <div className="section-head">
            <h2>Ограничения данных</h2>
          </div>
          <p className="section-intro">
            Что стоит знать, прежде чем делать выводы по карте.
          </p>
          <div className="section-notes">
            <h3>Приближение не добавляет деталей</h3>
            <p className="section-note">
              Основная карта шара имеет разрешение 200 м на пиксель. Почти везде поверх неё лежат
              снимки CTX с шагом 5 м, а в местах посадок есть HiRISE до 25 см. Если приблизить сильнее,
              чем позволяют данные в центре экрана, появится предупреждение, а пиксели растягиваться
              не будут. Форма шара построена по MOLA (около 7,4 км на пиксель), высоты преувеличены,
              множитель указан на экране.
            </p>
            <h3>Контур показывает границу съёмки</h3>
            <p className="section-note">
              Оранжевые контуры на шаре обозначают границы стереосъёмки HiRISE. Внутри контура от 20
              до 47&nbsp;% площади остаётся без данных. По контуру нельзя судить, ровная ли там
              поверхность и можно ли по ней пройти.
            </p>
            <h3>У каждого значения есть источник</h3>
            <p className="section-note">
              Каждая запись каталога проходит этапы: кандидат, доступ проверен, скачан, геометрия
              проверена, обработан, научно проверен, опубликован. Уровень данных точки считается
              только по опубликованным продуктам.
            </p>
          </div>
        </section>

        <SciencePanel />
        <DataCredits />
      </main>

      <footer className="footer">
        <span className="mono dim">MARTIAN MAP · v1</span>
      </footer>
    </div>
  );
}
