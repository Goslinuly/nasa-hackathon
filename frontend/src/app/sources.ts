// Полный список источников сайта для блока «Источники данных».
// Держим в синхроне с разделом «Data sources» в README.md.

export interface SourceLink {
  label: string;
  url: string;
}

export interface DataSource {
  name: string;
  use: string;
  credit: string;
  links: SourceLink[];
}

export interface SourceGroup {
  id: string;
  title: string;
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
    items: [
      {
        name: 'MGS MOLA MEGDR 16 px/°',
        use: 'Форма шара (уменьшено до 8 px/°), обзорные маршруты, профиль высот',
        credit: 'NASA/GSFC, MOLA Science Team; PDS Geosciences Node',
        links: [{ label: 'PDS', url: 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/' }],
      },
      {
        name: 'Mars Trek WMTS: Viking MDIM 2.1, 232 м',
        use: 'Цветной шар и 2D-карта',
        credit: 'NASA/JPL/USGS',
        links: [{ label: 'Mars Trek API', url: 'https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars' }],
      },
      {
        name: 'Mars Trek WMTS: HRSC + MOLA, 200 м',
        use: 'Тени рельефа и слой высот',
        credit: 'DLR/FU Berlin (ESA Mars Express HRSC), NASA/GSFC (MOLA)',
        links: [],
      },
      {
        name: 'Mars Trek WMTS: THEMIS Day IR и Night IR, 100 м',
        use: 'Тепловые слои',
        credit: 'NASA/JPL/ASU',
        links: [],
      },
      {
        name: 'Mars Trek WMTS: MGS TES',
        use: 'Слои альбедо, пыли, тепловой инерции и минералов',
        credit: 'NASA/GSFC; Ruff, Christensen (2002), Putzig и др. (2005), Bandfield (2002)',
        links: [],
      },
      {
        name: 'Mars Trek WMTS: HiRISE, в том числе Mars 2020 TRN, Езеро, 0,25 м',
        use: 'Подробные снимки в районах посадок',
        credit: 'NASA/JPL/University of Arizona',
        links: [],
      },
      {
        name: 'Global CTX Mosaic V01',
        use: 'Снимки 5 м на шаре и 2D-карте',
        credit: 'NASA/JPL/MSSS/The Murray Lab (Caltech); ASU JMARS',
        links: [
          { label: 'Murray Lab', url: 'https://murray-lab.caltech.edu/CTX/V01/' },
          { label: 'JMARS', url: 'https://jmars.asu.edu/node/2844' },
        ],
      },
      {
        name: 'TES thermal inertia (Putzig & Mellon, 2007)',
        use: 'Тип грунта для стоимости маршрута',
        credit: 'NASA/JPL/ASU, MGS TES',
        links: [{ label: 'ASU WMS', url: 'http://ms-mars.mars.asu.edu/TES_TI_Putzig_day_numeric' }],
      },
      {
        name: 'Ресурсы задачи Space Apps',
        use: 'Подложки, геологическая карта, примеры маршрутных карт и интерфейса слоёв',
        credit: 'NASA, USGS',
        links: [
          { label: 'JPL Mars Trek', url: 'https://trek.nasa.gov/mars/' },
          { label: 'USGS-NASA PGM', url: 'https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars' },
          { label: 'Путь Curiosity на гору Шарп', url: 'https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/' },
          { label: 'NASA Worldview', url: 'https://worldview.earthdata.nasa.gov/' },
          { label: 'Снимки Perseverance', url: 'https://mars.nasa.gov/mars2020/multimedia/raw-images/' },
        ],
      },
    ],
  },
  {
    id: 'names',
    title: 'Названия и геология',
    items: [
      {
        name: 'USGS Gazetteer of Planetary Nomenclature (IAU WGPSN)',
        use: '1897 названий на 2D-атласе',
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
    items: [
      {
        name: 'HiRISE DTM и ортоснимки, USGS STAC',
        use: 'Каталог районов с подробным рельефом, местный рельеф',
        credit: 'NASA/JPL/University of Arizona; DTM USGS Astrogeology. CC0-1.0',
        links: [{ label: 'USGS STAC', url: 'https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/' }],
      },
      {
        name: 'HiRISE DTM DTEEC_019698_1750_019988_1750_U01',
        use: 'Прогулка в кратере Гейл, гора Шарп',
        credit: 'NASA/JPL/University of Arizona; DTM USGS',
        links: [{ label: 'USGS STAC', url: 'https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/' }],
      },
      {
        name: 'Mars 2020 TRN: HiRISE DTM, CTX DTM 20 м и ортомозаики',
        use: 'Прогулка в Езеро по недавнему пути Perseverance. HiRISE покрывает 26 % площади, остальное CTX',
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
    items: [
      {
        name: 'HiRISE ESP_040776_2115 и DTM DTEEC_041277_2115_040776_2115_A01',
        use: 'Место Ares 3, равнина Ацидалия. Снимок сделан по координатам, которые Энди Вейр прислал команде HiRISE',
        credit: 'NASA/JPL/University of Arizona; DTM USGS',
        links: [{ label: 'uahirise.org', url: 'https://www.uahirise.org/ESP_040776_2115' }],
      },
      {
        name: 'HiRISE ESP_042014_1760 и DTM DTEED_042014_1760_042647_1760_A01',
        use: 'Место Ares 4, кратер Скиапарелли',
        credit: 'NASA/JPL/University of Arizona; DTM USGS',
        links: [{ label: 'uahirise.org', url: 'https://www.uahirise.org/ESP_042014_1760' }],
      },
      {
        name: 'THEMIS, серия «The Martian, Part 1–5»',
        use: 'Координаты пути Уотни: Ацидалия, долина Маурт, Меридиана, Скиапарелли',
        credit: 'NASA/JPL-Caltech/ASU',
        links: ['PIA19796', 'PIA19797', 'PIA19798', 'PIA19799', 'PIA19800'].map(PIA),
      },
      {
        name: 'HiRISE: The Entrance to Mawrth Vallis',
        use: 'Заметка о том, насколько трудный этот путь на самом деле',
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
    items: [
      {
        name: 'NASA MMGIS: Perseverance и Ingenuity',
        use: 'Маршруты на шаре и на рельефе',
        credit: 'NASA/JPL-Caltech',
        links: [
          { label: 'Путь', url: `${MMGIS}/M20/Layers/json/M20_traverse.json` },
          { label: 'Точки', url: `${MMGIS}/M20/Layers/json/M20_waypoints.json` },
          { label: 'Текущее место', url: `${MMGIS}/M20/Layers/json/M20_waypoints_current.json` },
          { label: 'Полёты Ingenuity', url: `${MMGIS}/M20/Layers/json/m20_heli_waypoints.json` },
        ],
      },
      {
        name: 'NASA MMGIS: Curiosity',
        use: 'Маршруты на шаре и на рельефе',
        credit: 'NASA/JPL-Caltech',
        links: [
          { label: 'Точки', url: `${MMGIS}/MSL/Layers/json/MSL_waypoints.json` },
          { label: 'Текущее место', url: `${MMGIS}/MSL/Layers/json/MSL_waypoints_current.json` },
        ],
      },
      {
        name: 'Места посадок и завершённые миссии',
        use: 'Памятные места: координаты и даты, места посадок в каталоге исследований',
        credit: 'NASA GISS, NASA NSSDCA, NASA/JPL-Caltech, Wikipedia',
        links: [
          { label: 'Mars24: посадочные аппараты', url: 'https://www.giss.nasa.gov/tools/mars24/help/landers.html' },
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
        use: 'Фоновая музыка',
        credit: 'Синтез Web Audio, без записей',
        links: [],
      },
    ],
  },
  {
    id: 'radiation',
    title: 'Радиация, погода и космическая погода',
    items: [
      {
        name: 'MSL RAD, сол 3290, 87 измерений',
        use: 'Архив радиации на этой странице',
        credit: 'NASA/JPL-Caltech/SwRI. Продукт RAD_RDR_2021_311_00_43_3290_V00',
        links: [{ label: 'PDS PPI', url: 'https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/' }],
      },
      {
        name: 'ISWA HAPI, набор msl_rad_dosimetry',
        use: 'Свежие данные RAD в кратере Гейл',
        credit: 'NASA CCMC ISWA; MSL RAD, NASA/JPL-Caltech/SwRI',
        links: [{ label: 'ISWA HAPI', url: 'https://iswa.gsfc.nasa.gov/IswaSystemWebApp/hapi' }],
      },
      {
        name: 'NOAA SWPC: протоны и рентген GOES',
        use: 'Космическая погода у Земли по шкалам NOAA',
        credit: 'NOAA Space Weather Prediction Center',
        links: [{ label: 'SWPC JSON', url: 'https://services.swpc.noaa.gov/json/' }],
      },
      {
        name: 'NASA CCMC DONKI',
        use: 'События космической погоды в прогулке. Это условия у Земли, приход к Марсу оценочный',
        credit: 'NASA CCMC',
        links: [{ label: 'DONKI', url: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/' }],
      },
      {
        name: 'MSL REMS',
        use: 'Погода в Гейле. NASA помечает эту ленту как просветительскую',
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
    items: [
      {
        name: 'NASA GISS Mars24 (Allison & McEwen, 2000)',
        use: 'Местное время на Марсе, номер сола, положение Солнца и небо',
        credit: 'NASA GISS',
        links: [
          { label: 'Алгоритм', url: 'https://www.giss.nasa.gov/tools/mars24/help/algorithm.html' },
          { label: 'Заметки', url: 'https://www.giss.nasa.gov/tools/mars24/help/notes.html' },
        ],
      },
      {
        name: 'JPL Horizons',
        use: 'Время прохождения сигнала Земля–Марс на 2026–2028 годы',
        credit: 'NASA/JPL Solar System Dynamics',
        links: [{ label: 'Horizons', url: 'https://ssd.jpl.nasa.gov/horizons/' }],
      },
    ],
  },
  {
    id: 'methods',
    title: 'Модели и методы',
    items: [
      {
        name: 'Скорость ходьбы в скафандре V = −0,01·θ + 0,75 м/с',
        use: 'Скорость, расход кислорода, время возврата на базу',
        credit: 'Данные выходов Apollo; Santee et al. (2001), Aviat. Space Environ. Med. 72(6): 562–566',
        links: [
          {
            label: 'TZ_EVA_Safety.md, 9.1',
            url: 'https://github.com/Goslinuly/nasa-hackathon/blob/main/docs/TZ_EVA_Safety.md',
          },
        ],
      },
      {
        name: 'Коридор дозы 0,64 ± 0,12 мЗв/сут',
        use: 'Доза за запланированный выход',
        credit: 'Измерения MSL RAD на поверхности',
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
    items: [
      {
        name: 'Модель Mars 2020 Perseverance',
        use: 'Ровер на шаре и в прогулке',
        credit: 'NASA/JPL-Caltech, NASA 3D Resources',
        links: [
          { label: 'NASA 3D Resources', url: 'https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/' },
        ],
      },
      {
        name: 'Модели кратеров Гейл и Езеро',
        use: 'Дальние стены кратеров вокруг прогулки',
        credit: 'Сделаны командой в Blender по продуктам USGS Astrogeology, выровнены по MOLA MEGDR',
        links: [
          { label: 'RESOURCES.md', url: 'https://github.com/Goslinuly/nasa-hackathon/blob/main/docs/RESOURCES.md' },
        ],
      },
      {
        name: 'Панорама ночного неба',
        use: 'Небо в прогулке для любого места и времени',
        credit: 'Рендер команды',
        links: [],
      },
    ],
  },
];
