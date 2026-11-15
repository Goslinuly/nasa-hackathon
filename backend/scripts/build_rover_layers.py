"""Сборка статических слоёв для режимов «Маршруты роверов», «Марсианин» и «Памятные места».

Скачивает GeoJSON из NASA MMGIS, упрощает треки (Дуглас — Пекер), строит маршрут
Марка Уотни с профилем высот по MOLA и пишет JSON в frontend/public/data.

Запуск: python backend/scripts/build_rover_layers.py [папка_с_кэшем]
"""

import json
import math
import sys
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from PIL import Image
from rover_layers_en import (
    TRAVERSE_NOTE_EN,
    with_current_en,
    with_missions_en,
    with_route_en,
)

MMGIS = "https://mars.nasa.gov/mmgis-maps"
URLS = {
    "m20_traverse": f"{MMGIS}/M20/Layers/json/M20_traverse.json",
    "m20_current": f"{MMGIS}/M20/Layers/json/M20_waypoints_current.json",
    "heli": f"{MMGIS}/M20/Layers/json/m20_heli_waypoints.json",
    # Именно Layers/json: файл с тем же именем уровнем выше устарел и кончается 2020 годом.
    "msl_waypoints": f"{MMGIS}/MSL/Layers/json/MSL_waypoints.json",
    "msl_current": f"{MMGIS}/MSL/Layers/json/MSL_waypoints_current.json",
}
CREDIT_MMGIS = "NASA/JPL-Caltech, MMGIS"
MARS24 = "https://www.giss.nasa.gov/tools/mars24/help/landers.html"

MARS_RADIUS_M = 3_389_500.0
MAX_POINTS = 2000
PROFILE_STEP_KM = 10.0

REPO_ROOT = Path(__file__).resolve().parents[2]
PUBLIC = REPO_ROOT / "frontend" / "public" / "data"
HEIGHT_PNG = PUBLIC / "globe" / "mola_megdr_8ppd_height.png"
HEIGHT_META = PUBLIC / "globe" / "mola_megdr_8ppd_height.json"


def fetch_json(key: str, cache: Path | None) -> dict:
    url = URLS[key]
    if cache is not None:
        local = cache / url.rsplit("/", 1)[1]
        if local.exists():
            return json.loads(local.read_text(encoding="utf-8"))
    print(f"Скачиваю {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "martian-map-build"})
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    if cache is not None:
        cache.mkdir(parents=True, exist_ok=True)
        (cache / url.rsplit("/", 1)[1]).write_bytes(data)
    return json.loads(data)


def lon360(lon: float) -> float:
    return round(lon % 360.0, 7)


# --- Упрощение ---------------------------------------------------------------------------


def douglas_peucker(xy: np.ndarray, epsilon: float) -> np.ndarray:
    """Индексы точек, которые остаются после упрощения (итеративно, без рекурсии)."""
    n = len(xy)
    if n < 3:
        return np.arange(n)
    keep = np.zeros(n, dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        start, end = stack.pop()
        if end - start < 2:
            continue
        a, b = xy[start], xy[end]
        seg = b - a
        pts = xy[start + 1 : end] - a
        length = math.hypot(seg[0], seg[1])
        if length == 0:
            dist = np.hypot(pts[:, 0], pts[:, 1])
        else:
            dist = np.abs(seg[0] * pts[:, 1] - seg[1] * pts[:, 0]) / length
        i = int(np.argmax(dist))
        if dist[i] > epsilon:
            mid = start + 1 + i
            keep[mid] = True
            stack.append((start, mid))
            stack.append((mid, end))
    return np.flatnonzero(keep)


def to_local_m(lons: np.ndarray, lats: np.ndarray) -> np.ndarray:
    """Плоские метры вокруг средней широты: для упрощения коротких треков этого хватает."""
    lat0 = math.radians(float(np.mean(lats)))
    k = math.pi / 180 * MARS_RADIUS_M
    return np.column_stack([lons * k * math.cos(lat0), lats * k])


def simplify_to_limit(xy: np.ndarray, limit: int) -> tuple[np.ndarray, float]:
    epsilon = 0.5
    while True:
        idx = douglas_peucker(xy, epsilon)
        if len(idx) <= limit:
            return idx, epsilon
        epsilon *= 1.5


def dedupe(rows: list[tuple[float, float, int]]) -> list[tuple[float, float, int]]:
    out: list[tuple[float, float, int]] = []
    for row in rows:
        if not out or (row[0], row[1]) != (out[-1][0], out[-1][1]):
            out.append(row)
    return out


def build_traverse(rows, *, name, source_url, fetched, total_m):
    rows = dedupe(rows)
    lons = np.array([r[0] for r in rows])
    lats = np.array([r[1] for r in rows])
    idx, epsilon = simplify_to_limit(to_local_m(lons, lats), MAX_POINTS)
    coords = [[lon360(lons[i]), round(float(lats[i]), 7)] for i in idx]
    sols = [rows[i][2] for i in idx]
    return {
        "type": "FeatureCollection",
        "name": name,
        "fetched_utc": fetched,
        "source_url": source_url,
        "credit": CREDIT_MMGIS,
        "note": "Упрощено алгоритмом Дугласа — Пекера; долгота восточная 0–360.",
        "note_en": TRAVERSE_NOTE_EN,
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "sols": sols,
                    "sol_first": sols[0],
                    "sol_last": sols[-1],
                    "source_points": len(rows),
                    "tolerance_m": round(epsilon, 2),
                    "dist_total_m": total_m,
                },
                "geometry": {"type": "LineString", "coordinates": coords},
            }
        ],
    }


