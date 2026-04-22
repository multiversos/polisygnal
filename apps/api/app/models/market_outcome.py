from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MarketOutcome(Base):
    __tablename__ = "market_outcomes"
    __table_args__ = (
        CheckConstraint(
            "resolved_outcome IN ('yes', 'no', 'cancelled')",
            name="ck_market_outcomes_resolved_outcome",
        ),
    )

    market_id: Mapped[int] = mapped_column(
        ForeignKey("markets.id", ondelete="CASCADE"),
        primary_key=True,
    )
    resolved_outcome: Mapped[str] = mapped_column(String(16), nullable=False)
    resolution_source: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="manual",
        server_default=text("'manual'"),
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    market = relationship("Market", back_populates="outcome")
