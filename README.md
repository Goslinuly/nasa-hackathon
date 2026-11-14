# Martian Map

Project for the NASA Space Apps Challenge 2026, challenge **Interplanetary Survival Guide: Martian Map**.

Live site: https://web-production-58753ec9.up.railway.app

## Challenge

NASA has explored Mars robotically for decades, studying its extreme environment, mapping its surface, and collecting many types of data. Far from home, the first astronauts to set foot on Mars will want the best map possible, with information on the details of their routes and destinations, updates on current conditions, and the data needed to complete their mission quickly and safely.

The challenge is to create a layered, integrated view of a location or route on the Martian surface that pulls together data from multiple NASA science missions and could help a human explorer plan and carry out a successful Marswalk while conducting new and exciting science along the way.

Challenge page: https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/

## What we are building

A map for planning a Marswalk in one area of Mars. It combines several kinds of mission data on one view (imagery, topography, geology, thermal data, radiation and surface conditions), shows a walking route that avoids steep slopes and large obstacles, and marks science stops along the way. Where surface rover images exist, they are shown at the points where they were taken so the crew can see what to expect on the ground.

## Data sources

Every source used in the project is listed here with its credit, as required by the Space Apps rules. Each dataset keeps its own terms of use; credits are also shown in the app next to the layers.

### Challenge resources

Official resources from the challenge page.

