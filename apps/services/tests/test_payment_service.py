import pytest
from payment_service.database import PaymentDatabase
from payment_service.repository import PaymentRepository
from payment_service.schemas import PaymentIntentCreate
from payment_service.service import PaymentService, ProviderTimeout


@pytest.fixture
async def payment_factory(tmp_path):
    database = PaymentDatabase(f"sqlite+aiosqlite:///{(tmp_path / 'payment.db').as_posix()}")
    await database.create_tables()

    def factory():
        class ServiceProxy:
            def __getattr__(self, name):
                async def call(*args, **kwargs):
                    async with database.sessions() as session:
                        service = PaymentService(PaymentRepository(session))
                        return await getattr(service, name)(*args, **kwargs)

                return call

        return ServiceProxy()

    yield factory
    await database.dispose()


@pytest.mark.asyncio
async def test_payment_create_and_capture_are_idempotent(payment_factory):
    service = payment_factory()
    payload = PaymentIntentCreate(resource_type="RIDE_BOOKING", resource_id="ride_123", amount=50_000)
    first = await service.create(payload, "payment-create-1")
    duplicate = await payment_factory().create(payload, "payment-create-1")
    assert duplicate.id == first.id

    await payment_factory().authorize(first.id, "authorize-1")
    captured = await payment_factory().capture(first.id, "capture-1")
    replay = await payment_factory().capture(first.id, "capture-1")
    assert captured.status == replay.status == "CAPTURED"


@pytest.mark.asyncio
async def test_timeout_token_persists_provider_capture(payment_factory):
    service = payment_factory()
    intent = await service.create(
        PaymentIntentCreate(
            resource_type="RIDE_BOOKING",
            resource_id="ride_timeout",
            amount=50_000,
            payment_method="pm_capture_timeout_succeeded",
        ),
        "timeout-create",
    )
    await payment_factory().authorize(intent.id, "timeout-authorize")
    with pytest.raises(ProviderTimeout):
        await payment_factory().capture(intent.id, "timeout-capture")
    assert (await payment_factory().get(intent.id)).status == "CAPTURED"
