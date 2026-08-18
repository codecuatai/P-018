# Seeds

`seed_medical.py` creates deterministic Healthcare-only departments, doctors, patients,
future time slots, and the development-only `usr_demo_001` self-patient link after the
owned migration has been applied. It does not call `create_all()` or access another
service/database. Registered users must create or select their own Healthcare patient
link through the Gateway boundary.