def m20_rows(data: dict) -> list[tuple[float, float, int]]:
    rows = []
    for feature in data["features"]:
        sol = int(feature["properties"]["sol"])
        geometry = feature["geometry"]
        lines = geometry["coordinates"]
        if geometry["type"] == "LineString":
            lines = [lines]
        for line in lines:
            rows.extend((float(c[0]), float(c[1]), sol) for c in line)
    return rows


def msl_rows(data: dict) -> list[tuple[float, float, int]]:
    rows = []
    for feature in data["features"]:
        lon, lat = feature["geometry"]["coordinates"][:2]
        rows.append((float(lon), float(lat), int(feature["properties"]["sol"])))
    return rows


def current_entry(data: dict, *, rover_id, name, mission, url) -> dict:
    p = data["features"][-1]["properties"]
    return {
        "id": rover_id,
        "name": name,
        "mission": mission,
        "sol": int(p["sol"]),
        "lat": round(float(p["lat"]), 7),
        "lon": lon360(float(p["lon"])),
        "elevation_m": round(float(p["elev_geoid"]), 1),
        "dist_total_m": round(float(p["dist_total_m"]), 1),
        "source_url": url,
    }


def heli_entry(data: dict) -> dict:
    flights = []
    for feature in data["features"]:
        p = feature["properties"]
        flights.append(
            {
                "flight": int(p["Flight"]),
                "sol": int(p["Sol"]),
                "date": p["Earth_Date"],
                "lat": round(float(p["Lat"]), 7),
                "lon": lon360(float(p["Lon"])),
                "dist_m": round(float(p["Dist_m"]), 1),
                "max_alt_m": float(p["Max_Alt_m"]),
                "duration_s": float(p["Duration_s"]),
            }
        )
    flights.sort(key=lambda f: f["flight"])
    last = data["features"][-1]["properties"]
    return {
        "id": "ingenuity",
        "name": "Ingenuity",
        "mission": "Mars 2020",
        "status": "Миссия завершена 25 января 2024 года, последний полёт 18 января 2024",
        "flights_total": max(f["flight"] for f in flights),
        "dist_total_m": round(float(last["Total_m"]), 1),
        "note": "Полёт 0 — точка высадки вертолёта с ровера (4 апреля 2021).",
        "flights": flights,
        "source_url": URLS["heli"],
    }


# --- Маршрут «Марсианина» ----------------------------------------------------------------

HIRISE_MAWRTH = "https://www.uahirise.org/anaglyph/ESP_049017_2060_ESP_048595_2060_RED"
PIA = "https://pds-rings.seti.org/press_releases/pages/PIA19xxx/PIA{}.html"

