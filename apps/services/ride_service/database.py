from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .models import Base


class RideDatabase:
    def __init__(self, url: str):
        self.engine = create_async_engine(url, future=True)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False, class_=AsyncSession)

    async def create_tables(self) -> None:
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
            if self.engine.url.get_backend_name() == "sqlite":
                await self._migrate_sqlite(connection)

    async def _migrate_sqlite(self, connection) -> None:
        migrations = {
            "quotes": {
                "vehicle_type": "TEXT DEFAULT 'CAR_4'",
                "tariff_version": "TEXT DEFAULT 'MVP_V2'",
                "quote_source": "TEXT DEFAULT 'MANUAL'",
                "distance_meters": "INTEGER",
                "duration_seconds": "INTEGER",
                "pickup_address": "TEXT",
                "pickup_latitude": "FLOAT",
                "pickup_longitude": "FLOAT",
                "pickup_place_id": "TEXT",
                "dropoff_address": "TEXT",
                "dropoff_latitude": "FLOAT",
                "dropoff_longitude": "FLOAT",
                "dropoff_place_id": "TEXT",
                "weather": "TEXT DEFAULT 'CLEAR'",
                "weather_source": "TEXT DEFAULT 'MANUAL'",
                "traffic_level": "TEXT DEFAULT 'FREE_FLOW'",
                "demand_level": "TEXT DEFAULT 'NORMAL'",
                "demand_multiplier_bps": "INTEGER DEFAULT 10000",
                "base_fee": "INTEGER DEFAULT 0",
                "distance_fee": "INTEGER DEFAULT 0",
                "time_fee": "INTEGER DEFAULT 0",
                "peak_surcharge": "INTEGER DEFAULT 0",
                "demand_surcharge": "INTEGER DEFAULT 0",
            },
            "bookings": {
                "authorized_amount": "INTEGER DEFAULT 0",
                "final_amount": "INTEGER",
                "driver_status": "TEXT",
                "driver_eta_seconds": "INTEGER",
                "driver_latitude": "FLOAT",
                "driver_longitude": "FLOAT",
            },
        }
        for table, columns in migrations.items():
            result = await connection.exec_driver_sql(f"PRAGMA table_info({table})")
            existing = {row[1] for row in result.fetchall()}
            for column, definition in columns.items():
                if column not in existing:
                    await connection.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    async def dispose(self) -> None:
        await self.engine.dispose()
