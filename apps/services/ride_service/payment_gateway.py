import httpx


class PaymentGatewayError(Exception):
    pass


class PaymentGateway:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    async def _request(self, method: str, path: str, *, payload: dict | None = None, key: str | None = None) -> dict:
        headers = {"Idempotency-Key": key} if key else {}
        async with httpx.AsyncClient(base_url=self.base_url, timeout=5.0) as client:
            response = await client.request(method, path, json=payload, headers=headers)
        if response.status_code == 504:
            raise PaymentGatewayError("capture timeout")
        response.raise_for_status()
        return response.json()

    async def create(self, payload: dict, key: str | None) -> dict:
        return await self._request("POST", "/v1/payment-intents", payload=payload, key=key)

    async def authorize(self, intent_id: str, key: str | None) -> dict:
        return await self._request("POST", f"/v1/payment-intents/{intent_id}/authorize", key=key)

    async def capture(self, intent_id: str, key: str | None, amount: int | None = None) -> dict:
        payload = {"amount": amount} if amount is not None else None
        return await self._request("POST", f"/v1/payment-intents/{intent_id}/capture", payload=payload, key=key)

    async def get(self, intent_id: str) -> dict:
        return await self._request("GET", f"/v1/payment-intents/{intent_id}")

    async def cancel(self, intent_id: str, key: str | None) -> dict:
        return await self._request("POST", f"/v1/payment-intents/{intent_id}/cancel", key=key)

    async def refund(self, intent_id: str, key: str | None) -> dict:
        return await self._request("POST", f"/v1/payment-intents/{intent_id}/refund", key=key)
