from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SearchQuery(BaseModel):
    keyword: str = ""
    district: str | None = None
    category: str | None = None
    min_price: int | None = Field(default=None, ge=0)
    max_price: int | None = Field(default=None, ge=0)
    open_only: bool = True
    limit: int = Field(default=12, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class CreateCartRequest(BaseModel):
    user_id: str = Field(min_length=1)
    restaurant_id: str = Field(min_length=1)


class SelectedOption(BaseModel):
    group_id: str = Field(min_length=1)
    option_id: str = Field(min_length=1)


class AddCartItemRequest(BaseModel):
    menu_item_id: str = Field(min_length=1)
    quantity: int = Field(ge=1, le=50)
    selected_options: list[SelectedOption] = Field(default_factory=list)
    note: str | None = Field(default=None, max_length=500)


class UpdateCartItemRequest(BaseModel):
    quantity: int = Field(ge=1, le=50)
    selected_options: list[SelectedOption] | None = None
    note: str | None = Field(default=None, max_length=500)


class VoucherRequest(BaseModel):
    code: str = Field(min_length=1, max_length=40)


class DeliveryAddressSnapshot(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    address_text: str = Field(min_length=1, max_length=500)
    label: str | None = Field(default=None, max_length=80)
    city: str | None = Field(default=None, max_length=120)
    district: str | None = Field(default=None, max_length=120)
    ward: str | None = Field(default=None, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    provider: str | None = Field(default=None, max_length=120)
    source: str | None = Field(default=None, max_length=32)


class DeliveryQuoteRequest(BaseModel):
    restaurant_id: str
    address_id: str
    address_snapshot: DeliveryAddressSnapshot | None = None


class PreviewOrderRequest(BaseModel):
    cart_id: str
    address_id: str
    user_id: str
    address_snapshot: DeliveryAddressSnapshot | None = None


class CreateOrderRequest(PreviewOrderRequest):
    idempotency_key: str = Field(min_length=8, max_length=128)
    payment_method: str = Field(pattern="^(bank_transfer|card|e_wallet)$")
    expected_snapshot_hash: str = Field(min_length=1)
    expected_cart_version: int = Field(ge=0)
    expected_amount: int = Field(ge=0)
    expected_currency: str = Field(min_length=3, max_length=3)
    expected_quote_version: str = Field(min_length=1)


class TransitionOrderRequest(BaseModel):
    target_status: str
    reason: str = Field(min_length=1, max_length=200)
    operation_key: str | None = Field(default=None, min_length=8, max_length=200)


class CancelOrderRequest(BaseModel):
    user_id: str
    idempotency_key: str = Field(min_length=8, max_length=128)


class HealthStatus(BaseModel):
    status: str


class ApiResponse(BaseModel):
    data: Any
