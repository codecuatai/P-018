"""Fixed driver fixtures used only by the local MVP."""

from copy import deepcopy

SIMULATED_DRIVERS = {
    "driver_simulated_001": {
        "id": "driver_simulated_001",
        "display_name": "Minh Anh",
        "phone_masked": "*** *** 4821",
        "rating": 4.9,
        "total_trips": 1842,
        "avatar_color": "#2563EB",
        "status": "ASSIGNED",
        "vehicle": {
            "type": "CAR_4",
            "make": "Toyota",
            "model": "Vios",
            "color": "Trắng",
            "license_plate": "30H-482.19",
        },
    },
    "driver_simulated_002": {
        "id": "driver_simulated_002",
        "display_name": "Thu Hà",
        "phone_masked": "*** *** 7634",
        "rating": 4.8,
        "total_trips": 1267,
        "avatar_color": "#7C3AED",
        "status": "ASSIGNED",
        "vehicle": {
            "type": "CAR_4",
            "make": "Hyundai",
            "model": "Accent",
            "color": "Đỏ",
            "license_plate": "29A-763.41",
        },
    },
    "driver_simulated_bike_001": {
        "id": "driver_simulated_bike_001",
        "display_name": "Quang Huy",
        "phone_masked": "*** *** 3908",
        "rating": 4.9,
        "total_trips": 2310,
        "avatar_color": "#059669",
        "status": "ASSIGNED",
        "vehicle": {
            "type": "BIKE",
            "make": "Honda",
            "model": "Wave RSX",
            "color": "Đen",
            "license_plate": "29K1-390.80",
        },
    },
    "driver_simulated_bike_002": {
        "id": "driver_simulated_bike_002",
        "display_name": "Ngọc Lan",
        "phone_masked": "*** *** 1186",
        "rating": 4.8,
        "total_trips": 975,
        "avatar_color": "#DB2777",
        "status": "ASSIGNED",
        "vehicle": {
            "type": "BIKE",
            "make": "Yamaha",
            "model": "Grande",
            "color": "Xanh",
            "license_plate": "30L5-118.60",
        },
    },
    "driver_simulated_car7_001": {
        "id": "driver_simulated_car7_001",
        "display_name": "Đức Long",
        "phone_masked": "*** *** 5520",
        "rating": 4.9,
        "total_trips": 1564,
        "avatar_color": "#EA580C",
        "status": "ASSIGNED",
        "vehicle": {
            "type": "CAR_7",
            "make": "Mitsubishi",
            "model": "Xpander",
            "color": "Bạc",
            "license_plate": "30G-552.07",
        },
    },
    "driver_simulated_car7_002": {
        "id": "driver_simulated_car7_002",
        "display_name": "Bảo Nam",
        "phone_masked": "*** *** 9032",
        "rating": 4.7,
        "total_trips": 811,
        "avatar_color": "#0891B2",
        "status": "ASSIGNED",
        "vehicle": {
            "type": "CAR_7",
            "make": "Toyota",
            "model": "Innova",
            "color": "Đen",
            "license_plate": "29B-903.28",
        },
    },
}

DRIVER_ASSIGNMENTS = {
    "BIKE": ("driver_simulated_bike_001", "driver_simulated_bike_002"),
    "CAR_4": ("driver_simulated_001", "driver_simulated_002"),
    "CAR_7": ("driver_simulated_car7_001", "driver_simulated_car7_002"),
}


def select_simulated_driver(vehicle_type: str, attempt: int) -> dict:
    driver_id = DRIVER_ASSIGNMENTS[vehicle_type][1 if attempt > 1 else 0]
    return deepcopy(SIMULATED_DRIVERS[driver_id])


def get_simulated_driver(driver_id: str | None) -> dict | None:
    driver = SIMULATED_DRIVERS.get(driver_id or "")
    return deepcopy(driver) if driver else None
