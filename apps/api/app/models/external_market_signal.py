from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, JSON, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ExternalMarketSignal(Base):
    __tablename__ = "external_market_signals"

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_market_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    source_event_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    source_ticker: Mapped[str | None] = mapped_column(String(256), nullable=True, index=True)
    polymarket_market_id: Mapped[int | None] = mapped_column(
        ForeignKey("markets.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    title: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    yes_probability: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    no_probability: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    best_yes_bid: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    best_yes_ask: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    best_no_bid: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    best_no_ask: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    mid_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    last_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    volume: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    liquidity: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    open_interest: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    spread: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    source_confidence: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    match_confidence: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    match_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    warnings: Mapped[dict[str, object] | list[object] | None] = mapped_column(
        JSON,
        nullable=True,
    )
    raw_json: Mapped[dict[str, object] | list[object] | None] = mapped_column(
        JSON,
        nullable=True,
    )
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    market = relationship("Market", back_populates="external_signals")
