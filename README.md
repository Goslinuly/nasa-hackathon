# Martian Map

Project for the NASA Space Apps Challenge 2026, challenge **Interplanetary Survival Guide: Martian Map**.

## Challenge

NASA has explored Mars robotically for decades, studying its extreme environment, mapping its surface, and collecting many types of data. Far from home, the first astronauts to set foot on Mars will want the best map possible, with information on the details of their routes and destinations, updates on current conditions, and the data needed to complete their mission quickly and safely.

The challenge is to create a layered, integrated view of a location or route on the Martian surface that pulls together data from multiple NASA science missions and could help a human explorer plan and carry out a successful Marswalk while conducting new and exciting science along the way.

Challenge page: https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/

## What we are building

A map for planning a Marswalk in one area of Mars. It combines several kinds of mission data on one view (imagery, topography, geology, thermal data, radiation and surface conditions), shows a walking route that avoids steep slopes and large obstacles, and marks science stops along the way. Where surface rover images exist, they are shown at the points where they were taken so the crew can see what to expect on the ground.

## Data sources

| Source | Used for |
|---|---|
| [JPL Mars Trek](https://trek.nasa.gov/mars/) | Base maps and global data layers |
| [USGS-NASA Planetary Geologic Mapping Program](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars) | Geologic map of Mars |
| [Curiosity's proposed path up Mount Sharp](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/) | Example of a science route map |
| [NASA Worldview](https://worldview.earthdata.nasa.gov/) | Reference for layered map interface (Earth data) |
| [Mars Perseverance Raw Images](https://mars.nasa.gov/mars2020/multimedia/raw-images/) | Surface images from the rover |

Every dataset added to the project is listed here with its source and credit, as required by the Space Apps rules.

## Repository structure

```text
backend/                     FastAPI + PostgreSQL/PostGIS + Celery
  src/martian_map/
    api/                     HTTP app, error handling, routes (health, coverage, catalog, science)
    modules/
      catalog/               sources, products, versions, product registry
      coordinates/           Mars coordinates: planetocentric lat, east lon 0-360
      coverage/              data coverage for a point, candidate HiRISE DTM areas
      science/               research catalogue, RAD measurements and import
      routing/               route plans and segments (models)
      panoramas/             panorama points (models)
      publication/           import, QA and publication (models)
    infrastructure/          database session
    worker/                  Celery tasks
  alembic/                   database migrations
  scripts/                   seeding, heightmap build, science import, env check
  data/                      product registry and science input files
  tests/
frontend/                    React + TypeScript + Vite + Three.js
  src/
    app/                     app shell and styles
    features/
      globe/                 3D Mars globe, Mars Trek tiles, MOLA terrain
      map/                   2D atlas map
      planner/               A to B route planner (web worker), elevation profile
      science/               science panel, research along the route
      coverage/              coverage card for a selected point
    shared/api/              API client and types
    shared/coordinates/      Mars coordinate helpers
  public/data/globe/         MOLA heightmap for the globe
infra/                       docker-compose for local PostGIS, Redis, MinIO, API, worker
docs/                        specification, resources catalogue, architecture
.github/workflows/           CI: backend lint and tests, migrations, frontend build and tests
```

How to run each part: [backend/README.md](backend/README.md), [frontend/README.md](frontend/README.md).

Local infrastructure:

```bash
docker compose -f infra/docker-compose.yml up -d
```

## Documentation

- [Specification v4.1](docs/TZ_Martian_Map_SpaceApps2026.md)
- [EVA safety mode specification](docs/TZ_EVA_Safety.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Resources and data sources catalogue](docs/RESOURCES.md)

## Team

| Member | Area |
|---|---|
| Tomiris | Frontend, infrastructure, backend application, tests and data, documentation |
| Nursultan | Repository, CI, deployment on Railway, code review, Space Apps project page, data credits, demo and presentation |

## License

Code in this repository is released under the [MIT License](LICENSE).

Data, images and other third-party materials keep their own licenses and credits and are not covered by the MIT License. NASA imagery is credited to NASA/JPL-Caltech and the respective mission teams unless the source states otherwise.
