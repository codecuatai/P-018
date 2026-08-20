# Agent Service migrations

Apply `001_agent_workflow_states.sql` and then `002_agent_run_metadata.sql`
explicitly to `xone_agent` as `agent_user`. Both migrations are additive and
safe to re-run. The Agent never creates or alters schema at runtime.

The workflow-state table is retained as immutable develop-branch migration
history, but no runtime component writes its broad JSON state. The active
`agent_run_metadata` table stores allowlisted run/checkpoint diagnostics only.
It must not store
raw prompts, messages, chain-of-thought, sensitive PII, confirmation evidence,
or authoritative booking/order/payment facts.

The real adapter gate is opt-in and must use an empty disposable database:

```powershell
$env:AGENT_TEST_DATABASE_URL = '<disposable PostgreSQL URL>'
Push-Location apps/agent-service
..\..\.venv\Scripts\python.exe -m pytest tests/test_postgres_run_metadata_integration.py -q
Pop-Location
```

The test applies the owned migration, verifies concurrent exact replay,
changed-payload conflict, approved columns, and restore through a newly opened
pool. It removes only its UUID-scoped test record and never deletes a database
or volume.
