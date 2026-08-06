import pytest
from fastapi import HTTPException
from payment_service.database import PaymentDatabase
from payment_service.repository import PaymentRepository
from payment_service.schemas import PaymentIntentCreate
from payment_service.service import PaymentService, ProviderTimeout
from ride_service.database import RideDatabase
from ride_service.payment_gateway import PaymentGatewayError
from ride_service.repository import RideRepository
from ride_service.schemas import BookingCreate, BookingOut, FinalizeFareInput, GpsPoint, LiveQuoteCreate, QuoteCreate
from ride_service.service import RideService


class InProcessPaymentGateway:
    """Test boundary: Ride never accesses the Payment database directly."""

    def __init__(self, database):
        self.database = database

    async def _call(self, method, *args):
        async with self.database.sessions() as session:
            service = PaymentService(PaymentRepository(session))
            return await getattr(service, method)(*args)

    @staticmethod
    def dump(intent):
        return {
            "id": intent.id,
            "status": intent.status,
            "last_error": intent.last_error,
            "captured_amount": intent.captured_amount,
        }

    async def create(self, payload, key):
        return self.dump(await self._call("create", PaymentIntentCreate(**payload), key))

    async def authorize(self, intent_id, key):
        return self.dump(await self._call("authorize", intent_id, key))

    async def capture(self, intent_id, key, amount=None):
        try:
            return self.dump(await self._call("capture", intent_id, key, amount))
        except ProviderTimeout as exc:
            raise PaymentGatewayError("capture timeout") from exc

    async def get(self, intent_id):
        return self.dump(await self._call("get", intent_id))

    async def cancel(self, intent_id, key):
        return self.dump(await self._call("cancel", intent_id, key))

    async def refund(self, intent_id, key):
        return self.dump(await self._call("refund", intent_id, key))


@pytest.fixture
async def ride_factory(tmp_path):
    payment_db = PaymentDatabase(f"sqlite+aiosqlite:///{(tmp_path / 'payment.db').as_posix()}")
    ride_db = RideDatabase(f"sqlite+aiosqlite:///{(tmp_path / 'ride.db').as_posix()}")
    await payment_db.create_tables()
    await ride_db.create_tables()
    gateway = InProcessPaymentGateway(payment_db)

    def factory():
        class ServiceProxy:
            def __getattr__(self, name):
                async def call(*args, **kwargs):
                    async with ride_db.sessions() as session:
                        return await getattr(RideService(RideRepository(session), gateway), name)(*args, **kwargs)

                return call

        return ServiceProxy()

    yield factory
    await ride_db.dispose()
    await payment_db.dispose()


async def make_booking(factory, scenario="HAPPY_PATH", key="booking-1"):
    quote = await factory().create_quote(
        QuoteCreate(distance_km=3, duration_minutes=10, weather="RAIN", promo_code="SAVE5000", demand_level="NORMAL")
    )
    return await factory().create_booking(BookingCreate(quote_id=quote.id, scenario=scenario), key)


@pytest.mark.asyncio
async def test_happy_path(ride_factory):
    booking = await make_booking(ride_factory)
    completed = await ride_factory().complete(booking.id, "complete-1")
    assert completed.status == "PAID"
    assert completed.amount == 41_000
    driver = BookingOut.model_validate(completed).driver
    assert driver and driver.vehicle.type == "CAR_4"
    assert driver.phone_masked == "*** *** 4821"
    assert driver.current_location is not None


@pytest.mark.asyncio
async def test_payment_declined(ride_factory):
    assert (await make_booking(ride_factory, "PAYMENT_DECLINED")).status == "PAYMENT_DECLINED"


@pytest.mark.asyncio
async def test_no_driver(ride_factory):
    assert (await make_booking(ride_factory, "NO_DRIVER")).status == "NO_DRIVER"


@pytest.mark.asyncio
async def test_driver_cancels_once_then_reassignment_succeeds(ride_factory):
    booking = await make_booking(ride_factory, "DRIVER_CANCEL_ONCE")
    assert (booking.status, booking.driver_attempts, booking.driver_status) == ("DRIVER_ASSIGNED", 2, "REASSIGNED")


