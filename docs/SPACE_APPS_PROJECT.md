# Space Apps project page — draft

Text for the project submission on spaceappschallenge.org. Field names follow the usual submission form; check them against the form in the team account and move the text field by field. Keep the "Current state" part honest: update it right before submitting so it lists only what works on the live site.

---

## Project name

Martian Map

## Challenge

Interplanetary Survival Guide: Martian Map

## High-level summary

Martian Map is a web map for planning a Marswalk. It starts from a 3D globe of Mars with layers from several NASA missions (imagery, relief, thermal infrared, radiation) and narrows down to the scale of one surface excursion, where an astronaut needs to know which slope is too steep, how far it is back to the base and what the ground looks like. For every place the map shows how detailed the data really is, so a route drawn over coarse orbital data is never presented as a checked walking path.

## Links

- Live site: https://web-production-58753ec9.up.railway.app
- Source code: https://github.com/Goslinuly/nasa-hackathon (MIT License)
- Demo video / slides: _add before submitting_

## Project details

### What it does

**Current state** (works on the live site, checked on 14 November 2026):

- **Main screen.** A 3D Mars globe sits in the background of the landing page. «Explore Mars» flies the camera in, and mode buttons appear on the globe: build a route, first-person walk, rover routes, The Martian route, memorial, 2D atlas, layers. Every mode has its own link (`#rovers`, `#walk/gale-boxwork`, …).
- **Layered globe and atlas.** Natural colour (Viking MDIM 2.1), relief and hypsometry (HRSC + MOLA), THEMIS day and night infrared, CTX 5 m and HiRISE 0.25 m imagery, the USGS geologic map (SIM 3292) with a legend, and 1897 official feature names. For any point the map says what data exists there: the point coverage panel answers from the products the build actually serves — the global MOLA grid and the three detailed packages, each with its resolution, credit and limits — and separately lists the catalog entries that are still candidates. Inside a detailed package the panel names it and links to the walk.
- **Route planner A → B.** Works for any two points on Mars. Overview routing on MOLA, and on detailed terrain where it exists. Edge cost is the oxygen the astronaut spends: suit walking speed and metabolic cost depend on slope, ground type comes from TES thermal inertia, and very rough ground is excluded. The planner can route through science stops. It shows an elevation profile, time and oxygen corridors, the return rule with a 30 min reserve, slope thresholds with their origin, and the data level of each part of the route. Its EVA panel adds live radiation: Curiosity RAD at Gale (ISWA), GOES protons and X-rays with NOAA scales, and DONKI events, with the note that they describe conditions near Earth. A Perseverance 3D model drives the planned route on the globe.
- **Science targets along the path.** For any route the app reads the layers under it and says where it is worth stopping: contacts between geologic units (SIM 3292), rock exposures and sand fields from TES thermal inertia, the steepest scarp where layers are exposed in cross-section, and vantage points on the profile. Each target names the layer it came from and its resolution, and can be turned into a stop in one click, so the route is rebuilt through it. These are signs derived from orbital data, not measurements and not confirmed finds; the separate catalog search alongside it shows published studies near the path and says plainly when there are none.
- **First-person walk** on real HiRISE terrain in three places:
  - Gale crater, boxwork area on Mount Sharp, where Curiosity studied boxwork in 2025. The terrain is 1 m with 0.25 m imagery, and Curiosity's real track lies on it.
  - Ares 3, Acidalia Planitia: the site from The Martian, imaged by HiRISE at the coordinates Andy Weir sent to the HiRISE team.
  - Jezero crater, with Perseverance's recent route. There, the ground under the astronaut is labelled HiRISE 1 m or CTX 20 m, because HiRISE does not cover the rover's current position.

  Walking speed follows the suit model, too-steep slopes and areas without data are blocked, the sky follows Mars local time, and the walk starts in the morning.
