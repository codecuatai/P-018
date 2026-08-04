from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .models import Base


class PaymentDatabase:
    def __init__(self, url: str):
        self.engine = create_async_engine(url, future=True)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False, class_=AsyncSession)

    async def create_tables(self) -> None:
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
            if self.engine.url.get_backend_name() == "sqlite":
                result = await connection.exec_driver_sql("PRAGMA table_info(payment_intents)")
                if "captured_amount" not in {row[1] for row in result.fetchall()}:
                    await connection.exec_driver_sql("ALTER TABLE payment_intents ADD COLUMN captured_amount INTEGER")

    async def dispose(self) -> None:
        await self.engine.dispose()
