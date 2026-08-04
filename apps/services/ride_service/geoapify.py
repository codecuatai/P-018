import httpx


class LocationProviderError(Exception):
    pass


class GeoapifyRouteProvider:
    """Address geocoding and road routing; API key stays server-side."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def _get_json(self, url: str, params: dict) -> dict:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise LocationProviderError("Location provider is unavailable") from exc

    async def _resolve(self, side: str, data) -> dict:
        latitude = getattr(data, f"{side}_latitude")
        longitude = getattr(data, f"{side}_longitude")
        address = getattr(data, f"{side}_address")
        place_id = getattr(data, f"{side}_place_id")
        if latitude is not None and longitude is not None:
            return {
                "address": address or "Pinned map location",
                "latitude": latitude,
                "longitude": longitude,
                "place_id": place_id,
            }
        result = await self._get_json(
            "https://api.geoapify.com/v1/geocode/search",
            {
                "text": address,
                "filter": "countrycode:vn",
                "lang": "vi",
                "limit": 1,
                "format": "json",
                "apiKey": self.api_key,
            },
        )
        matches = result.get("results", [])
        if not matches:
            raise LocationProviderError(f"Address could not be resolved: {address}")
        match = matches[0]
        return {
            "address": match.get("formatted", address),
            "latitude": match["lat"],
            "longitude": match["lon"],
            "place_id": match.get("place_id"),
        }

    async def _weather(self, latitude: float, longitude: float) -> tuple[str, str]:
        try:
            data = await self._get_json(
                "https://api.open-meteo.com/v1/forecast",
                {
                    "latitude": latitude,
                    "longitude": longitude,
                    "current": "weather_code",
                    "timezone": "Asia/Ho_Chi_Minh",
                },
            )
            code = data.get("current", {}).get("weather_code")
            rain_codes = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99}
            return ("RAIN" if code in rain_codes else "CLEAR", "OPEN_METEO")
        except LocationProviderError:
            return "CLEAR", "UNAVAILABLE"

    async def calculate_route(self, data) -> dict:
        pickup = await self._resolve("pickup", data)
        dropoff = await self._resolve("dropoff", data)
        route_data = await self._get_json(
            "https://api.geoapify.com/v1/routing",
            {
                "waypoints": f"{pickup['latitude']},{pickup['longitude']}|{dropoff['latitude']},{dropoff['longitude']}",
                "mode": "drive",
                "format": "json",
                "apiKey": self.api_key,
            },
        )
        routes = route_data.get("results", [])
        if not routes or not routes[0].get("distance") or not routes[0].get("time"):
            raise LocationProviderError("No drivable route was found")
        weather, weather_source = await self._weather(pickup["latitude"], pickup["longitude"])
        return {
            "pickup": pickup,
            "dropoff": dropoff,
            "distance_meters": int(routes[0]["distance"]),
            "duration_seconds": int(routes[0]["time"]),
            "weather": weather,
            "weather_source": weather_source,
            "route_provider": "GEOAPIFY",
            "traffic_level": "FREE_FLOW_PROVIDER",
        }
