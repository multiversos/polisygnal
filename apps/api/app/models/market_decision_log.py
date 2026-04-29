from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MarketDecisionLog(Base):
    __tablename__ = "market_decision_logs"
    __table_args__ = (
        CheckConstraint(
            "decision in ('monitor', 'investigate_more', 'ignore', 'possible_opportunity', 'dismissed', 'waiting_for_data')",
            name="ck_market_decision_logs_decision",
        ),
        CheckConstraint(
            "confidence_label is null or confidence_label in ('low', 'medium', 'high')",
            name="ck_market_decision_logs_confidence_label",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    market_id: Mapped[int] = mapped_column(
        ForeignKey("markets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    decision: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence_label: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    market = relationship("Market", back_populates="decision_logs")
