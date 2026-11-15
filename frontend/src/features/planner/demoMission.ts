// Демо-миссия для показа за две минуты: научная цель boxwork в Гейле, точки и режим расхода одним нажатием.
import type { LonLat } from './routing';

export interface DemoMission {
  id: string;
  title: string;
  titleEn: string;
  science: string;
  scienceEn: string;
  plan: string;
  planEn: string;
  a: LonLat;
  stops: LonLat[];
  b: LonLat;
}

export const DEMO_MISSION: DemoMission = {
  id: 'gale-boxwork',
  title: 'Демо-миссия: boxwork в Гейле',
  titleEn: 'Demo mission: boxwork in Gale',
  science:
    'Научная цель — полигоны boxwork на склоне горы Шарп: Curiosity изучал их в 2025 году, поэтому рядом есть реальный трек и снимки с поверхности.',
  scienceEn:
    'Science target: boxwork polygons on the slope of Mount Sharp. Curiosity studied them in 2025, so a real rover track and surface images are nearby.',
  plan:
    'Лагерь A → площадка boxwork → обзорная точка Б. Цена шага — кислород по модели EVA, рельеф — HiRISE DTM, грунт и изрезанность — из данных NASA.',
  planEn:
    'Camp A → boxwork site → viewpoint B. Step cost is oxygen from the EVA model, terrain is the HiRISE DTM, surface and ruggedness come from NASA data.',
  a: { lon: 137.385921, lat: -4.797816 },
  stops: [{ lon: 137.38127, lat: -4.808271 }],
  b: { lon: 137.3902, lat: -4.8125 },
};
