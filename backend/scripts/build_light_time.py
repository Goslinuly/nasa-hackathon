"""Таблица задержки связи Земля – Марс по JPL Horizons.

Наблюдатель — геоцентр Земли (500@399), цель — Марс (499), шаг сутки.
Horizons отдаёт расстояние delta (а. е.) и одностороннее время света
(величины 20 и 21). Результат — `frontend/public/data/ephemeris/earth_mars_light_time.json`.

Запуск из backend:
    python scripts/build_light_time.py
    python scripts/build_light_time.py --start 2026-01-01 --stop 2028-12-31
"""

import argparse
import csv
import io
import json
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
AU_LIGHT_S = 499.004783836  # время света на 1 а. е., с (IAU 2012)
OUT = (Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "ephemeris"
       / "earth_mars_light_time.json")
MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


def query(start: str, stop: str) -> str:
    params = {
        "format": "json",
        "COMMAND": "'499'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'500@399'",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": "'1 d'",
        "QUANTITIES": "'20,21'",
        "CSV_FORMAT": "'YES'",
        "TIME_DIGITS": "'MINUTES'",
    }
    url = API + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    request = urllib.request.Request(url, headers={"User-Agent": "martian-map-build"})
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.load(response)
    if "error" in payload:
        raise SystemExit(f"Horizons: {payload['error']}")
    return payload["result"]


def parse(result: str) -> list[dict]:
    """Строки между $$SOE и $$EOE: дата, два флага, delta, deldot, 1-way LT (мин)."""
    body = result.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    entries = []
    for row in csv.reader(io.StringIO(body.strip())):
        cells = [c.strip() for c in row]
        if not cells or not cells[0]:
            continue
        # Дата вида "2026-Nov-14 00:00".
        date, clock = cells[0].split()
        year, mon, day = date.split("-")
        hour, minute = map(int, clock.split(":"))
        utc = datetime(int(year), MONTHS[mon], int(day), hour, minute, tzinfo=UTC)
        numbers = [c for c in cells[1:] if c]
        delta_au, light_min = float(numbers[0]), float(numbers[2])
        entries.append({
            "utc": utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "distance_au": round(delta_au, 9),
            "light_time_s": round(light_min * 60.0, 3),
        })
    return entries


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--start", default="2026-01-01")
    parser.add_argument("--stop", default="2028-12-31")
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()

    entries = parse(query(args.start, args.stop))
    for e in entries:
        # Проверка: время света согласуется с delta / c и лежит в пределах 2,5–23 мин.
        assert abs(e["light_time_s"] - e["distance_au"] * AU_LIGHT_S) < 1.0, e
        assert 150 <= e["light_time_s"] <= 1400, e
    data = {
        "source": "JPL Horizons",
        "generated_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "step_hours": 24,
        "entries": entries,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    lt = [e["light_time_s"] for e in entries]
    print(f"{len(entries)} строк, {entries[0]['utc']} … {entries[-1]['utc']}, "
          f"время света {min(lt) / 60:.1f}–{max(lt) / 60:.1f} мин → {args.out}")


if __name__ == "__main__":
    main()
