// Полный список источников сайта для блока «Источники данных».
// Держим в синхроне с разделом «Data sources» в README.md.

export interface SourceLink {
  label: string;
  /** Подпись по-английски, если русская отличается. */
  labelEn?: string;
  url: string;
}

export interface DataSource {
  name: string;
  use: string;
  credit: string;
  /** Английские варианты (shared/i18n); без них — русские. */
  nameEn?: string;
  useEn?: string;
  creditEn?: string;
  links: SourceLink[];
}

export interface SourceGroup {
  id: string;
  title: string;
  titleEn?: string;
  items: DataSource[];
}

const PIA = (id: string): SourceLink => ({
  label: id,
  url: `https://pds-rings.seti.org/press_releases/pages/PIA19xxx/${id}.html`,
});

const MMGIS = 'https://mars.nasa.gov/mmgis-maps';

export const SOURCE_GROUPS: SourceGroup[] = [
  {
    id: 'globe',
    title: 'Шар и 2D-атлас',
    titleEn: 'Globe and 2D atlas',
    items: [
      {
        name: 'MGS MOLA MEGDR 16 px/°',
        use: 'Форма шара (уменьшено до 8 px/°), обзорные маршруты, профиль высот',
        useEn: 'Globe shape (downsampled to 8 px/°), overview routes, elevation profile',
        credit: 'NASA/GSFC, MOLA Science Team; PDS Geosciences Node',
        links: [{ label: 'PDS', url: 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/' }],
      },
      {
        name: 'Mars Trek WMTS: Viking MDIM 2.1, 232 м',
        nameEn: 'Mars Trek WMTS: Viking MDIM 2.1, 232 m',
        use: 'Цветной шар и 2D-карта',
        useEn: 'Color globe and 2D map',
        credit: 'NASA/JPL/USGS',
        links: [{ label: 'Mars Trek API', url: 'https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars' }],
      },
      {
        name: 'Mars Trek WMTS: HRSC + MOLA, 200 м',
        nameEn: 'Mars Trek WMTS: HRSC + MOLA, 200 m',
        use: 'Тени рельефа и слой высот',
        useEn: 'Relief shading and elevation layer',
        credit: 'DLR/FU Berlin (ESA Mars Express HRSC), NASA/GSFC (MOLA)',
        links: [],
      },
      {
        name: 'Mars Trek WMTS: THEMIS Day IR и Night IR, 100 м',
        nameEn: 'Mars Trek WMTS: THEMIS Day IR and Night IR, 100 m',
        use: 'Тепловые слои',
        useEn: 'Thermal layers',
        credit: 'NASA/JPL/ASU',
        links: [],
      },
      {
        name: 'Mars Trek WMTS: MGS TES',
        use: 'Слои альбедо, пыли, тепловой инерции и минералов',
        useEn: 'Albedo, dust, thermal inertia and mineral layers',
        credit: 'NASA/GSFC; Ruff, Christensen (2002), Putzig и др. (2005), Bandfield (2002)',
        creditEn: 'NASA/GSFC; Ruff, Christensen (2002), Putzig et al. (2005), Bandfield (2002)',
        links: [],
      },
      {
        name: 'Mars Trek WMTS: HiRISE, в том числе Mars 2020 TRN, Езеро, 0,25 м',
        nameEn: 'Mars Trek WMTS: HiRISE, including Mars 2020 TRN, Jezero, 0.25 m',
        use: 'Подробные снимки в районах посадок',
        useEn: 'Detailed images at landing sites',
        credit: 'NASA/JPL/University of Arizona',
        links: [],
      },
      {
        name: 'Global CTX Mosaic V01',
        use: 'Снимки 5 м на шаре и 2D-карте',
        useEn: '5 m images on the globe and 2D map',
        credit: 'NASA/JPL/MSSS/The Murray Lab (Caltech); ASU JMARS',
        links: [
          { label: 'Murray Lab', url: 'https://murray-lab.caltech.edu/CTX/V01/' },
          { label: 'JMARS', url: 'https://jmars.asu.edu/node/2844' },
        ],
      },
      {
        name: 'TES thermal inertia (Putzig & Mellon, 2007)',
        use: 'Тип грунта для стоимости маршрута',
        useEn: 'Ground type for route cost',
        credit: 'NASA/JPL/ASU, MGS TES',
        links: [{ label: 'ASU WMS', url: 'http://ms-mars.mars.asu.edu/TES_TI_Putzig_day_numeric' }],
      },
      {
        name: 'Ресурсы задачи Space Apps',
        nameEn: 'Space Apps challenge resources',
        use: 'Подложки, геологическая карта, примеры маршрутных карт и интерфейса слоёв',
        useEn: 'Base maps, geologic map, examples of route maps and layer interfaces',
        credit: 'NASA, USGS',
        links: [
          { label: 'JPL Mars Trek', url: 'https://trek.nasa.gov/mars/' },
          { label: 'USGS-NASA PGM', url: 'https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars' },
          { label: 'Путь Curiosity на гору Шарп', labelEn: "Curiosity's path up Mount Sharp", url: 'https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/' },
          { label: 'NASA Worldview', url: 'https://worldview.earthdata.nasa.gov/' },
          { label: 'Снимки Perseverance', labelEn: 'Perseverance images', url: 'https://mars.nasa.gov/mars2020/multimedia/raw-images/' },
        ],
      },
    ],
  },
  {
    id: 'names',
    title: 'Названия и геология',
    titleEn: 'Names and geology',
    items: [
      {
        name: 'USGS Gazetteer of Planetary Nomenclature (IAU WGPSN)',
        use: '1897 названий на 2D-атласе',
        useEn: '1897 names on the 2D atlas',
        credit: 'IAU WGPSN, USGS Astrogeology',
        links: [
          { label: 'Gazetteer', url: 'https://planetarynames.wr.usgs.gov/' },
          {
            label: 'ArcGIS',
            url: 'https://services5.arcgis.com/AMh9EzyFGgthLT1q/arcgis/rest/services/MARS_nomenclature/FeatureServer',
          },
        ],
      },
      {
        name: 'Geologic Map of Mars, USGS SIM 3292 (Tanaka et al., 2014)',
        use: 'Слой геологии, легенда из 44 единиц',
        useEn: 'Geology layer, legend of 44 units',
        credit: 'USGS Astrogeology',
        links: [
          { label: 'SIM 3292', url: 'https://pubs.usgs.gov/sim/3292/' },
          {
            label: 'ArcGIS',
            url: 'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Tanaka_et_al_2014_Mars_Global_Map_Features/FeatureServer',
          },
        ],
      },
    ],
  },
  {
    id: 'terrain',
    title: 'Рельеф и прогулка',
    titleEn: 'Terrain and walk',
    items: [
      {
        name: 'HiRISE DTM и ортоснимки, USGS STAC',
        nameEn: 'HiRISE DTMs and orthoimages, USGS STAC',
        use: 'Каталог районов с подробным рельефом, местный рельеф',
        useEn: 'Catalog of regions with detailed terrain, local terrain',
        credit: 'NASA/JPL/University of Arizona; DTM USGS Astrogeology. CC0-1.0',
        links: [{ label: 'USGS STAC', url: 'https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/' }],
      },
      {
        name: 'HiRISE DTM DTEEC_019698_1750_019988_1750_U01',
        use: 'Прогулка в кратере Гейл, гора Шарп',
        useEn: 'Walk in Gale crater, Mount Sharp',
        credit: 'NASA/JPL/University of Arizona; DTM USGS',
        links: [{ label: 'USGS STAC', url: 'https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/' }],
      },
      {
        name: 'Mars 2020 TRN: HiRISE DTM, CTX DTM 20 м и ортомозаики',
        nameEn: 'Mars 2020 TRN: HiRISE DTM, CTX DTM 20 m and orthomosaics',
        use: 'Прогулка в Езеро по недавнему пути Perseverance. HiRISE покрывает 26 % площади, остальное CTX',
        useEn: 'Walk in Jezero along the recent Perseverance path. HiRISE covers 26% of the area, the rest is CTX',
        credit: 'NASA/JPL/University of Arizona, NASA/JPL/MSSS; USGS Astrogeology (Fergason et al.)',
        links: [
          { label: 'HiRISE, doi:10.5066/P9REJ9JN', url: 'https://doi.org/10.5066/P9REJ9JN' },
          { label: 'CTX, doi:10.5066/P906QQT8', url: 'https://doi.org/10.5066/P906QQT8' },
        ],
      },
    ],
  },
  {
    id: 'martian',
    title: 'Места из «Марсианина»',
    titleEn: 'Places from The Martian',
    items: [
      {
        name: 'HiRISE ESP_040776_2115 и DTM DTEEC_041277_2115_040776_2115_A01',
        nameEn: 'HiRISE ESP_040776_2115 and DTM DTEEC_041277_2115_040776_2115_A01',
        use: 'Место Ares 3, равнина Ацидалия. Снимок сделан по координатам, которые Энди Вейр прислал команде HiRISE',
        useEn: 'Ares 3 site, Acidalia Planitia. The image was taken at coordinates Andy Weir sent to the HiRISE team',
        credit: 'NASA/JPL/University of Arizona; DTM USGS',
        links: [{ label: 'uahirise.org', url: 'https://www.uahirise.org/ESP_040776_2115' }],
      },
      {
        name: 'HiRISE ESP_042014_1760 и DTM DTEED_042014_1760_042647_1760_A01',
        nameEn: 'HiRISE ESP_042014_1760 and DTM DTEED_042014_1760_042647_1760_A01',
        use: 'Место Ares 4, кратер Скиапарелли',
        useEn: 'Ares 4 site, Schiaparelli crater',
        credit: 'NASA/JPL/University of Arizona; DTM USGS',
        links: [{ label: 'uahirise.org', url: 'https://www.uahirise.org/ESP_042014_1760' }],
      },
      {
        name: 'THEMIS, серия «The Martian, Part 1–5»',
        nameEn: 'THEMIS, "The Martian, Part 1–5" series',
        use: 'Координаты пути Уотни: Ацидалия, долина Маурт, Меридиана, Скиапарелли',
        useEn: "Coordinates of Watney's route: Acidalia, Mawrth Vallis, Meridiani, Schiaparelli",
        credit: 'NASA/JPL-Caltech/ASU',
        links: ['PIA19796', 'PIA19797', 'PIA19798', 'PIA19799', 'PIA19800'].map(PIA),
      },
      {
        name: 'HiRISE: The Entrance to Mawrth Vallis',
        use: 'Заметка о том, насколько трудный этот путь на самом деле',
        useEn: 'A note on how hard this route really is',
        credit: 'NASA/JPL/University of Arizona',
        links: [
          { label: 'uahirise.org', url: 'https://www.uahirise.org/anaglyph/ESP_049017_2060_ESP_048595_2060_RED' },
        ],
      },
    ],
  },
  {
    id: 'rovers',
    title: 'Маршруты роверов и миссии',
    titleEn: 'Rover routes and missions',
    items: [
      {
        name: 'NASA MMGIS: Perseverance и Ingenuity',
        nameEn: 'NASA MMGIS: Perseverance and Ingenuity',
        use: 'Маршруты на шаре и на рельефе',
        useEn: 'Routes on the globe and on the terrain',
        credit: 'NASA/JPL-Caltech',
        links: [
          { label: 'Путь', labelEn: 'Traverse', url: `${MMGIS}/M20/Layers/json/M20_traverse.json` },
          { label: 'Точки', labelEn: 'Waypoints', url: `${MMGIS}/M20/Layers/json/M20_waypoints.json` },
          { label: 'Текущее место', labelEn: 'Current position', url: `${MMGIS}/M20/Layers/json/M20_waypoints_current.json` },
          { label: 'Полёты Ingenuity', labelEn: 'Ingenuity flights', url: `${MMGIS}/M20/Layers/json/m20_heli_waypoints.json` },
        ],
      },
      {
        name: 'NASA MMGIS: Curiosity',
        use: 'Маршруты на шаре и на рельефе',
        useEn: 'Routes on the globe and on the terrain',
        credit: 'NASA/JPL-Caltech',
        links: [
          { label: 'Точки', labelEn: 'Waypoints', url: `${MMGIS}/MSL/Layers/json/MSL_waypoints.json` },
          { label: 'Текущее место', labelEn: 'Current position', url: `${MMGIS}/MSL/Layers/json/MSL_waypoints_current.json` },
        ],
      },
      {
        name: 'Места посадок и завершённые миссии',
        nameEn: 'Landing sites and completed missions',
        use: 'Памятные места: координаты и даты, места посадок в каталоге исследований',
        useEn: 'Memorial: coordinates and dates, landing sites in the research catalog',
        credit: 'NASA GISS, NASA NSSDCA, NASA/JPL-Caltech, Wikipedia',
        links: [
          { label: 'Mars24: посадочные аппараты', labelEn: 'Mars24: landers', url: 'https://www.giss.nasa.gov/tools/mars24/help/landers.html' },
          { label: 'Viking 1', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1975-075C' },
          { label: 'Viking 2', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1975-083C' },
          { label: 'Mars Pathfinder', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1996-068A' },
          {
            label: 'JPL: Ingenuity',
            url: 'https://www.jpl.nasa.gov/news/after-three-years-on-mars-nasas-ingenuity-helicopter-mission-ends/',
          },
          { label: 'Opportunity', url: 'https://en.wikipedia.org/wiki/Opportunity_(rover)' },
          { label: 'List of Mars landers', url: 'https://en.wikipedia.org/wiki/List_of_Mars_landers' },
        ],
      },
      {
        name: 'Музыка в памятных местах',
        nameEn: 'Music at memorial sites',
        use: 'Фоновая музыка',
        useEn: 'Background music',
        credit: 'Синтез Web Audio, без записей',
        creditEn: 'Web Audio synthesis, no recordings',
        links: [],
      },
    ],
  },
  {
    id: 'radiation',
    title: 'Радиация, погода и космическая погода',
    titleEn: 'Radiation, weather and space weather',
    items: [
      {
        name: 'MSL RAD, сол 3290, 87 измерений',
        nameEn: 'MSL RAD, sol 3290, 87 measurements',
        use: 'Архив радиации на этой странице',
        useEn: 'Radiation archive on this page',
        credit: 'NASA/JPL-Caltech/SwRI. Продукт RAD_RDR_2021_311_00_43_3290_V00',
        creditEn: 'NASA/JPL-Caltech/SwRI. Product RAD_RDR_2021_311_00_43_3290_V00',
        links: [{ label: 'PDS PPI', url: 'https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/' }],
      },
      {
        name: 'ISWA HAPI, набор msl_rad_dosimetry',
        nameEn: 'ISWA HAPI, msl_rad_dosimetry dataset',
        use: 'Свежие данные RAD в кратере Гейл',
        useEn: 'Recent RAD data in Gale crater',
        credit: 'NASA CCMC ISWA; MSL RAD, NASA/JPL-Caltech/SwRI',
        links: [{ label: 'ISWA HAPI', url: 'https://iswa.gsfc.nasa.gov/IswaSystemWebApp/hapi' }],
      },
      {
        name: 'NOAA SWPC: протоны и рентген GOES',
        nameEn: 'NOAA SWPC: GOES protons and X-rays',
        use: 'Космическая погода у Земли по шкалам NOAA',
        useEn: 'Space weather near Earth on NOAA scales',
        credit: 'NOAA Space Weather Prediction Center',
        links: [{ label: 'SWPC JSON', url: 'https://services.swpc.noaa.gov/json/' }],
      },
      {
        name: 'NASA CCMC DONKI',
        use: 'События космической погоды в прогулке. Это условия у Земли, приход к Марсу оценочный',
        useEn: 'Space weather events in the walk. These are conditions near Earth; arrival at Mars is estimated',
        credit: 'NASA CCMC',
        links: [{ label: 'DONKI', url: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/' }],
      },
      {
        name: 'MSL REMS',
        use: 'Погода в Гейле. NASA помечает эту ленту как просветительскую',
        useEn: 'Weather in Gale. NASA marks this feed as educational',
        credit: 'NASA/JPL-Caltech, CAB (CSIC-INTA)',
        links: [
          { label: 'REMS', url: 'https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json' },
        ],
      },
    ],
  },
  {
    id: 'time',
    title: 'Время и эфемериды',
    titleEn: 'Time and ephemerides',
    items: [
      {
        name: 'NASA GISS Mars24 (Allison & McEwen, 2000)',
        use: 'Местное время на Марсе, номер сола, положение Солнца и небо',
        useEn: 'Local Mars time, sol number, Sun position and sky',
        credit: 'NASA GISS',
        links: [
          { label: 'Алгоритм', labelEn: 'Algorithm', url: 'https://www.giss.nasa.gov/tools/mars24/help/algorithm.html' },
          { label: 'Заметки', labelEn: 'Notes', url: 'https://www.giss.nasa.gov/tools/mars24/help/notes.html' },
        ],
      },
      {
        name: 'JPL Horizons',
        use: 'Время прохождения сигнала Земля–Марс на 2026–2028 годы',
        useEn: 'Earth–Mars signal travel time for 2026–2028',
        credit: 'NASA/JPL Solar System Dynamics',
        links: [{ label: 'Horizons', url: 'https://ssd.jpl.nasa.gov/horizons/' }],
      },
    ],
  },
  {
    id: 'methods',
    title: 'Модели и методы',
    titleEn: 'Models and methods',
    items: [
      {
        name: 'Скорость ходьбы в скафандре V = −0,01·θ + 0,75 м/с',
        nameEn: 'Suited walking speed V = −0.01·θ + 0.75 m/s',
        use: 'Скорость, расход кислорода, время возврата на базу',
        useEn: 'Speed, oxygen use, time to return to base',
        credit: 'Данные выходов Apollo; Santee et al. (2001), Aviat. Space Environ. Med. 72(6): 562–566',
        creditEn: 'Apollo EVA data; Santee et al. (2001), Aviat. Space Environ. Med. 72(6): 562–566',
        links: [
          {
            label: 'TZ_EVA_Safety.md, 9.1',
            url: 'https://github.com/Goslinuly/nasa-hackathon/blob/main/docs/TZ_EVA_Safety.md',
          },
        ],
      },
      {
        name: 'Коридор дозы 0,64 ± 0,12 мЗв/сут',
        nameEn: 'Dose range 0.64 ± 0.12 mSv/day',
        use: 'Доза за запланированный выход',
        useEn: 'Dose for a planned EVA',
        credit: 'Измерения MSL RAD на поверхности',
        creditEn: 'MSL RAD surface measurements',
        links: [
          {
            label: 'TZ_EVA_Safety.md, 9.4',
            url: 'https://github.com/Goslinuly/nasa-hackathon/blob/main/docs/TZ_EVA_Safety.md',
          },
        ],
      },
    ],
  },
  {
    id: 'models',
    title: '3D-модели и рендеры',
    titleEn: '3D models and renders',
    items: [
      {
        name: 'Модель Mars 2020 Perseverance',
        nameEn: 'Mars 2020 Perseverance model',
        use: 'Ровер на шаре и в прогулке',
        useEn: 'Rover on the globe and in the walk',
        credit: 'NASA/JPL-Caltech, NASA 3D Resources',
        links: [
          { label: 'NASA 3D Resources', url: 'https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/' },
        ],
      },
      {
        name: 'Модели кратеров Гейл и Езеро',
        nameEn: 'Gale and Jezero crater models',
        use: 'Дальние стены кратеров вокруг прогулки',
        useEn: 'Distant crater walls around the walk',
        credit: 'Сделаны командой в Blender по продуктам USGS Astrogeology, выровнены по MOLA MEGDR',
        creditEn: 'Made by the team in Blender from USGS Astrogeology products, aligned to MOLA MEGDR',
        links: [
          { label: 'RESOURCES.md', url: 'https://github.com/Goslinuly/nasa-hackathon/blob/main/docs/RESOURCES.md' },
        ],
      },
      {
        name: 'Панорама ночного неба',
        nameEn: 'Night sky panorama',
        use: 'Небо в прогулке для любого места и времени',
        useEn: 'Sky in the walk for any place and time',
        credit: 'Рендер команды',
        creditEn: 'Rendered by the team',
        links: [],
      },
    ],
  },
];
