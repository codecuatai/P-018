from sqlalchemy import func, select
from src.infrastructure.database import Base, OpeningHourRow, RestaurantRow, TableRow
from src.repositories.restaurant_repository import RestaurantRepository


def test_seed_adds_booking_resources_to_existing_imported_catalog() -> None:
    repository = RestaurantRepository("sqlite:///:memory:")
    engine = repository.factory.kw["bind"]
    Base.metadata.create_all(engine)

    with repository.factory() as db:
        db.add(
            RestaurantRow(
                id="imported-restaurant-1",
                name="Imported Restaurant",
                location="District 1",
                cuisine_type="Vietnamese",
                budget_range="$$",
                rating=4.5,
                timezone="Asia/Ho_Chi_Minh",
                active=True,
                source_name="local-import",
            )
        )
        db.commit()

    repository.seed()
    repository.seed()

    with repository.factory() as db:
        restaurant_count = db.scalar(select(func.count(RestaurantRow.id)))
        table_count = db.scalar(
            select(func.count(TableRow.id)).where(TableRow.restaurant_id == "imported-restaurant-1")
        )
        hour_count = db.scalar(
            select(func.count(OpeningHourRow.id)).where(
                OpeningHourRow.restaurant_id == "imported-restaurant-1"
            )
        )

    assert restaurant_count == 1
    assert table_count == 5
    assert hour_count == 7