STOPS = [
    {
        "id": "ares3",
        "name": "Ares 3",
        "place": "Acidalia Planitia",
        "lat": 31.380,
        "lon": 331.371,
        "novel": "Место посадки экспедиции Ares 3; Уотни остаётся один в жилом модуле.",
        "walk_site": "ares3",
        "images": [
            {
                "title": "HiRISE ESP_040776_2115 — снимок по координатам, присланным Энди Вейром",
                "url": "https://www.uahirise.org/ESP_040776_2115",
            },
            {"title": "THEMIS PIA19796 — The Martian, Part 1", "url": PIA.format(19796)},
        ],
        "coord_source": "https://www.uahirise.org/ESP_040776_2115",
    },
    {
        "id": "pathfinder",
        "name": "Mars Pathfinder",
        "place": "Ares Vallis",
        "lat": 19.47,
        "lon": 326.75,
        "side_trip": True,
        "novel": "Уотни ездит за посадочным модулем Pathfinder, чтобы восстановить связь.",
        "images": [],
        "coord_source": MARS24,
    },
    {
        "id": "mawrth",
        "name": "Mawrth Vallis",
        "place": "Mawrth Vallis",
        "lat": 24.4297,
        "lon": 341.726,
        "novel": "По долине Маурт ровер поднимается с равнины Ацидалия в Аравию.",
        "images": [
            {"title": "THEMIS PIA19797 — The Martian, Part 2", "url": PIA.format(19797)},
            {"title": "HiRISE: The Entrance to Mawrth Vallis", "url": HIRISE_MAWRTH},
        ],
        "coord_source": PIA.format(19797),
    },
    {
        "id": "meridiani",
        "name": "Meridiani Planum",
        "place": "Meridiani Planum",
        "lat": 2.51711,
        "lon": 355.154,
        "novel": "Уотни объезжает пылевую бурю и поворачивает на восток к Скиапарелли.",
        "images": [{"title": "THEMIS PIA19798 — The Martian, Part 3", "url": PIA.format(19798)}],
        "coord_source": PIA.format(19798),
    },
    {
        "id": "schiaparelli-rim",
        "name": "Вал Скиапарелли",
        "place": "Schiaparelli",
        "lat": -0.882761,
        "lon": 13.4529,
        "novel": "Спуск с вала в кратер; ровер едва не застревает в мягких отложениях.",
        "images": [{"title": "THEMIS PIA19799 — The Martian, Part 4", "url": PIA.format(19799)}],
        "coord_source": PIA.format(19799),
    },
    {
        "id": "ares4",
        "name": "Ares 4",
        "place": "Дно кратера Скиапарелли",
        "lat": -3.964,
        "lon": 15.200,
        "novel": "Здесь ждёт взлётный модуль MAV следующей экспедиции; конец пути.",
        "images": [
            {"title": "HiRISE ESP_042014_1760 — From Ares 3 to Ares 4", "url": "https://www.uahirise.org/ESP_042014_1760"},
            {"title": "THEMIS PIA19800 — The Martian, Part 5", "url": PIA.format(19800)},
        ],
        "coord_source": "https://www.uahirise.org/ESP_042014_1760",
    },
]


def to_vec(lat: float, lon: float) -> np.ndarray:
    la, lo = math.radians(lat), math.radians(lon)
    return np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])


def from_vec(v: np.ndarray) -> tuple[float, float]:
    lat = math.degrees(math.asin(max(-1.0, min(1.0, float(v[2])))))
    lon = math.degrees(math.atan2(float(v[1]), float(v[0]))) % 360.0
    return lat, lon


def great_circle(a: tuple[float, float], b: tuple[float, float], step_km: float):
    """Точки дуги большого круга от a до b (включительно) с шагом не больше step_km."""
    va, vb = to_vec(*a), to_vec(*b)
    omega = math.acos(max(-1.0, min(1.0, float(va @ vb))))
    length_km = omega * MARS_RADIUS_M / 1000
    n = max(1, math.ceil(length_km / step_km))
    points = []
    for i in range(n + 1):
        t = i / n
        if omega == 0:
            v = va
        else:
            v = (math.sin((1 - t) * omega) * va + math.sin(t * omega) * vb) / math.sin(omega)
        points.append(from_vec(v))
    return points, length_km


