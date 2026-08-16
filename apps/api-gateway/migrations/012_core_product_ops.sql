BEGIN;

-- Core owns product-operations records and references domain resources by
-- opaque identifiers only. Domain services remain authoritative for the
-- referenced order, booking, reservation, or appointment.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  event_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  status TEXT NOT NULL DEFAULT 'UNREAD' CHECK (status IN ('UNREAD', 'READ')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_actor_status_idx
  ON notifications(actor_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS user_favorites (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('food', 'restaurant', 'healthcare')),
  resource_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (actor_id, domain, resource_id)
);
CREATE INDEX IF NOT EXISTS user_favorites_actor_idx
  ON user_favorites(actor_id, domain, created_at DESC);

CREATE TABLE IF NOT EXISTS service_feedback (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('food', 'ride', 'restaurant', 'healthcare')),
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (actor_id, domain, resource_type, resource_id)
);
CREATE INDEX IF NOT EXISTS service_feedback_actor_idx
  ON service_feedback(actor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_actor_idempotency_idx
  ON support_tickets(actor_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_tickets_actor_updated_idx
  ON support_tickets(actor_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_updated_idx
  ON support_tickets(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_events (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  actor_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED', 'MESSAGE', 'STATUS_CHANGED')),
  message TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS support_ticket_events_ticket_idempotency_idx
  ON support_ticket_events(ticket_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_created_idx
  ON support_ticket_events(ticket_id, created_at ASC);

COMMIT;
