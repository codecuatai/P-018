from __future__ import annotations

import os
import sys
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

_SERVICE_ROOT = str(Path(__file__).resolve().parents[1])
if _SERVICE_ROOT in sys.path:
    sys.path.remove(_SERVICE_ROOT)
sys.path.insert(0, _SERVICE_ROOT)
for _module_name in tuple(sys.modules):
    if _module_name == "src" or _module_name.startswith("src."):
        del sys.modules[_module_name]

os.environ.setdefault("SERVICE_PORT", "8101")
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite://")
os.environ["INTERNAL_SERVICE_TOKEN"] = "test-token"

from src.config import get_settings  # noqa: E402
from src.infrastructure.database import get_session  # noqa: E402
from src.infrastructure.models import Base, RideDriverRow, RideTariffRow  # noqa: E402
from src.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def stable_settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("SERVICE_PORT", "8101")
    monkeypatch.setenv("DATABASE_URL", "sqlite+pysqlite://")
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "test-token")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> Iterator[TestClient]:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    now = datetime.now(UTC)
    with Session(engine) as seed_session:
        seed_session.add_all(
            [
                RideTariffRow(id="tariff_test_bike_v1", vehicle_type="BIKE", version="TEST_2026_V1", base_fee=8_000, per_km=5_000, per_minute=700, active=True, created_at=now),
                RideTariffRow(id="tariff_test_car4_v1", vehicle_type="CAR_4", version="TEST_2026_V1", base_fee=10_000, per_km=7_000, per_minute=1_000, active=True, created_at=now),
                RideTariffRow(id="tariff_test_car7_v1", vehicle_type="CAR_7", version="TEST_2026_V1", base_fee=15_000, per_km=9_000, per_minute=1_300, active=True, created_at=now),
                RideDriverRow(id="driver_simulated_bike_001", display_name="Quang Huy", vehicle_type="BIKE", vehicle_model="Wave RSX", vehicle_color="Den", license_plate="29K1-390.80", phone_masked="*** *** 3908", rating=4.9, latitude=21.0285, longitude=105.8048, vehicle={"type": "BIKE", "model": "Wave RSX"}, availability_status="AVAILABLE", created_at=now, updated_at=now),
                RideDriverRow(id="driver_simulated_001", display_name="Minh Anh", vehicle_type="CAR_4", vehicle_model="Vios", vehicle_color="Trang", license_plate="30H-482.19", phone_masked="*** *** 4821", rating=4.9, latitude=21.0301, longitude=105.8122, vehicle={"type": "CAR_4", "model": "Vios"}, availability_status="AVAILABLE", created_at=now, updated_at=now),
                RideDriverRow(id="driver_simulated_car7_001", display_name="Duc Long", vehicle_type="CAR_7", vehicle_model="Xpander", vehicle_color="Bac", license_plate="30G-552.07", phone_masked="*** *** 5520", rating=4.9, latitude=21.0186, longitude=105.8230, vehicle={"type": "CAR_7", "model": "Xpander"}, availability_status="AVAILABLE", created_at=now, updated_at=now),
            ]
        )
        seed_session.commit()

    def override_session() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as test_client:
        setattr(test_client, "ride_engine", engine)
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()
