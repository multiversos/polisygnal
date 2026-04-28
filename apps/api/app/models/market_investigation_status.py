from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MarketInvestigationStatus(Base):
    __tablename__ = "market_investigation_statuses"
    __table_args__ = (
        CheckConstraint(
            "status in ('pending_review', 'investigating', 'has_evidence', 'review_required', 'dismissed', 'paused')",
            name="ck_market_investigation_statuses_status",
        ),
        UniqueConstraint("market_id", name="uq_market_investigation_statuses_market_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    market_id: Mapped[int] = mapped_column(
        ForeignKey("markets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        default="pending_review",
        server_default="pending_review",
        index=True,
        nullable=False,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        index=True,
        nullable=False,
    )

    market = relationship("Market", back_populates="investigation_status")
