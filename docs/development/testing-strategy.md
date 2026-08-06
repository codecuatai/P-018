# Testing Strategy

Unit tests cover application/domain code; config tests prove fail-fast process settings; API tests cover health/validation; contract tests cover versioned provider/consumer behavior; integration/E2E tests live under root `tests/`; agent evaluations cover intent/slots/tool selection. Default tests never call Gemini or a live payment/domain system.

Before a PR, run environment validation, Compose config, Python lint/pytest and package/import checks for changed services, gateway lint/test/build, and web build when affected. Add deterministic tests with every behavior, config, contract, or migration change.