class HeightMap:
    def __init__(self, png: Path, meta_path: Path):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        rgb = np.asarray(Image.open(png).convert("RGB")).astype(np.int64)
        units = (rgb[..., 0] << 8) | rgb[..., 1]
        self.h = (units - meta["offset_units"]) * meta["step_m"]
        self.ppd = meta["pixels_per_degree"]
        self.meta = meta

    def sample(self, lat: float, lon: float) -> float:
        """Билинейная интерполяция по центрам пикселей."""
        rows, cols = self.h.shape
        x = (lon % 360.0) * self.ppd - 0.5
        y = (90.0 - lat) * self.ppd - 0.5
        x0, y0 = math.floor(x), math.floor(y)
        fx, fy = x - x0, y - y0
        y0c = min(max(y0, 0), rows - 1)
        y1c = min(max(y0 + 1, 0), rows - 1)
        x0w, x1w = x0 % cols, (x0 + 1) % cols
        top = self.h[y0c, x0w] * (1 - fx) + self.h[y0c, x1w] * fx
        bottom = self.h[y1c, x0w] * (1 - fx) + self.h[y1c, x1w] * fx
        return float(top * (1 - fy) + bottom * fy)


def build_route(fetched: str) -> dict:
    heights = HeightMap(HEIGHT_PNG, HEIGHT_META)
    main = [s for s in STOPS if not s.get("side_trip")]
    line: list[list[float]] = []
    profile = []
    total_km = 0.0
    stops_out = []
    for i, stop in enumerate(main):
        stop_km = total_km
        if i > 0:
            prev = main[i - 1]
            pts, seg_km = great_circle((prev["lat"], prev["lon"]), (stop["lat"], stop["lon"]),
                                       PROFILE_STEP_KM)
            n = len(pts) - 1
            for j, (lat, lon) in enumerate(pts[1:], start=1):
                d = total_km + seg_km * j / n
                line.append([round(lon, 4), round(lat, 4)])
                profile.append([round(d, 1), round(heights.sample(lat, lon))])
            total_km += seg_km
            stop_km = total_km
        else:
            line.append([stop["lon"], stop["lat"]])
            profile.append([0.0, round(heights.sample(stop["lat"], stop["lon"]))])
        stops_out.append({**stop, "route_km": round(stop_km, 1)})

    side = next(s for s in STOPS if s.get("side_trip"))
    ares3 = main[0]
    side_pts, side_km = great_circle((ares3["lat"], ares3["lon"]), (side["lat"], side["lon"]),
                                     PROFILE_STEP_KM)
    for stop in stops_out:
        stop["elevation_m"] = round(heights.sample(stop["lat"], stop["lon"]))
    stops_out.insert(1, {**side, "route_km": None,
                         "elevation_m": round(heights.sample(side["lat"], side["lon"])),
                         "side_trip_km": round(side_km, 1)})

    elevations = [p[1] for p in profile]
    return {
        "fetched_utc": fetched,
        "title": "Маршрут Марка Уотни («Марсианин», Энди Вейр)",
        "note": "Маршрут из романа. Проходимость по обзорному рельефу не оценивается",
        "geometry_note": (
            "Между остановками — дуги большого круга, а не путь из книги. "
            "Поездка к Pathfinder — отдельная вылазка туда и обратно от Ares 3."
        ),
        "hirise_remark": {
            "text": (
                "As you can tell, driving over this terrain will be much more difficult "
                "than it was depicted in the novel or the movie."
            ),
            "ru": "Как видно, проехать по такому рельефу гораздо труднее, чем в романе и фильме.",
            "author": "HiRISE team, The Entrance to Mawrth Vallis",
            "url": HIRISE_MAWRTH,
        },
        "stops": stops_out,
        "line": line,
        "side_trip_line": [[round(lon, 4), round(lat, 4)] for lat, lon in side_pts],
        "profile": {
            "columns": ["distance_km", "height_m"],
            "points": profile,
            "step_km": PROFILE_STEP_KM,
            "total_km": round(total_km, 1),
            "min_m": min(elevations),
            "max_m": max(elevations),
            "source": "MOLA MEGDR 8 px/deg (globe/mola_megdr_8ppd_height.png)",
            "source_url": heights.meta["source"]["url"],
            "credit": heights.meta["source"]["credit"],
        },
        "sources": [
            "https://www.uahirise.org/ESP_040776_2115",
            "https://www.uahirise.org/ESP_042014_1760",
            HIRISE_MAWRTH,
            *[PIA.format(n) for n in range(19796, 19801)],
            MARS24,
        ],
    }


