from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from src.config import get_settings

settings = get_settings()

SQLALCHEMY_DATABASE_URL = settings.database_url


def sqlalchemy_database_url(value: str) -> str:
    """Use the psycopg v3 driver supplied by the service image."""
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+psycopg://", 1)
    if value.startswith("postgresql+psycopg2://"):
        return value.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
    return value


engine = create_engine(
    sqlalchemy_database_url(SQLALCHEMY_DATABASE_URL),
    connect_args={"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
