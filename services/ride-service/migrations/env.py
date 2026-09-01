from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, inspect, pool, text
from sqlalchemy.engine import Connection
from src.config import get_settings
from src.infrastructure.database import sqlalchemy_database_url
from src.infrastructure.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option(
    "sqlalchemy.url",
    sqlalchemy_database_url(get_settings().database_url).replace("%", "%%"),
)
target_metadata = Base.metadata

_LEGACY_QUOTE_SNAPSHOT_REVISION = "0007"
_QUOTE_SNAPSHOT_REVISION = "20260827_0007"
_QUOTE_SNAPSHOT_PREVIOUS_REVISION = "20260816_0006"
_QUOTE_STOPOVERS_REVISION = "20260828_0008"


def _normalize_legacy_quote_snapshot_revision(connection: Connection) -> None:
    """Reconcile the short-lived legacy 0007 revision safely.

    An earlier image applied the quote snapshot migration with revision
    ``0007``. The immutable replacement uses the repository's full revision
    IDs, so an existing database can otherwise fail before Alembic reaches the
    migration graph. Only rewrite the version marker after checking the
    schema; if the column is absent, point Alembic at the known predecessor so
    the canonical migration can apply it.
    """

    inspector = inspect(connection)
    if not inspector.has_table("alembic_version"):
        return

    legacy_revision_exists = connection.execute(
        text(
            "SELECT 1 FROM alembic_version "
            "WHERE version_num = :legacy_revision LIMIT 1"
        ),
        {"legacy_revision": _LEGACY_QUOTE_SNAPSHOT_REVISION},
    ).scalar_one_or_none()
    if legacy_revision_exists is None:
        connection.commit()
        return

    if not inspector.has_table("ride_bookings"):
        raise RuntimeError(
            "Legacy Ride revision 0007 is recorded, but ride_bookings is "
            "missing; refusing to rewrite migration state."
        )

    booking_columns = {
        column["name"] for column in inspector.get_columns("ride_bookings")
    }
    replacement_revision = (
        _QUOTE_SNAPSHOT_REVISION
        if "quote_snapshot" in booking_columns
        else _QUOTE_SNAPSHOT_PREVIOUS_REVISION
    )
    connection.execute(
        text(
            "UPDATE alembic_version SET version_num = :replacement_revision "
            "WHERE version_num = :legacy_revision"
        ),
        {
            "legacy_revision": _LEGACY_QUOTE_SNAPSHOT_REVISION,
            "replacement_revision": replacement_revision,
        },
    )
    connection.commit()


_PHANTOM_0008_REVISION = _QUOTE_STOPOVERS_REVISION


def _normalize_phantom_0008_revision(connection: Connection) -> None:
    """Reconcile an old phantom stamp without replaying the canonical migration."""

    inspector = inspect(connection)
    if not inspector.has_table("alembic_version"):
        return

    phantom_exists = connection.execute(
        text(
            "SELECT 1 FROM alembic_version "
            "WHERE version_num = :phantom LIMIT 1"
        ),
        {"phantom": _PHANTOM_0008_REVISION},
    ).scalar_one_or_none()
    if phantom_exists is None:
        connection.commit()
        return

    if not inspector.has_table("ride_quotes"):
        raise RuntimeError(
            "Ride revision 20260828_0008 is recorded, but ride_quotes is "
            "missing; refusing to rewrite migration state."
        )

    quote_columns = {
        column["name"] for column in inspector.get_columns("ride_quotes")
    }
    if "stopovers" in quote_columns:
        # The canonical 0008 migration has already applied.  It used to be
        # treated as a phantom while this migration file was unavailable;
        # resetting its marker now would replay ADD COLUMN and fail.
        connection.commit()
        return

    connection.execute(
        text(
            "UPDATE alembic_version SET version_num = :target "
            "WHERE version_num = :phantom"
        ),
        {
            "phantom": _PHANTOM_0008_REVISION,
            "target": _QUOTE_SNAPSHOT_REVISION,
        },
    )
    connection.commit()


def _normalize_preapplied_stopovers_revision(connection: Connection) -> None:
    """Advance only an intact schema left at the predecessor revision marker."""

    inspector = inspect(connection)
    if not inspector.has_table("alembic_version") or not inspector.has_table("ride_quotes"):
        return

    predecessor_exists = connection.execute(
        text(
            "SELECT 1 FROM alembic_version "
            "WHERE version_num = :predecessor LIMIT 1"
        ),
        {"predecessor": _QUOTE_SNAPSHOT_REVISION},
    ).scalar_one_or_none()
    if predecessor_exists is None:
        connection.commit()
        return

    quote_columns = {
        column["name"] for column in inspector.get_columns("ride_quotes")
    }
    if "stopovers" not in quote_columns:
        connection.commit()
        return

    connection.execute(
        text(
            "UPDATE alembic_version SET version_num = :target "
            "WHERE version_num = :predecessor"
        ),
        {
            "predecessor": _QUOTE_SNAPSHOT_REVISION,
            "target": _QUOTE_STOPOVERS_REVISION,
        },
    )
    connection.commit()


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        _normalize_legacy_quote_snapshot_revision(connection)
        _normalize_phantom_0008_revision(connection)
        _normalize_preapplied_stopovers_revision(connection)
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