| Source | Used for |
|---|---|
| [JPL Mars Trek](https://trek.nasa.gov/mars/) | Base maps and global data layers |
| [USGS-NASA Planetary Geologic Mapping Program](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars) | Geologic map of Mars |
| [Curiosity's proposed path up Mount Sharp](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/) | Example of a science route map |
| [NASA Worldview](https://worldview.earthdata.nasa.gov/) | Reference for layered map interface (Earth data) |
| [Mars Perseverance Raw Images](https://mars.nasa.gov/mars2020/multimedia/raw-images/) | Surface images from the rover |

### Data used in the application

| Dataset | Used for | Credit |
|---|---|---|
| [MGS MOLA MEGDR 16 px/deg](https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/), `MEGT90N000EB.IMG`, PDS Geosciences Node | Globe relief, overview route planning, elevation profile | NASA/GSFC, MOLA Science Team |
| [Mars Trek WMTS](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars): Viking MDIM 2.1 colour mosaic, 232 m | Natural-colour globe and 2D map | NASA/JPL/USGS |
| Mars Trek WMTS: HRSC + MOLA blended DEM, hillshade and colour hillshade, 200 m | Relief shading and hypsometric layer | DLR/FU Berlin (ESA Mars Express HRSC), NASA/GSFC (MOLA) |
| Mars Trek WMTS: THEMIS Day IR and Night IR controlled mosaics, 100 m | Thermal layers | NASA/JPL/ASU |
| Mars Trek WMTS: Mars 2020 TRN HiRISE ortho mosaic, Jezero, 0.25 m | Detailed imagery in Jezero crater | NASA/JPL/University of Arizona |
| [Global CTX Mosaic V01](https://murray-lab.caltech.edu/CTX/V01/), served through [JMARS](https://jmars.asu.edu/node/2844) WMS | 5 m imagery on the globe and 2D map | NASA/JPL/MSSS/The Murray Lab (Caltech); ASU JMARS. Citation terms on the source page |
| [USGS STAC: HiRISE DTMs and orthoimages](https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/) | Registry of detailed terrain candidates, local terrain | NASA/JPL/University of Arizona; DTMs by USGS Astrogeology. CC0-1.0 per STAC items |
| MSL RAD dose rate, sol 3290 (87 observations) | Radiation panel | NASA/JPL-Caltech/SwRI. Team-supplied file; the primary PDS product is not yet identified, see `backend/data/science/README.md` |
| [Mars24 lander locations](https://www.giss.nasa.gov/tools/mars24/help/landers.html), [List of Mars landers](https://en.wikipedia.org/wiki/List_of_Mars_landers) | Coordinates of landing sites in the research catalogue | NASA GISS; Wikipedia |

### 3D terrain of The Martian locations

Used by [`backend/scripts/build_martian_obj.py`](backend/scripts/build_martian_obj.py) and [docs/BLENDER_TERRAIN.md](docs/BLENDER_TERRAIN.md).

| Source | Used for | Credit |
|---|---|---|
| HiRISE DTM `DTEEC_041277_2115_040776_2115_A01` and ortho [ESP_040776_2115](https://www.uahirise.org/ESP_040776_2115) | Ares 3 site, Acidalia Planitia. The image was targeted at the coordinates Andy Weir sent to the HiRISE team | NASA/JPL/University of Arizona; DTM USGS |
| HiRISE DTM `DTEED_042014_1760_042647_1760_A01` and ortho [ESP_042014_1760](https://www.uahirise.org/ESP_042014_1760) | Ares 4 site, Schiaparelli crater | NASA/JPL/University of Arizona; DTM USGS |
| THEMIS series "The Martian, Part 1–5": [PIA19796](https://pds-rings.seti.org/press_releases/pages/PIA19xxx/PIA19796.html), [PIA19797](https://pds-rings.seti.org/press_releases/pages/PIA19xxx/PIA19797.html), [PIA19798](https://pds-rings.seti.org/press_releases/pages/PIA19xxx/PIA19798.html), [PIA19799](https://pds-rings.seti.org/press_releases/pages/PIA19xxx/PIA19799.html), [PIA19800](https://pds-rings.seti.org/press_releases/pages/PIA19xxx/PIA19800.html) | Coordinates of Watney's route: Acidalia, Mawrth Vallis, Meridiani, Schiaparelli | NASA/JPL-Caltech/ASU |
| [HiRISE: The Entrance to Mawrth Vallis](https://www.uahirise.org/anaglyph/ESP_049017_2060_ESP_048595_2060_RED) | Note on how hard the route really is | NASA/JPL/University of Arizona |

### Rover traverses

| Source | Used for | Credit |
|---|---|---|
| NASA MMGIS GeoJSON: [Perseverance traverse](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json), [current position](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json), [Ingenuity flights](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/m20_heli_waypoints.json) | Rover routes on the terrain | NASA/JPL-Caltech |
| NASA MMGIS GeoJSON: [Curiosity traverse](https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json), [current position](https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints_current.json) | Rover routes on the terrain | NASA/JPL-Caltech |

Sources for planned features (Mars time, space weather, weather archives) are listed in [docs/TZ_First_Person.md](docs/TZ_First_Person.md) and are added to this list when they are connected. The full research catalogue with checks and limitations is in [docs/RESOURCES.md](docs/RESOURCES.md).

## Структура репозитория

- `backend/` — FastAPI + PostgreSQL/PostGIS + Celery: каталог продуктов, покрытие, маршруты ([инструкция запуска](backend/README.md)).
- `frontend/` — React + TypeScript + Vite: атлас, экспедиция, научные панели ([инструкция запуска](frontend/README.md)).
- `infra/` — docker-compose для локальной инфраструктуры (PostGIS, Redis, MinIO, API, worker).
- `docs/` — ТЗ, каталог ресурсов и [архитектурная основа](docs/ARCHITECTURE.md).

## Документация

- [Полное техническое задание версии 4.1](docs/TZ_Martian_Map_SpaceApps2026.md)
- [Техническое задание версии 4.1 в Word](docs/TZ_Martian_Map_SpaceApps2026_v4_1.docx)
- [Ресурсы, источники информации и базы данных](docs/RESOURCES.md)
- [Ресурсы, источники информации и базы данных в Word](docs/RESOURCES.docx)
- [Деплой на Railway без CLI](docs/DEPLOY_RAILWAY.md)
- [Рельеф мест из «Марсианина» в Blender](docs/BLENDER_TERRAIN.md)
- [Переход с глобуса в вид от первого лица и экран выхода](docs/TZ_First_Person.md)
- [Черновик страницы проекта для Space Apps](docs/SPACE_APPS_PROJECT.md)

## Team

| Member | Area |
|---|---|
| Tomiris | Frontend, infrastructure, backend application, tests and data, documentation |
| Nursultan | Repository, CI, deployment on Railway, code review, Space Apps project page, data credits, demo and presentation |

## License

Code in this repository is released under the [MIT License](LICENSE).

Data, images and other third-party materials keep their own licenses and credits and are not covered by the MIT License. NASA imagery is credited to NASA/JPL-Caltech and the respective mission teams unless the source states otherwise.
