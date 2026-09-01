# Seeds

`seed_demo_drivers.py` additively maintains 36 deterministic synthetic Hanoi
drivers (Bike, Car 4 and Car 7). It preserves an in-progress assignment and
never deletes Ride rows. The shared development command runs it after Ride's
owned migrations:

```sh
sh scripts/database/seed.sh .env
```
