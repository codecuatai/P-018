# Seeds

`seed_medical.py` creates deterministic Healthcare-only departments, doctors, patients,
and future time slots after the owned migration has been applied. It does not call
`create_all()` or access another service/database.
