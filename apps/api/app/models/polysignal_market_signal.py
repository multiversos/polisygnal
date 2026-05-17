from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, JSON, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PolySignalMarketSignal(Base):
    __tablename__ = "polysignal_market_signals"
    __table_args__ = (
        CheckConstraint("confidence in ('low', 'medium', 'high')", name="ck_polysignal_market_signals_confidence"),
        CheckConstraint(
            "signal_status in ('pending_resolution', 'resolved_hit', 'resolved_miss', 'cancelled', 'unknown', 'no_clear_signal')",
            name="ck_polysignal_market_signals_status",
        ),
        Index("ix_polysignal_market_signals_job_id", "job_id"),
        Index("ix_polysignal_market_signals_condition_id", "condition_id"),
        Index("ix_polysignal_market_signals_market_slug", "market_slug"),
        Index("ix_polysignal_market_signals_signal_status", "signal_status"),
        Index("ix_polysignal_market_signals_created_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    job_id: Mapped[str | None] = mapped_column(
        ForeignKey("wallet_analysis_jobs.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    market_slug: Mapped[str | None] = mapped_column(String(256), nullable=True)
    event_slug: Mapped[str | None] = mapped_column(String(256), nullable=True)
    condition_id: Mapped[str | None] = mapped_column(String(180), nullable=True)
    market_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcomes_json: Mapped[list[dict[str, object]] | None] = mapped_column(JSON, nullable=True)
    token_ids_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    predicted_side: Mapped[str | None] = mapped_column(String(160), nullable=True)
    predicted_outcome: Mapped[str | None] = mapped_column(String(160), nullable=True)
    polysignal_score: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    confidence: Mapped[str] = mapped_column(String(16), default="low", server_default="low", nullable=False)
    yes_score: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    no_score: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    outcome_scores_json: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    wallets_analyzed: Mapped[int | None] = mapped_column(nullable=True)
    wallets_with_sufficient_history: Mapped[int | None] = mapped_column(nullable=True)
    top_wallets_json: Mapped[list[dict[str, object]] | None] = mapped_column(JSON, nullable=True)
    warnings_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    signal_status: Mapped[str] = mapped_column(
        String(32),
        default="pending_resolution",
        server_default="pending_resolution",
        nullable=False,
    )
    final_outcome: Mapped[str | None] = mapped_column(String(160), nullable=True)
    final_resolution_source: Mapped[str | None] = mapped_column(String(160), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
