// Главная страница поверх шара: заголовок, кнопки входа, разделы о данных и источники.
import { useEffect, useRef, useState } from 'react';

import { CoverageCard } from '@/features/coverage/CoverageCard';
import { DataCredits } from '@/features/globe/DataCredits';
import { SciencePanel } from '@/features/science/SciencePanel';
import { fetchCoverage } from '@/shared/api/client';
import type { RegionCoverageCandidate } from '@/shared/api/types';
import type { MarsPoint } from '@/shared/coordinates/mars';
import { pick, useLang, useT } from '@/shared/i18n/lang';
import { LangSwitch } from '@/shared/i18n/LangSwitch';

import type { ModeDefinition } from './modeContract';

interface LandingProps {
  active: boolean;
  point: MarsPoint | null;
  modes: ModeDefinition[];
  onExplore(): void;
  onMode(id: string): void;
  onRegion(region: RegionCoverageCandidate): void;
}

/** Открытый код проекта: жюри и любой читатель могут проверить расчёты по исходникам. */
export const REPO_URL = 'https://github.com/Goslinuly/nasa-hackathon';

const SECTIONS = [
  ['coverage', 'Покрытие', 'Coverage'],
  ['regions', 'Районы', 'Regions'],
  ['honesty', 'Данные', 'Data'],
  ['science', 'Архив', 'Archive'],
] as const;

