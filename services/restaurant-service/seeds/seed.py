import os

from src.repositories.restaurant_repository import RestaurantRepository


def main() -> None:
    repository = RestaurantRepository(os.environ["DATABASE_URL"])
    repository.seed()


if __name__ == "__main__":
    main()
