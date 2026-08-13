from datetime import UTC, datetime, timedelta

from src.repositories.restaurant_repository import RestaurantRepository


def normalized_interval(start_at: datetime, duration_minutes: int):
    if start_at.tzinfo is None or start_at.utcoffset() is None:
        raise ValueError("NAIVE_DATETIME")
    start = start_at.astimezone(UTC)
    if start <= datetime.now(UTC):
        raise ValueError("PAST_START")
    return start, start + timedelta(minutes=duration_minutes)


def normalized_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("NAIVE_DATETIME")
    return value.astimezone(UTC)


class RestaurantApplicationService:
    def __init__(self, repo: RestaurantRepository):
        self.repo = repo

    @staticmethod
    def _parse_query_with_llm(query: str, api_key: str) -> dict[str, str | None]:
        import json

        import httpx

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}
        prompt = f"""
Analyze the following restaurant search query and extract three fields in JSON format:
- "location": any city, district, or area mentioned (e.g., "Hoan Kiem", "Tay Ho", "Hanoi", "District 1"). Keep the location name. If none, return null.
- "cuisine_type": the type of food or restaurant style (e.g., "Vietnamese", "Italian", "Japanese", "French", "Korean"). Translate to English name if possible (e.g. "món Ý" -> "Italian"). If none, return null.
- "budget_range": the price tier if mentioned (e.g., "$" for cheap, "$$" for moderate, "$$$" for expensive). If none, return null.

Query: "{query}"

Respond with ONLY the JSON object, no markdown, no other text.
Example:
{{"location": "Tay Ho", "cuisine_type": "Italian", "budget_range": "$$$"}}
"""
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"}
        }
        with httpx.Client(timeout=10.0) as client:
            response = client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            res_data = response.json()
            text_response = res_data["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text_response.strip())

    def search_restaurants(self, location=None, cuisine_type=None, budget_range=None, query=None, limit=50, offset=0):
        import os
        import sys
        api_key = os.environ.get("GEMINI_API_KEY")

        parsed_location = None
        parsed_cuisine = None
        parsed_budget = None

        if query and api_key:
            try:
                parsed = self._parse_query_with_llm(query, api_key)
                parsed_location = parsed.get("location")
                parsed_cuisine = parsed.get("cuisine_type")
                parsed_budget = parsed.get("budget_range")
            except Exception as e:
                print(f"LLM parsing failed: {e}", file=sys.stderr)
                pass

        final_location = location or parsed_location
        final_cuisine = cuisine_type or parsed_cuisine
        final_budget = budget_range or parsed_budget

        return self.repo.list_restaurants(
            location=final_location,
            cuisine_type=final_cuisine,
            budget_range=final_budget,
            query=query,
            limit=limit,
            offset=offset
        )


    def get_restaurant(self, restaurant_id):
        return self.repo.get_restaurant_by_id(restaurant_id)

    def check_availability(self, restaurant_id, party_size, start_at, duration_minutes, seating_type=None):
        start, end = normalized_interval(start_at, duration_minutes)
        result = self.repo.availability(restaurant_id, party_size, start, end, seating_type)
        if result is None:
            raise ValueError("RESTAURANT_NOT_FOUND")
        return result

    def create_hold(self, actor_id, restaurant_id, party_size, start_at, duration_minutes, key):
        start, end = normalized_interval(start_at, duration_minutes)
        payload = {"restaurant_id": restaurant_id, "party_size": party_size, "start_at": start.isoformat(), "end_at": end.isoformat()}
        request_hash = self.repo.request_hash(payload)
        return self.repo.create_hold(actor_id, restaurant_id, party_size, start, end, key, request_hash,
            datetime.now(UTC) + timedelta(minutes=10))

    def create_reservation(self, actor_id, restaurant_id, party_size, start_at, duration_minutes, special_requests, key, hold_id=None):
        start, end = normalized_interval(start_at, duration_minutes)
        payload = {"restaurant_id": restaurant_id, "party_size": party_size, "start_at": start.isoformat(), "end_at": end.isoformat(), "special_requests": special_requests, "hold_id": hold_id}
        request_hash = self.repo.request_hash(payload)
        return self.repo.create_reservation(actor_id, restaurant_id, party_size, start, end, special_requests, key, request_hash, hold_id)

    def get_reservation(self, reservation_id, actor_id):
        return self.repo.get_reservation_by_id(reservation_id, actor_id)

    def update_reservation(
        self,
        actor_id,
        reservation_id,
        party_size=None,
        start_at=None,
        special_requests=None,
        key=None,
        fields_set=None,
    ):
        fields = set(fields_set or ())
        if fields_set is None:
            fields = {
                field
                for field, value in {
                    "party_size": party_size,
                    "start_at": start_at,
                    "special_requests": special_requests,
                }.items()
                if value is not None
            }

        if not fields:
            raise ValueError("NO_FIELDS_TO_UPDATE")
        if "party_size" in fields and party_size is None:
            raise ValueError("PARTY_SIZE_REQUIRED")
        if "start_at" in fields and start_at is None:
            raise ValueError("START_AT_REQUIRED")

        normalized_start = normalized_datetime(start_at) if "start_at" in fields else None
        payload = {"reservation_id": reservation_id, "fields": sorted(fields)}
        if "party_size" in fields:
            payload["party_size"] = party_size
        if "start_at" in fields:
            payload["start_at"] = normalized_start.isoformat() if normalized_start else None
        if "special_requests" in fields:
            payload["special_requests"] = special_requests

        return self.repo.update_reservation(
            actor_id,
            reservation_id,
            party_size,
            normalized_start,
            special_requests,
            fields,
            key,
            self.repo.request_hash(payload),
        )

    def cancel_reservation(self, actor_id, reservation_id, key):
        payload = {"reservation_id": reservation_id, "action": "cancel"}
        return self.repo.cancel_reservation(actor_id, reservation_id, key, self.repo.request_hash(payload))
