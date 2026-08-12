# Seeds

`seed_medical.py` creates deterministic Healthcare-only departments, doctors, patients,
and future time slots after the owned migration has been applied. It does not call
`create_all()` or access another service/database.

`import_healthcare_csv.py` performs an additive upsert from `import-data/` into the
Healthcare-owned facility, department, doctor, and time-slot catalog. It preserves
existing patients, appointments, holds, and audit history. Doctors whose source
record has no consultation price are stored with a null price and cannot be held
for booking until the price is supplied.
