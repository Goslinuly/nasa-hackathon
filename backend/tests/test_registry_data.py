"""Проверки целостности файла реестра продуктов."""

import json
from pathlib import Path

DATA = json.loads(
    (Path(__file__).resolve().parents[1] / "data" / "product_registry.json").read_text(
        encoding="utf-8"
    )
)


def test_total_dtm_count_matches_meta():
    total = sum(len(region["dtms"]) for region in DATA["regions"])
    assert total == DATA["registry_meta"]["total_dtms"] == 37


def test_region_counts_match_docx():
    counts = {region["slug"]: len(region["dtms"]) for region in DATA["regions"]}
    assert counts == {
        "jezero": 12,
        "gale": 13,
        "gusev": 5,
        "meridiani": 2,
        "valles-marineris": 4,
        "olympus-mons": 1,
    }


def test_product_ids_unique():
    ids = [dtm["product_id"] for region in DATA["regions"] for dtm in region["dtms"]]
    assert len(ids) == len(set(ids))


def test_every_dtm_has_download_url():
    for region in DATA["regions"]:
        for dtm in region["dtms"]:
            assert dtm["dtm_url"].startswith("https://astrogeo-ard.s3-us-west-2.amazonaws.com/")
            assert dtm["product_id"] in dtm["dtm_url"]


def test_incomplete_products_are_not_metadata_verified():
    for region in DATA["regions"]:
        for dtm in region["dtms"]:
            if dtm["resolution_m"] is None:
                assert dtm.get("verification_status") == "candidate"
                assert dtm.get("verification_notes")


def test_nodata_default_is_float32_min():
    assert DATA["defaults"]["nodata_value"] < -3.4e38
