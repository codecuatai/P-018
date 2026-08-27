# Script layout

Repository scripts are grouped by the responsibility they support:

| Folder | Purpose |
| --- | --- |
| `local/` | Local Compose and direct-process startup, health checks, acceptance, and shutdown |
| `database/` | Migrations, seeds, scoped reset, and migration parity checks |
| `data/` | Dataset pipeline, domain import wrappers, and catalog import implementation |
| `quality/` | Test runners, environment validation, performance smoke checks, and script tests |
| `setup/` | Repository bootstrap, environment setup, and AI hook installation |
| `ai-logging/` | AI usage hooks, log normalization, submission, and Python launchers |
| `admin/` | Local administrator provisioning helpers |
| `integrations/` | External QA/integration helpers such as Trello attachment and assignment tools |

Run commands from the repository root so their documented relative paths and
environment loading remain consistent. The most common entry points are:

```powershell
./scripts/local/start-all.ps1
./scripts/local/local-dev.ps1
./scripts/local/local-health.ps1
./scripts/local/local-stop.ps1
python scripts/quality/validate-env-config.py
python scripts/database/check-migration-parity.py
```
