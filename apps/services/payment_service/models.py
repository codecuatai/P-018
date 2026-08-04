from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class PaymentIntent(Base):
    __tablename__ = "payment_intents"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    resource_type: Mapped[str] = mapped_column(String(50), index=True)
    resource_id: Mapped[str] = mapped_column(String(40), index=True)
    amount: Mapped[int] = mapped_column(Integer)  # authorized ceiling
    captured_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="VND")
    payment_method: Mapped[str] = mapped_column(String(60), default="pm_success")
    status: Mapped[str] = mapped_column(String(30), default="CREATED", index=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class IdempotencyRecord(Base):
    __tablename__ = "payment_idempotency_records"
    __table_args__ = (UniqueConstraint("operation", "key", name="uq_payment_idempotency"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    operation: Mapped[str] = mapped_column(String(40))
    key: Mapped[str] = mapped_column(String(255))
    payment_intent_id: Mapped[str] = mapped_column(String(40))


class ApiAuditLog(Base):
    __tablename__ = "api_audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[str] = mapped_column(String(40), index=True)
    method: Mapped[str] = mapped_column(String(10))
    path: Mapped[str] = mapped_column(String(255), index=True)
    status_code: Mapped[int] = mapped_column(Integer)
    duration_ms: Mapped[int] = mapped_column(Integer)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    request_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
