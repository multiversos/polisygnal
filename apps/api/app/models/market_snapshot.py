from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MarketSnapshot(Base):
    __tablename__ = "market_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    market_id: Mapped[int] = mapped_column(
        ForeignKey("markets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )
    yes_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    no_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    midpoint: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    last_trade_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    spread: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    volume: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    liquidity: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)

    market = relationship("Market", back_populates="snapshots")