# --- Мемориал ----------------------------------------------------------------------------

OPP_QUOTE_NOTE = (
    "Фраза «My battery is low and it's getting dark» — пересказ журналиста Джейкоба "
    "Марголиса последней телеметрии (низкий заряд, темнеющее небо), а не буквальное "
    "сообщение ровера."
)

MISSIONS = [
    {
        "id": "viking1",
        "name": "Viking 1",
        "agency": "NASA",
        "kind": "посадочный модуль",
        "lat": 22.27,
        "lon": 312.05,
        "place": "Chryse Planitia",
        "landed": "1976-07-20",
        "last_contact": "1982-11-11",
        "legacy": "Первая полностью успешная посадка на Марс; первые снимки с поверхности.",
        "sources": [MARS24, "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1975-075C"],
    },
    {
        "id": "viking2",
        "name": "Viking 2",
        "agency": "NASA",
        "kind": "посадочный модуль",
        "lat": 48.27,
        "lon": 134.28,
        "place": "Utopia Planitia",
        "landed": "1976-09-03",
        "last_contact": "1980-04-11",
        "legacy": "Вторая станция Viking; увидела иней на равнине Утопия.",
        "sources": [MARS24, "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1975-083C"],
    },
    {
        "id": "sojourner",
        "name": "Mars Pathfinder и Sojourner",
        "agency": "NASA",
        "kind": "посадочный модуль и первый ровер",
        "lat": 19.47,
        "lon": 326.75,
        "place": "Ares Vallis",
        "landed": "1997-07-04",
        "last_contact": "1997-10-07",
        "distance_km": 0.1,
        "legacy": "Первый колёсный ровер на Марсе; проехал около 100 м.",
        "sources": [MARS24, "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1996-068A"],
    },
    {
        "id": "spirit",
        "name": "Spirit (MER-A)",
        "agency": "NASA",
        "kind": "ровер",
        "lat": -14.57,
        "lon": 175.48,
        "place": "кратер Гусев",
        "landed": "2004-01-04",
        "last_contact": "2010-03-22",
        "distance_km": 7.7,
        "legacy": "Рассчитан на 90 солов, работал шесть лет; нашёл следы горячей воды.",
        "sources": [MARS24],
    },
    {
        "id": "opportunity",
        "name": "Opportunity (MER-B)",
        "agency": "NASA",
        "kind": "ровер",
        "lat": -1.95,
        "lon": 354.47,
        "place": "Meridiani Planum",
        "landed": "2004-01-25",
        "last_contact": "2018-06-10",
        "mission_end": "2019-02-13",
        "distance_km": 45,
        "legacy": "Рассчитан на 90 солов, работал 14 лет; доказал, что здесь была вода.",
        "quote_note": OPP_QUOTE_NOTE,
        "sources": [MARS24, "https://en.wikipedia.org/wiki/Opportunity_(rover)"],
    },
    {
        "id": "phoenix",
        "name": "Phoenix",
        "agency": "NASA",
        "kind": "посадочный модуль",
        "lat": 68.22,
        "lon": 234.25,
        "place": "Vastitas Borealis",
        "landed": "2008-05-25",
        "last_contact": "2008-11-02",
        "legacy": "Подтвердил водяной лёд под грунтом в высоких широтах.",
        "sources": [MARS24],
    },
    {
        "id": "insight",
        "name": "InSight",
        "agency": "NASA",
        "kind": "посадочный модуль",
        "lat": 4.50,
        "lon": 135.62,
        "place": "Elysium Planitia",
        "landed": "2018-11-26",
        "last_contact": "2022-12-15",
        "mission_end": "2022-12-21",
        "legacy": "Первый сейсмометр на Марсе: марсотрясения и строение недр.",
        "sources": [MARS24],
    },
    {
        "id": "zhurong",
        "name": "Zhurong (Чжужун)",
        "agency": "CNSA",
        "kind": "ровер",
        "lat": 25.07,
        "lon": 109.93,
        "place": "юг Utopia Planitia",
        "landed": "2021-05-14",
        "last_contact": "2022-05-18",
        "distance_km": 1.9,
        "legacy": "Первый китайский ровер на Марсе; ушёл в спячку и не проснулся.",
        "note": "Дата — переход в спячку; связь восстановить не удалось.",
        "sources": [MARS24],
    },
]

