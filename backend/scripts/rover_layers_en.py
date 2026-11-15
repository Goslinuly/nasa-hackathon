"""Английские подписи для слоёв build_rover_layers.py: поля *_en рядом с русскими.

Числа и координаты здесь не меняются, только видимый текст. Ключи — id записей.
"""

CURRENT_NOTE_EN = "Positions from the latest localization in MMGIS; elevation above the areoid."
TRAVERSE_NOTE_EN = "Simplified with the Douglas–Peucker algorithm; east longitude 0–360."

INGENUITY_EN = {
    "status_en": "Mission ended 25 January 2024, last flight 18 January 2024",
    "note_en": "Flight 0 is where the helicopter was dropped off by the rover (4 April 2021).",
}

ROUTE_EN = {
    "title_en": "Mark Watney's route (The Martian, Andy Weir)",
    "note_en": "The route from the novel. Trafficability over the overview terrain is not assessed",
    "geometry_note_en": (
        "Stops are joined by great-circle arcs; this is not the path from the book. "
        "The trip to Pathfinder is shown as a separate out-and-back side trip from Ares 3."
    ),
}

STOPS_EN = {
    "ares3": {
        "novel_en": "Landing site of the Ares 3 expedition; Watney is left alone in the Hab.",
        "images_en": {
            "https://www.uahirise.org/ESP_040776_2115":
                "HiRISE ESP_040776_2115: image taken at the coordinates sent by Andy Weir",
        },
    },
    "pathfinder": {"novel_en": "Watney drives out to the Pathfinder lander to restore contact with Earth."},
    "mawrth": {"novel_en": "Through Mawrth Vallis the rover climbs from Acidalia Planitia up into Arabia."},
    "meridiani": {"novel_en": "Watney skirts a dust storm and turns east towards Schiaparelli."},
    "schiaparelli-rim": {
        "name_en": "Schiaparelli rim",
        "novel_en": "Descent from the rim into the crater; the rover nearly gets stuck in soft deposits.",
    },
    "ares4": {
        "place_en": "Floor of Schiaparelli crater",
        "novel_en": "The next expedition's MAV ascent vehicle waits here; the end of the journey.",
    },
}

MISSIONS_NOTE_EN = "Last-contact dates checked against Mars24 (NASA GISS) and mission pages."

MISSIONS_EN = {
    "viking1": {
        "kind_en": "lander",
        "legacy_en": "First fully successful landing on Mars; first images from the surface.",
    },
    "viking2": {
        "kind_en": "lander",
        "legacy_en": "The second Viking lander; it saw frost on Utopia Planitia.",
    },
    "sojourner": {
        "name_en": "Mars Pathfinder and Sojourner",
        "kind_en": "lander and the first rover",
        "legacy_en": "The first wheeled rover on Mars; it drove about 100 m.",
    },
    "spirit": {
        "kind_en": "rover",
        "place_en": "Gusev crater",
        "legacy_en": "Designed for 90 sols, it worked for six years; found signs of hot water.",
    },
    "opportunity": {
        "kind_en": "rover",
        "legacy_en": "Designed for 90 sols, it worked for 14 years; proved there was water here.",
        "quote_note_en": (
            "The phrase «My battery is low and it's getting dark» is not a literal message from the rover. "
            "It is journalist Jacob Margolis's paraphrase of the last telemetry: low charge, a darkening sky."
        ),
    },
    "phoenix": {
        "kind_en": "lander",
        "legacy_en": "Confirmed water ice beneath the soil at high latitudes.",
    },
    "insight": {
        "kind_en": "lander",
        "legacy_en": "The first seismometer on Mars: marsquakes and the planet's interior.",
    },
    "ingenuity": {
        "kind_en": "helicopter",
        "place_en": "Jezero crater, Airfield Chi",
        "legacy_en": "The first powered, controlled flight on another planet: 72 flights instead of five.",
        "note_en": "Coordinates: last landing site from MMGIS data. Date: last flight.",
    },
    "zhurong": {
        "name_en": "Zhurong",
        "kind_en": "rover",
        "place_en": "southern Utopia Planitia",
        "legacy_en": "China's first rover on Mars; it went into hibernation and did not wake up.",
        "note_en": "Date it entered hibernation. Contact could not be restored.",
    },
}


def insert_after(obj: dict, key: str, en_key: str, value) -> None:
    """Вставить en_key сразу после key (порядок полей в JSON сохраняется)."""
    items = [(k, v) for k, v in obj.items() if k != en_key]
    obj.clear()
    placed = False
    for k, v in items:
        obj[k] = v
        if k == key:
            obj[en_key] = value
            placed = True
    if not placed:
        obj[en_key] = value


def apply_fields(obj: dict, fields: dict) -> None:
    for en_key, value in fields.items():
        if en_key == "images_en":
            continue
        insert_after(obj, en_key[:-3], en_key, value)


def with_route_en(route: dict) -> dict:
    apply_fields(route, ROUTE_EN)
    for stop in route.get("stops", []):
        en = STOPS_EN.get(stop["id"], {})
        apply_fields(stop, en)
        titles = en.get("images_en", {})
        for image in stop.get("images", []):
            if image["url"] in titles:
                insert_after(image, "title", "title_en", titles[image["url"]])
    return route


def with_missions_en(missions_file: dict) -> dict:
    insert_after(missions_file, "note", "note_en", MISSIONS_NOTE_EN)
    for mission in missions_file.get("missions", []):
        apply_fields(mission, MISSIONS_EN.get(mission["id"], {}))
    return missions_file


def with_current_en(current: dict) -> dict:
    insert_after(current, "note", "note_en", CURRENT_NOTE_EN)
    apply_fields(current["ingenuity"], INGENUITY_EN)
    return current