- **Helmet HUD.** Coordinates and height, compass to base, Mars local time (LMST, LTST), Mars Sol Date, the rover's mission sol, UTC, signal delay to Earth (JPL Horizons), the sun and time to sunset, slope underfoot and ahead, time back to base, consumables and point of no return, and radiation:
  - archived Curiosity RAD measurements at Gale; elsewhere «no local measurements»;
  - a dose corridor for this walk (model);
  - DONKI events, with the note that they describe conditions near Earth.

  Every value has a badge: data, archive, model or no data.
- **Rover routes.** Perseverance, Curiosity and Ingenuity routes and last known positions from NASA MMGIS.
- **The Martian route.** Mark Watney's 3,500 km route from Ares 3 to Ares 4 over the MOLA relief, with an elevation profile, a fly-through, real THEMIS and HiRISE images of each stop, and the HiRISE team's note that the real terrain is much harder than in the book.
- **Memorial.** Missions that ended on the surface (Viking 1 and 2, Pathfinder and Sojourner, Spirit, Opportunity, Phoenix, InSight, Ingenuity, Zhurong), with dates and achievements, a candle, and quiet music synthesised in the browser.

**Not done or limited** (stated on the site where relevant):

- Terrain shielding from the real horizon, dust storm probability, pressure for any point (Mars Climate Database).
- Rover positions are requested from NASA MMGIS at runtime, but MMGIS itself publishes them with a delay of up to a few sols, and the traverse lines come from a stored snapshot.
- Science targets on an overview route are derived from global-scale layers: the geologic map is simplified to 0.02° (about 1.2 km) and TES thermal inertia is about 3 km per cell, so a target marks a place to look, not an outcrop found on the ground.
- The catalog of published studies holds 15 entries, so a search along an arbitrary route usually finds nothing nearby; the panel says so instead of leaving the user to guess.
- Frame rate is checked on an Apple M4 laptop (60 FPS); slower laptops are not measured yet.

### How it addresses the challenge

- **Layered view from several missions:** MGS (MOLA, TES), Viking, Mars Express (HRSC), Mars Odyssey (THEMIS), MRO (CTX, HiRISE), MSL Curiosity (RAD, REMS weather, traverse), Mars 2020 Perseverance and Ingenuity (traverse), plus GOES and DONKI for space weather. Data types: optical, topographic, thermal, geological, radiation, atmospheric.
- **Hyperlocal scale:** the challenge notes that existing tools work at regional and global scale. We go from the globe to 1–2 m terrain models of a single excursion area.
- **Safety first:** slope limits, return time and point of no return, radiation as a separate panel, space weather alerts. Every value is labelled as measurement, archive, model or "no data".
- **Point-of-view imagery:** rover panoramas and images at the places where they were taken.

### Benefits

- One view instead of switching between Mars Trek, JMARS, PDS archives and mission pages.
- Honest about data limits: the map shows where detailed data ends.
- Works in a browser, no installation.

### Tools and technology

React, TypeScript, Vite, Three.js; Python, FastAPI, PostgreSQL with PostGIS, Alembic; rasterio and NumPy for terrain preparation; Docker; Railway for hosting; GitHub Actions for tests.

### Creativity

The demo includes the route of Mark Watney from The Martian: Ares 3 in Acidalia Planitia to Ares 4 in Schiaparelli crater, with real orbital images of those sites taken by HiRISE in 2015 at the coordinates Andy Weir sent to the HiRISE team. It shows the difference between a route on the overview map and a walk that real data can support.

## Use of NASA data

Copy the tables "Challenge resources", "Data used in the application", "3D terrain of The Martian locations" and "Rover traverses" from the [README](../README.md#data-sources).

## Space agency partner data

HRSC data from ESA's Mars Express (DLR/FU Berlin), used through the HRSC + MOLA blended layers in Mars Trek.

## References

All sources with credits: [README — Data sources](../README.md#data-sources). Full research catalogue with checks and limitations: [docs/RESOURCES.md](RESOURCES.md).

## Tags

Mars, Human Exploration, EVA, Marswalk, Topography, HiRISE, MOLA, THEMIS, Radiation, Curiosity, Perseverance, 3D, WebGL

## Team

Fill in names and Space Apps usernames as registered in the team.
