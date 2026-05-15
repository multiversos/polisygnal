from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Index, JSON, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class HighlightedWalletProfile(Base):
    __tablename__ = "highlighted_wallet_profiles"
    __table_args__ = (
        Index("ix_highlighted_wallet_profiles_qualifies", "qualifies"),
        Index("ix_highlighted_wallet_profiles_win_rate", "win_rate"),
        Index("ix_highlighted_wallet_profiles_closed_markets", "closed_markets"),
        Index("ix_highlighted_wallet_profiles_last_seen_at", "last_seen_at"),
        Index("ix_highlighted_wallet_profiles_observed_capital_usd", "observed_capital_usd"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    wallet_address: Mapped[str] = mapped_column(String(42), unique=True, nullable=False, index=True)
    short_address: Mapped[str | None] = mapped_column(String(32), nullable=True)
    profile_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    pseudonym: Mapped[str | None] = mapped_column(String(120), nullable=True)
    public_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    profile_image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    x_username: Mapped[str | None] = mapped_column(String(120), nullable=True)
    verified_badge: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    win_rate: Mapped[Decimal | None] = mapped_column(Numeric(8, 6), nullable=True)
    closed_markets: Mapped[int | None] = mapped_column(nullable=True)
    wins: Mapped[int | None] = mapped_column(nullable=True)
    losses: Mapped[int | None] = mapped_column(nullable=True)
    realized_pnl: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    unrealized_pnl: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    observed_capital_usd: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)

    qualifies: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    qualification_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    no_longer_qualifies: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        nullable=False,
    )

    source: Mapped[str] = mapped_column(
        String(120),
        default="wallet_intelligence",
        server_default="wallet_intelligence",
        nullable=False,
    )
    source_market_title: Mapped[str | None] = mapped_column(String(256), nullable=True)
    source_market_slug: Mapped[str | None] = mapped_column(String(256), nullable=True)
    source_market_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source_sport: Mapped[str | None] = mapped_column(String(64), nullable=True)

    market_history: Mapped[list[dict[str, object]] | None] = mapped_column(JSON, nullable=True)
    warnings: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    limitations: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    first_detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    last_refreshed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
