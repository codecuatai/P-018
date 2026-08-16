from seeds.seed_demo_drivers import records


def test_demo_driver_seed_has_expected_pool_and_complete_vehicle_snapshots() -> None:
    first = records()
    second = records()

    assert len(first) == 36
    assert len({row["id"] for row in first}) == 36
    assert {row["vehicle_type"] for row in first} == {"BIKE", "CAR_4", "CAR_7"}
    assert {row["vehicle_type"]: sum(item["vehicle_type"] == row["vehicle_type"] for item in first) for row in first} == {"BIKE": 16, "CAR_4": 12, "CAR_7": 8}
    for row in first:
        assert row["vehicle"]["type"] == row["vehicle_type"]
        assert row["vehicle"]["model"] == row["vehicle_model"]
        assert row["vehicle"]["license_plate"] == row["license_plate"]
        assert row["phone_masked"].startswith("*** *** ")
    assert [(row["id"], row["vehicle"], row["latitude"], row["longitude"]) for row in first] == [(row["id"], row["vehicle"], row["latitude"], row["longitude"]) for row in second]
