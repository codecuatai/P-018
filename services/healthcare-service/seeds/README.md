# Seeds

The shared development command uses the Compose `catalog-importer` job to
import the Healthcare catalog, creates future slots only for imported priced
doctors, and then runs `seed_demo_patient.py`.
The latter additively creates the configured development demo user's patient
record and self-link; it never runs when demo authentication is disabled.

```sh
sh scripts/database/seed.sh .env
```

`seed_medical.py` is a legacy destructive fixture and is not part of the
development or deployment workflow. Registered users create and select their
own Healthcare patient links through the Gateway boundary.
