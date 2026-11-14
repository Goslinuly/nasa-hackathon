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

**Current state** (works on the live site):

- 3D globe of Mars with switchable layers: natural colour (Viking MDIM 2.1), relief shading and hypsometry (HRSC + MOLA), THEMIS day and night infrared, CTX 5 m imagery and HiRISE 0.25 m imagery in Jezero crater. The globe relief is built from MOLA elevation data.
- For any point on Mars the map reports what data exists there: overview only, or a candidate detailed terrain model (37 HiRISE DTMs registered for six regions).
- 2D atlas map with the same imagery.
- Route planner from any point A to any point B: shortest path over the MOLA elevation grid with a slope limit, with an elevation profile. The page states that this is an overview estimate on a ~7 km grid, not a checked walking path.
- Research along the route: landing sites and studies near the planned path, and an analysis of archived Curiosity RAD radiation measurements, labelled as archive data from Gale crater.

**In progress:**

- Local EVA scene for the lower slopes of Mount Sharp (Gale crater, boxwork area), where Curiosity studied boxwork formations in 2025: a 680 m walk between two points with real surface panoramas, on 1 m HiRISE terrain.
- First-person view with a helmet-style display: coordinates, Mars local time and Earth time, signal delay to Earth, slope underfoot, time to return to base, radiation dose for the walk.
- Walking speed in a spacesuit as a function of slope, point of no return, radiation dose corrected for altitude and terrain shielding.
- The Martian locations: Ares 3 and Ares 4 from Andy Weir's novel, on real HiRISE terrain models of those exact places.

### How it addresses the challenge

- **Layered view from several missions:** MGS (MOLA), Viking, Mars Express (HRSC), Mars Odyssey (THEMIS), MRO (CTX, HiRISE), MSL Curiosity (RAD, traverse), Mars 2020 Perseverance (traverse, images). Data types: optical, topographic, thermal, radiation.
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
