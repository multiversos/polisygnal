from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"
    __table_args__ = (
        CheckConstraint(
            "status in ('watching', 'investigating', 'reviewed', 'dismissed')",
            name="ck_watchlist_items_status",
        ),
        UniqueConstraint("market_id", name="uq_watchlist_items_market_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    market_id: Mapped[int] = mapped_column(
        ForeignKey("markets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        default="watching",
        server_default="watching",
        index=True,
        nullable=False,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    market = relationship("Market", back_populates="watchlist_item")