INGENUITY_PAGE = (
    "https://www.jpl.nasa.gov/news/after-three-years-on-mars-nasas-ingenuity-helicopter-mission-ends/"
)


def ingenuity_mission(heli: dict) -> dict:
    last = heli["flights"][-1]
    return {
        "id": "ingenuity",
        "name": "Ingenuity",
        "agency": "NASA",
        "kind": "вертолёт",
        "lat": last["lat"],
        "lon": last["lon"],
        "place": "кратер Езеро, площадка Chi",
        "landed": "2021-02-18",
        "first_flight": "2021-04-19",
        "last_contact": "2024-01-18",
        "mission_end": "2024-01-25",
        "flights": heli["flights_total"],
        "distance_km": round(heli["dist_total_m"] / 1000, 1),
        "legacy": "Первый управляемый полёт на другой планете: 72 полёта вместо пяти.",
        "note": "Координаты — место последней посадки по данным MMGIS; дата — последний полёт.",
        "sources": [INGENUITY_PAGE, URLS["heli"]],
    }


def main() -> None:
    cache = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    fetched = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    m20 = fetch_json("m20_traverse", cache)
    msl = fetch_json("msl_waypoints", cache)
    m20_cur = fetch_json("m20_current", cache)
    msl_cur = fetch_json("msl_current", cache)
    heli_raw = fetch_json("heli", cache)

    perseverance = current_entry(m20_cur, rover_id="perseverance", name="Perseverance",
                                 mission="Mars 2020", url=URLS["m20_current"])
    curiosity = current_entry(msl_cur, rover_id="curiosity", name="Curiosity",
                              mission="Mars Science Laboratory", url=URLS["msl_current"])
    heli = heli_entry(heli_raw)

    out = PUBLIC / "rovers"
    out.mkdir(parents=True, exist_ok=True)
    write(out / "m20_traverse.geojson",
          build_traverse(m20_rows(m20), name="Perseverance", source_url=URLS["m20_traverse"],
                         fetched=fetched, total_m=perseverance["dist_total_m"]))
    write(out / "msl_traverse.geojson",
          build_traverse(msl_rows(msl), name="Curiosity", source_url=URLS["msl_waypoints"],
                         fetched=fetched, total_m=curiosity["dist_total_m"]))
    write(out / "current.json", with_current_en({
        "fetched_utc": fetched,
        "credit": CREDIT_MMGIS,
        "note": "Позиции по последней локализации в MMGIS; высота над ареоидом.",
        "rovers": [perseverance, curiosity],
        "ingenuity": heli,
    }))

    route = with_route_en(build_route(fetched))
    write(PUBLIC / "martian" / "route.json", route)

    missions = [*MISSIONS, ingenuity_mission(heli)]
    missions.sort(key=lambda m: m["landed"])
    write(PUBLIC / "memorial" / "missions.json", with_missions_en({
        "fetched_utc": fetched,
        "coordinates": "planetocentric latitude, east longitude 0-360",
        "note": "Даты последней связи сверены по Mars24 (NASA GISS) и страницам миссий.",
        "missions": missions,
    }))
    print(f"Готово: маршрут {route['profile']['total_km']} км, "
          f"высоты {route['profile']['min_m']}…{route['profile']['max_m']} м")


def write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
                    encoding="utf-8")
    print(f"{path.relative_to(REPO_ROOT)}: {path.stat().st_size // 1024} КБ")


if __name__ == "__main__":
    main()
