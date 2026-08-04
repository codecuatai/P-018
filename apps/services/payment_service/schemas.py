from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PaymentIntentCreate(BaseModel):
    resource_type: str = Field(min_length=1, max_length=50)
    resource_id: str = Field(min_length=1, max_length=40)
    amount: int = Field(gt=0)
    currency: str = Field(default="VND", min_length=3, max_length=3)
    payment_method: str = "pm_success"


class CaptureRequest(BaseModel):
    amount: int | None = Field(default=None, gt=0)


class PaymentIntentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    resource_type: str
    resource_id: str
    amount: int
    captured_amount: int | None
    currency: str
    payment_method: str
    status: str
    last_error: str | None
    created_at: datetime
    updated_at: datetime


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    request_id: str
    method: str
    path: str
    status_code: int
    duration_ms: int
    idempotency_key: str | None
    request_body: str | None
    created_at: datetime
