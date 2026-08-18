# Catalog DataOps

The three domain-owned wrappers validate the committed Hanoi source files and
write a versioned import plan without touching raw CSV files:

```powershell
python scripts/import_food_dataset.py --dataset-version hanoi_food_2026_08_v1
python scripts/import_restaurant_dataset.py --dataset-version hanoi_restaurant_2026_08_v1
python scripts/import_healthcare_dataset.py --dataset-version hanoi_healthcare_2026_08_v1
```

Each plan contains `manifest.json`, `normalized.jsonl`, and
`rejected.jsonl` under `artifacts/dataops/`. Apply is an explicit operator
action after the owned migration is current:

```powershell
python scripts/import_food_dataset.py --dataset-version hanoi_food_2026_08_v1 --apply
```

The command uses the domain-specific `*_DATABASE_URL` process environment
variable only when `--apply` is supplied. Re-running the same version is an
upsert keyed by the stable source record ID/content hash. Activating a new
version marks older domain catalog records inactive; `--deactivate-version`
deactivates a known bad release. The specialty CSV is repaired only in the
staging projection: the raw file remains unchanged and rows without a source
URL stay importable with an explicit quality flag.