@pytest.mark.asyncio
async def test_capture_timeout_reconciles_to_paid(ride_factory):
    booking = await make_booking(ride_factory, "CAPTURE_TIMEOUT_BUT_SUCCEEDED")
    assert (await ride_factory().complete(booking.id, "timeout-complete")).status == "PAID"


@pytest.mark.asyncio
async def test_duplicate_booking_idempotency_key(ride_factory):
    quote = await ride_factory().create_quote(QuoteCreate(distance_km=2, duration_minutes=5, demand_level="NORMAL"))
    first = await ride_factory().create_booking(BookingCreate(quote_id=quote.id), "same-key")
    duplicate = await ride_factory().create_booking(BookingCreate(quote_id=quote.id), "same-key")
    assert duplicate.id == first.id


class FakeLiveRouteProvider:
    async def calculate_route(self, data):
        assert data.pickup_address == "Dai hoc Thuy Loi"
        return {
            "pickup": {
                "address": "Dai hoc Thuy Loi, Ha Noi",
                "latitude": 21.007,
                "longitude": 105.825,
                "place_id": "pickup-place",
            },
            "dropoff": {
                "address": "90 Duong Lang, Ha Noi",
                "latitude": 21.020,
                "longitude": 105.810,
                "place_id": "dropoff-place",
            },
            "distance_meters": 2501,
            "duration_seconds": 601,
            "weather": "RAIN",
            "weather_source": "OPEN_METEO",
            "route_provider": "GEOAPIFY",
            "traffic_level": "FREE_FLOW_PROVIDER",
        }


@pytest.mark.asyncio
async def test_live_quote_persists_location_snapshot(tmp_path):
    database = RideDatabase(f"sqlite+aiosqlite:///{(tmp_path / 'live_ride.db').as_posix()}")
    await database.create_tables()
    try:
        async with database.sessions() as session:
            service = RideService(
                RideRepository(session), payment_gateway=None, location_provider=FakeLiveRouteProvider()
            )
            quote, route = await service.create_live_quote(
                LiveQuoteCreate(
                    pickup_address="Dai hoc Thuy Loi",
                    dropoff_address="90 Duong Lang",
                    promo_code="SAVE5000",
                    demand_level="NORMAL",
                )
            )
        assert (quote.distance_km, quote.duration_minutes, quote.amount) == (3, 11, 42_000)
        assert quote.pickup_place_id == "pickup-place"
        assert route["weather"] == "RAIN"
    finally:
        await database.dispose()


@pytest.mark.asyncio
async def test_finalize_gps_fare_then_capture_and_refund(ride_factory):
    booking = await make_booking(ride_factory, key="gps-booking")
    finalized = await ride_factory().finalize_fare(
        booking.id,
        FinalizeFareInput(
            actual_duration_seconds=360,
            gps_points=[GpsPoint(latitude=21.006, longitude=105.825), GpsPoint(latitude=21.012, longitude=105.830)],
        ),
        "gps-finalize",
    )
    assert finalized.status == "FARE_FINALIZED"
    assert finalized.final_amount is not None
    assert (await ride_factory().complete(booking.id, "gps-complete")).status == "PAID"
    assert (await ride_factory().cancel(booking.id, "gps-refund")).status == "REFUNDED"


class FakeDistantRouteProvider(FakeLiveRouteProvider):
    async def calculate_route(self, data):
        route = await super().calculate_route(data)
        return {**route, "distance_meters": 1_557_000, "duration_seconds": 65_820}


@pytest.mark.asyncio
async def test_live_quote_rejects_out_of_range_route_as_business_error(tmp_path):
    database = RideDatabase(f"sqlite+aiosqlite:///{(tmp_path / 'out_of_range.db').as_posix()}")
    await database.create_tables()
    try:
        async with database.sessions() as session:
            service = RideService(
                RideRepository(session), payment_gateway=None, location_provider=FakeDistantRouteProvider()
            )
            with pytest.raises(HTTPException) as error:
                await service.create_live_quote(
                    LiveQuoteCreate(pickup_address="Dai hoc Thuy Loi", dropoff_address="90 Duong Lang")
                )
        assert error.value.status_code == 422
        assert error.value.detail["code"] == "route_out_of_supported_range"
    finally:
        await database.dispose()
