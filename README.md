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
| MSL RAD dose rate, sol 3290 (87 observations) | Radiation panel | NASA/JPL-Caltech/SwRI. Extract of PDS PPI [MSL-M-RAD-3-RDR-V1.0](https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/), product `RAD_RDR_2021_311_00_43_3290_V00`, see `backend/data/science/README.md` |
| [USGS Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/) (IAU WGPSN), served as an [ArcGIS feature service](https://services5.arcgis.com/AMh9EzyFGgthLT1q/arcgis/rest/services/MARS_nomenclature/FeatureServer) | 1897 feature names on the 2D atlas | IAU WGPSN, USGS Astrogeology |
| Geologic Map of Mars, [USGS SIM 3292](https://pubs.usgs.gov/sim/3292/) (Tanaka et al., 2014), [ArcGIS feature service](https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Tanaka_et_al_2014_Mars_Global_Map_Features/FeatureServer) | Geology layer with a legend of 44 units | USGS Astrogeology |
| TES thermal inertia (Putzig & Mellon, 2007), [ASU WMS](http://ms-mars.mars.asu.edu/TES_TI_Putzig_day_numeric) | Ground type proxy for route cost | NASA/JPL/ASU, MGS TES |
| [ISWA HAPI](https://iswa.gsfc.nasa.gov/IswaSystemWebApp/hapi), dataset `msl_rad_dosimetry` | Live RAD dose rate at Gale | NASA CCMC ISWA; MSL RAD, NASA/JPL-Caltech/SwRI |
| [NOAA SWPC JSON services](https://services.swpc.noaa.gov/json/): GOES protons and X-rays | Live space weather at Earth with NOAA scales | NOAA Space Weather Prediction Center |
| [MSL REMS weather feed](https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json) | Gale weather in the EVA panel; the feed is labelled by NASA as for public outreach | NASA/JPL-Caltech, CAB (CSIC-INTA) |
| [NASA CCMC DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI/), API `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/` | Space weather events in the walk HUD (`/api/v1/space-weather/events`). Conditions near Earth; arrival at Mars is an estimate | NASA CCMC |
| [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/), API `https://ssd.jpl.nasa.gov/api/horizons.api` | Earth–Mars one-way light time table 2026–2028 | NASA/JPL Solar System Dynamics |
| [NASA GISS Mars24 algorithm](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html) and [technical notes](https://www.giss.nasa.gov/tools/mars24/help/notes.html) | Mars local time, sol numbers, sun position in the HUD | NASA GISS |
| [Mars24 lander locations](https://www.giss.nasa.gov/tools/mars24/help/landers.html), [List of Mars landers](https://en.wikipedia.org/wiki/List_of_Mars_landers) | Coordinates of landing sites in the research catalogue | NASA GISS; Wikipedia |

### Models and methods

| Model | Used for | Reference |
|---|---|---|
| Mars24 time algorithm | Mars local time, sol numbers, sun position, sky | Allison & McEwen (2000), [NASA GISS Mars24](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html) |
| Suit walking speed `V = −0.01·θ + 0.75` m/s and metabolic cost on slopes | Walking speed, route cost in oxygen, time back to base | Apollo EVA traverse data as summarised in [docs/TZ_EVA_Safety.md](docs/TZ_EVA_Safety.md), 9.1; Santee et al. (2001), "A proposed model for load carriage on sloped terrain", Aviat. Space Environ. Med. 72(6): 562–566 |
| Radiation dose corridor 0.64 ± 0.12 mSv/day | Dose for a planned EVA | MSL RAD surface measurements, see [docs/TZ_EVA_Safety.md](docs/TZ_EVA_Safety.md), 9.4 |

### 3D models and renders

| Asset | Used for | Credit |
|---|---|---|
| Mars 2020 Perseverance rover model, [NASA 3D Resources](https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/) (`frontend/public/models/perseverance.glb`, re-saved in Blender with Draco and WebP compression) | Rover driving the planned route on the globe and in the walk | NASA/JPL-Caltech |
| Gale and Jezero crater models (`galecode.glb`, `jezerocode.glb`) | Distant crater walls around the HiRISE walk areas | Made by the team in Blender from USGS Astrogeology elevation and image products listed in [docs/RESOURCES.md](docs/RESOURCES.md); aligned to MOLA MEGDR |
| Night sky panorama (`gale_night_sky.hdr` → `frontend/public/data/sky/milkyway_icrf.webp`) | Sky in the walk, turned to celestial coordinates for any place and time | Rendered by the team |

### Local 3D terrain: The Martian locations and Gale crater

Used by [`backend/scripts/build_martian_obj.py`](backend/scripts/build_martian_obj.py), [`backend/scripts/build_local_package.py`](backend/scripts/build_local_package.py) and [docs/BLENDER_TERRAIN.md](docs/BLENDER_TERRAIN.md).

| Source | Used for | Credit |
|---|---|---|
| HiRISE DTM `DTEEC_041277_2115_040776_2115_A01` and ortho [ESP_040776_2115](https://www.uahirise.org/ESP_040776_2115) | Ares 3 site, Acidalia Planitia. The image was targeted at the coordinates Andy Weir sent to the HiRISE team | NASA/JPL/University of Arizona; DTM USGS |
| HiRISE DTM `DTEED_042014_1760_042647_1760_A01` and ortho [ESP_042014_1760](https://www.uahirise.org/ESP_042014_1760) | Ares 4 site, Schiaparelli crater | NASA/JPL/University of Arizona; DTM USGS |
| THEMIS series "The Martian, Part 1–5": [PIA19796](https://pds-rings.seti.org/press_releases/pages/PIA19xxx/PIA19796.html), [PIA19797](https://pds-rings.seti.org/press_releases/pages/PIA19xxx/PIA19797.html), [PIA19798](https://pds-rings.seti.org/press_releases/pages/PIA19xxx/PIA19798.html), [PIA19799](https://pds-rings.seti.org/press_releases/pages/PIA19xxx/PIA19799.html), [PIA19800](https://pds-rings.seti.org/press_releases/pages/PIA19xxx/PIA19800.html) | Coordinates of Watney's route: Acidalia, Mawrth Vallis, Meridiani, Schiaparelli | NASA/JPL-Caltech/ASU |
| HiRISE DTM `DTEEC_019698_1750_019988_1750_U01` and ortho `ESP_019698_1750_RED_A_01_ORTHO` ([USGS STAC](https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/)) | Local package for the EVA demo: Gale crater, boxwork area on Mount Sharp, built by [`backend/scripts/build_local_package.py`](backend/scripts/build_local_package.py) | NASA/JPL/University of Arizona; DTM USGS |
| Mars 2020 TRN HiRISE DTM and orthomosaic ([USGS, doi:10.5066/P9REJ9JN](https://doi.org/10.5066/P9REJ9JN)) and Mars 2020 TRN CTX DTM 20 m and orthomosaic 6 m ([USGS, doi:10.5066/P906QQT8](https://doi.org/10.5066/P906QQT8)) | Local package for Jezero: Perseverance's recent route. HiRISE covers 26 % of the area, the rest is CTX | NASA/JPL/University of Arizona, NASA/JPL/MSSS; USGS Astrogeology (Fergason et al.) |
| [HiRISE: The Entrance to Mawrth Vallis](https://www.uahirise.org/anaglyph/ESP_049017_2060_ESP_048595_2060_RED) | Note on how hard the route really is | NASA/JPL/University of Arizona |

### Rover traverses and missions

| Source | Used for | Credit |
|---|---|---|
| NASA MMGIS GeoJSON: [Perseverance traverse](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json), [waypoints](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json), [current position](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json), [Ingenuity flights](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/m20_heli_waypoints.json) | Rover routes on the globe and on the terrain | NASA/JPL-Caltech |
| NASA MMGIS GeoJSON: [Curiosity waypoints](https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json), [current position](https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints_current.json) | Rover routes on the globe and on the terrain | NASA/JPL-Caltech |
| [Mars24 lander locations](https://www.giss.nasa.gov/tools/mars24/help/landers.html); NASA NSSDCA pages for [Viking 1](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1975-075C), [Viking 2](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1975-083C), [Mars Pathfinder](https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1996-068A); [JPL: Ingenuity mission ends](https://www.jpl.nasa.gov/news/after-three-years-on-mars-nasas-ingenuity-helicopter-mission-ends/); [Wikipedia: Opportunity](https://en.wikipedia.org/wiki/Opportunity_(rover)) | Memorial: coordinates and dates of completed missions; origin of the "battery is low" paraphrase | NASA GISS, NASA NSSDCA, NASA/JPL-Caltech, Wikipedia |
| Memorial music | Background music in the memorial | Own Web Audio synthesis, no recordings |

Sources for features that are not connected yet (for example weather archives) are listed in [docs/TZ_First_Person.md](docs/TZ_First_Person.md) and are added here when they are connected. The full research catalogue with checks and limitations is in [docs/RESOURCES.md](docs/RESOURCES.md).

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
- [EVA-режим: состояние внедрения](docs/EVA_IMPLEMENTATION.md)
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
