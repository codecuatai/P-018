# Development catalog snapshots

This directory contains versioned source snapshots for the development catalog
importer. They are read-only inputs: the importer performs idempotent,
owner-local catalog upserts for Food, Restaurant, and Healthcare.

Do not put database dumps, conversation exports, account records, bookings,
appointments, payment data, application logs, or other mutable/runtime data
here. Those records are owned by their domain database and are never seeded
from this directory.

The `deploy-develop` workflow imports and verifies these catalog sources after
migrations and service startup. Therefore a deployment needs no separate manual
seed command; normal local startup remains non-mutating unless `-SeedDemo` or
`--seed-demo` is requested.
