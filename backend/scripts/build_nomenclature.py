"""Сборка каталога названий поверхности Марса (газеттир IAU/USGS) для подписей атласа."""

import json
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

SERVICE = (
    "https://services5.arcgis.com/AMh9EzyFGgthLT1q/arcgis/rest/services/"
    "MARS_nomenclature/FeatureServer/0/query"
)
OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "nomenclature"
PAGE = 1000


def fetch(offset: int) -> list[dict]:
    params = urllib.parse.urlencode(
        {
            "where": "1=1",
            "outFields": "name,diameter,center_lon,center_lat,type,approval",
            "f": "json",
            "resultOffset": offset,
            "resultRecordCount": PAGE,
        }
    )
    with urllib.request.urlopen(f"{SERVICE}?{params}", timeout=120) as response:
        return json.load(response)["features"]


def main() -> int:
    rows = []
    offset = 0
    while True:
        page = fetch(offset)
        rows.extend(page)
        if len(page) < PAGE:
            break
        offset += PAGE
    features = []
    for row in rows:
        a = row["attributes"]
        if not a.get("name") or a.get("center_lat") is None:
            continue
        lon = float(a["center_lon"]) % 360.0
        features.append(
            {
                "name": a["name"],
                "lat": round(float(a["center_lat"]), 4),
                "lon": round(lon, 4),
                "d_km": round(float(a.get("diameter") or 0.0), 1),
                "type": a.get("type") or "",
            }
        )
    features.sort(key=lambda f: -f["d_km"])
    OUT.mkdir(parents=True, exist_ok=True)
    payload = {
        "title": "Номенклатура поверхности Марса",
        "credit": "Gazetteer of Planetary Nomenclature, IAU/USGS Astrogeology",
        "source": SERVICE,
        "retrieved": datetime.now(UTC).date().isoformat(),
        "status": "официальные утверждённые IAU названия; долгота восточная [0, 360)",
        "count": len(features),
        "features": features,
    }
    (OUT / "mars.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"названий: {len(features)} -> {OUT / 'mars.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
