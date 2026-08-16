from pathlib import Path

import yaml


def test_shared_address_requires_geographic_coordinates() -> None:
    spec_path = Path(__file__).parents[2] / "packages" / "contracts" / "openapi" / "shared-primitives.v1.yaml"
    spec = yaml.safe_load(spec_path.read_text(encoding="utf-8"))

    address = spec["components"]["schemas"]["Address"]

    assert set(address["required"]) == {"id", "label", "address_text", "latitude", "longitude", "city"}
    assert address["properties"]["latitude"]["minimum"] == -90
    assert address["properties"]["longitude"]["maximum"] == 180


def test_food_legacy_address_is_explicitly_domain_specific() -> None:
    spec_path = Path(__file__).parents[2] / "packages" / "contracts" / "openapi" / "food-vertical-slice.yaml"
    spec = yaml.safe_load(spec_path.read_text(encoding="utf-8"))

    legacy = spec["components"]["schemas"]["FoodLegacyAddress"]

    assert "address" in legacy["properties"]
    assert "address_text" not in legacy["properties"]
    assert "address_text" not in legacy["required"]
    assert "latitude" in legacy["required"]
    assert "longitude" in legacy["required"]
