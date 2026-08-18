"""Backfill durable idempotency evidence from surviving legacy lifecycle keys.

The pre-0002 schema stored ``operation:key`` on the mutable reservation/hold
row. Only the key that is still present on a row can be reconstructed; a key
overwritten by a later lifecycle operation has no durable evidence to recover.
"""

from alembic import op

revision = "0003_restaurant_legacy_backfill"
down_revision = "0002_restaurant_idempotency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO restaurant_idempotency_records
            (actor_id, operation, idempotency_key, request_hash, response_json, created_at)
        SELECT
            r.actor_id,
            'create_reservation',
            substring(r.idempotency_key from char_length('create_reservation:') + 1),
            r.request_hash,
            json_build_object(
                'id', r.id,
                'reservation_code', r.reservation_code,
                'actor_id', r.actor_id,
                'restaurant_id', r.restaurant_id,
                'restaurant_name', restaurant.name,
                'table_code', table_row.table_code,
                'party_size', r.party_size,
                'start_at', r.start_at,
                'end_at', r.end_at,
                'status', r.status,
                'special_requests', r.special_requests,
                'created_at', r.created_at,
                'updated_at', r.updated_at,
                'resource_version', r.resource_version
            )::text,
            r.created_at
        FROM reservations r
        LEFT JOIN restaurants restaurant ON restaurant.id = r.restaurant_id
        LEFT JOIN restaurant_tables table_row ON table_row.id = r.table_id
        WHERE r.idempotency_key LIKE 'create_reservation:%'
        ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO restaurant_idempotency_records
            (actor_id, operation, idempotency_key, request_hash, response_json, created_at)
        SELECT
            h.actor_id,
            'create_hold',
            substring(h.idempotency_key from char_length('create_hold:') + 1),
            h.request_hash,
            json_build_object(
                'id', h.id,
                'hold_code', h.id,
                'actor_id', h.actor_id,
                'restaurant_id', h.restaurant_id,
                'table_id', h.table_id,
                'table_code', table_row.table_code,
                'party_size', h.party_size,
                'start_at', h.start_at,
                'end_at', h.end_at,
                'expires_at', h.expires_at,
                'status', h.status
            )::text,
            h.expires_at
        FROM reservation_holds h
        LEFT JOIN restaurant_tables table_row ON table_row.id = h.table_id
        WHERE h.idempotency_key LIKE 'create_hold:%'
        ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO restaurant_idempotency_records
            (actor_id, operation, idempotency_key, request_hash, response_json, created_at)
        SELECT
            r.actor_id,
            split_part(r.idempotency_key, ':', 1),
            substring(r.idempotency_key from char_length(split_part(r.idempotency_key, ':', 1)) + 2),
            r.request_hash,
            json_build_object(
                'id', r.id,
                'reservation_code', r.reservation_code,
                'actor_id', r.actor_id,
                'restaurant_id', r.restaurant_id,
                'restaurant_name', restaurant.name,
                'table_code', table_row.table_code,
                'party_size', r.party_size,
                'start_at', r.start_at,
                'end_at', r.end_at,
                'status', r.status,
                'special_requests', r.special_requests,
                'created_at', r.created_at,
                'updated_at', r.updated_at,
                'resource_version', r.resource_version
            )::text,
            r.updated_at
        FROM reservations r
        LEFT JOIN restaurants restaurant ON restaurant.id = r.restaurant_id
        LEFT JOIN restaurant_tables table_row ON table_row.id = r.table_id
        WHERE split_part(r.idempotency_key, ':', 1) IN ('update_reservation', 'cancel_reservation')
        ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING
        """
    )


def downgrade() -> None:
    # The backfill is additive evidence. Removing it would destroy the safety
    # guarantee of the upgrade, so a rollback must stop rather than erase it.
    raise RuntimeError("0003_restaurant_legacy_idempotency_backfill is intentionally irreversible")