export function Landing({ active, point, modes, onExplore, onMode, onRegion }: LandingProps) {
  const t = useT();
  const lang = useLang();
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
          {SECTIONS.map(([id, title, titleEn]) => (
            <button key={id} type="button" onClick={() => scrollTo(id)}>
              {t(title, titleEn)}
            </button>
          ))}
          <button type="button" className="topbar-cta" onClick={onExplore}>
            {t('На шар →', 'To the globe →')}
          </button>
        </div>
        <div className="topbar-end">
          <LangSwitch className="landing-lang" />
          <a className="topbar-tag topbar-repo" href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub&nbsp;↗
          </a>
          <span className="topbar-tag">Space&nbsp;Apps&nbsp;2026</span>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-copy">
          <span className="micro-label">{t('Интерактивный атлас · вся планета', 'Interactive atlas · the whole planet')}</span>
          <h1>
            MARS
            <br />
            <span className="hero-thin">EXPLORER</span>
          </h1>
          <div className="hero-actions">
            <button type="button" className="hero-cta" onClick={onExplore}>
              {t('Открыть шар', 'Open the globe')}
            </button>
            {modes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className="hero-mode"
                title={pick(mode.description, mode.descriptionEn)}
                onClick={() => onMode(mode.id)}
              >
                {pick(mode.title, mode.titleEn)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="landing-main">
        <section className="section" id="coverage">
          <div className="section-head">
            <h2>{t('Данные выбранной точки', 'Data for the selected point')}</h2>
          </div>
          <p className="section-intro">
            {point
              ? t(
                  'Карты и модели рельефа, которые есть для точки, выбранной на шаре, и их разрешение.',
                  'Maps and terrain models available for the point selected on the globe, with their resolution.',
                )
              : t(
                  'Откройте шар и нажмите на любую точку планеты. Здесь появится список карт и моделей рельефа для этого места и их разрешение.',
                  'Open the globe and click any point on the planet. The maps and terrain models available there, with their resolution, will appear here.',
                )}
          </p>
          {point && <CoverageCard point={point} />}
        </section>

        <section className="section" id="regions">
          <div className="section-head">
            <h2>{t('Районы с подробным рельефом', 'Regions with detailed terrain')}</h2>
          </div>
          <p className="section-intro">
            {t(
              'Для шести районов есть 37 моделей рельефа HiRISE с шагом около 1 м. Нажмите на карточку, чтобы открыть район на шаре. Маршрут можно строить и в любом другом месте планеты.',
              'Six regions have 37 HiRISE terrain models with about 1 m spacing. Click a card to open the region on the globe. Routes can be planned anywhere else on the planet too.',
            )}
          </p>
          <div className="region-grid">
            {regions.map((region) => (
              <button
                type="button"
                className="region-card"
                key={region.slug}
                onClick={() => onRegion(region)}
                title={t('Показать на шаре', 'Show on the globe')}
              >
                <h3>{pick(region.name_ru, region.name_en)}</h3>
                {lang === 'ru' && <span className="region-en">{region.name_en}</span>}
                <div className="region-stats">
                  <div>
                    <span className="mono big">{region.dtm_count}</span>
                    <span className="micro-label">HiRISE DTM</span>
                  </div>
                  <div>
                    <span className="mono big">
                      {region.best_dtm_resolution_m != null ? region.best_dtm_resolution_m.toFixed(2) : t('нет', 'n/a')}
                    </span>
                    <span className="micro-label">{t('м/пикс лучший', 'm/px best')}</span>
                  </div>
                </div>
                <div className="barcode" aria-hidden="true" />
                <span className="region-status">
                  {region.footprints_verified
                    ? t('границы проверены', 'footprints verified')
                    : t('кандидат · доступ проверен', 'candidate · access verified')}
                </span>
              </button>
            ))}
            {regions.length === 0 && <p className="section-note">{t('Каталог районов сейчас недоступен.', 'The region catalog is unavailable right now.')}</p>}
          </div>
        </section>

        <section className="section" id="honesty">
          <div className="section-head">
            <h2>{t('Ограничения данных', 'Data limitations')}</h2>
          </div>
          <p className="section-intro">
            {t('Что стоит знать, прежде чем делать выводы по карте.', 'What to keep in mind before drawing conclusions from the map.')}
          </p>
          <div className="section-notes">
            <h3>{t('Приближение не добавляет деталей', 'Zooming in does not add detail')}</h3>
            <p className="section-note">
              {t(
                'Основная карта шара имеет разрешение 200 м на пиксель. Почти везде поверх неё лежат снимки CTX с шагом 5 м, а в местах посадок есть HiRISE до 25 см. Если приблизить сильнее, чем позволяют данные в центре экрана, появится предупреждение, а пиксели растягиваться не будут. Форма шара построена по MOLA (около 7,4 км на пиксель), высоты преувеличены, множитель указан на экране.',
                'The base map of the globe is 200 m per pixel. Almost everywhere it is overlaid with CTX images at 5 m, and landing sites have HiRISE down to 25 cm. If you zoom in further than the data at the center of the screen allows, a warning appears instead of stretched pixels. The globe shape comes from MOLA (about 7.4 km per pixel); heights are exaggerated and the factor is shown on screen.',
              )}
            </p>
            <h3>{t('Контур показывает границу съёмки', 'An outline marks the imaging boundary')}</h3>
            <p className="section-note">
              {t(
                'Оранжевые контуры на шаре обозначают границы стереосъёмки HiRISE. Внутри контура от 20 до 47\u00a0% площади остаётся без данных. По контуру нельзя судить, ровная ли там поверхность и можно ли по ней пройти.',
                'Orange outlines on the globe mark the boundaries of HiRISE stereo coverage. Between 20 and 47% of the area inside an outline has no data. An outline says nothing about whether the surface is flat or passable.',
              )}
            </p>
            <h3>{t('У каждого значения есть источник', 'Every value has a source')}</h3>
            <p className="section-note">
              {t(
                'Каждая запись каталога проходит этапы: кандидат, доступ проверен, скачан, геометрия проверена, обработан, научно проверен, опубликован. Уровень данных точки считается только по опубликованным продуктам.',
                'Each catalog entry goes through stages: candidate, access verified, downloaded, geometry verified, processed, science-verified, published. The data level of a point counts only published products.',
              )}
            </p>
          </div>
        </section>

        <SciencePanel />
        <DataCredits />
      </main>

      <footer className="footer">
        <span className="mono dim">MARTIAN MAP · v1</span>
        <a className="mono repo-link" href={REPO_URL} target="_blank" rel="noreferrer">
          {t('Исходный код проекта на GitHub', 'Project source code on GitHub')} ↗
        </a>
      </footer>
    </div>
  );
}
