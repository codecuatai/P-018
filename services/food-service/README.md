# Food Service

Food owns Vietnamese food catalog, restaurant-scoped carts, vouchers, delivery quotes, food orders, status events, drivers, and cancellation policy. It does not own dine-in table reservations or Gateway payment state.

Run `scripts/migrate.ps1` (or `.sh`) and then `scripts/seed.ps1` (or `.sh`) with PostgreSQL running. The seed workflow imports the configured Food catalog dataset and does not create fixed demo restaurants or menu items. Compose sets `PERSISTENCE=postgres`; unit tests may use the explicit `InMemoryFoodRepository` adapter, while `tests/test_postgres_integration.py` exercises a real disposable database when `FOOD_TEST_DATABASE_URL` is configured. Every `/api/v1` route is internal-only and requires `X-Internal-Service-Token`; user-scoped calls also require the asserted `X-Actor-Id`.

Preview calculates subtotal, voucher discount, Haversine delivery fee, ETA, total, cancellation policy, supported payment methods, cart version, and a snapshot hash. It never creates an order. The Food worker advances due states transactionally without a broker; the Gateway reconciliation worker handles rejection/cancellation refunds independently of user polling.
