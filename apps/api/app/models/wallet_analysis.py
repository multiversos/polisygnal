from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class WalletProfile(Base):
    __tablename__ = "wallet_profiles"
    __table_args__ = (
        CheckConstraint(
            "status in ('candidate', 'watching', 'demo_follow', 'paused', 'rejected')",
            name="ck_wallet_profiles_status",
        ),
        CheckConstraint("confidence in ('low', 'medium', 'high')", name="ck_wallet_profiles_confidence"),
        CheckConstraint(
            "roi_30d_status in ('verified', 'estimated', 'unavailable')",
            name="ck_wallet_profiles_roi_status",
        ),
        CheckConstraint(
            "win_rate_30d_status in ('verified', 'estimated', 'unavailable')",
            name="ck_wallet_profiles_win_rate_status",
        ),
        CheckConstraint(
            "pnl_30d_status in ('verified', 'estimated', 'unavailable')",
            name="ck_wallet_profiles_pnl_status",
        ),
        CheckConstraint(
            "drawdown_30d_status in ('verified', 'estimated', 'unavailable')",
            name="ck_wallet_profiles_drawdown_status",
        ),
        Index("ix_wallet_profiles_status", "status"),
        Index("ix_wallet_profiles_score", "score"),
        Index("ix_wallet_profiles_updated_at", "updated_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    wallet_address: Mapped[str] = mapped_column(String(42), unique=True, nullable=False, index=True)
    alias: Mapped[str | None] = mapped_column(String(160), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="candidate", server_default="candidate", nullable=False)
    score: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    confidence: Mapped[str] = mapped_column(String(16), default="low", server_default="low", nullable=False)
    roi_30d_status: Mapped[str] = mapped_column(
        String(16),
        default="unavailable",
        server_default="unavailable",
        nullable=False,
    )
    roi_30d_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    win_rate_30d_status: Mapped[str] = mapped_column(
        String(16),
        default="unavailable",
        server_default="unavailable",
        nullable=False,
    )
    win_rate_30d_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    pnl_30d_status: Mapped[str] = mapped_column(
        String(16),
        default="unavailable",
        server_default="unavailable",
        nullable=False,
    )
    pnl_30d_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    trades_30d: Mapped[int | None] = mapped_column(Integer, nullable=True)
    volume_30d: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    drawdown_30d_status: Mapped[str] = mapped_column(
        String(16),
        default="unavailable",
        server_default="unavailable",
        nullable=False,
    )
    drawdown_30d_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    markets_traded_30d: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    discovered_from_market: Mapped[str | None] = mapped_column(String(320), nullable=True)
    discovered_from_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    discovered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reasons_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    risks_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class WalletAnalysisJob(Base):
    __tablename__ = "wallet_analysis_jobs"
    __table_args__ = (
        CheckConstraint(
            "status in ('pending', 'resolving_market', 'discovering_wallets', 'analyzing_wallets', 'scoring', 'completed', 'partial', 'failed', 'cancelled')",
            name="ck_wallet_analysis_jobs_status",
        ),
        Index("ix_wallet_analysis_jobs_status", "status"),
        Index("ix_wallet_analysis_jobs_created_at", "created_at"),
        Index("ix_wallet_analysis_jobs_market_slug", "market_slug"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    source_url: Mapped[str] = mapped_column(String(512), nullable=False)
    normalized_url: Mapped[str] = mapped_column(String(512), nullable=False)
    market_slug: Mapped[str | None] = mapped_column(String(256), nullable=True)
    event_slug: Mapped[str | None] = mapped_column(String(256), nullable=True)
    condition_id: Mapped[str | None] = mapped_column(String(180), nullable=True)
    market_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", server_default="pending", nullable=False)
    outcomes_json: Mapped[list[dict[str, object]] | None] = mapped_column(JSON, nullable=True)
    token_ids_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    wallets_found: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    wallets_analyzed: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    wallets_with_sufficient_history: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    yes_wallets: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    no_wallets: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    current_batch: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    result_json: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    warnings_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    candidates = relationship(
        "WalletAnalysisCandidate",
        back_populates="job",
        cascade="all, delete-orphan",
    )


class WalletAnalysisCandidate(Base):
    __tablename__ = "wallet_analysis_candidates"
    __table_args__ = (
        CheckConstraint("confidence in ('low', 'medium', 'high')", name="ck_wallet_analysis_candidates_confidence"),
        CheckConstraint(
            "roi_30d_status in ('verified', 'estimated', 'unavailable')",
            name="ck_wallet_analysis_candidates_roi_status",
        ),
        CheckConstraint(
            "win_rate_30d_status in ('verified', 'estimated', 'unavailable')",
            name="ck_wallet_analysis_candidates_win_rate_status",
        ),
        CheckConstraint(
            "pnl_30d_status in ('verified', 'estimated', 'unavailable')",
            name="ck_wallet_analysis_candidates_pnl_status",
        ),
        UniqueConstraint("job_id", "wallet_address", "token_id", name="uq_wallet_analysis_candidates_job_wallet_token"),
        Index("ix_wallet_analysis_candidates_job_id", "job_id"),
        Index("ix_wallet_analysis_candidates_wallet_address", "wallet_address"),
        Index("ix_wallet_analysis_candidates_side", "side"),
        Index("ix_wallet_analysis_candidates_outcome", "outcome"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    job_id: Mapped[str] = mapped_column(ForeignKey("wallet_analysis_jobs.id", ondelete="CASCADE"), nullable=False)
    wallet_address: Mapped[str] = mapped_column(String(42), nullable=False)
    outcome: Mapped[str | None] = mapped_column(String(160), nullable=True)
    side: Mapped[str | None] = mapped_column(String(160), nullable=True)
    token_id: Mapped[str | None] = mapped_column(String(180), nullable=True)
    observed_market_position_usd: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    score: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    confidence: Mapped[str] = mapped_column(String(16), default="low", server_default="low", nullable=False)
    roi_30d_status: Mapped[str] = mapped_column(
        String(16),
        default="unavailable",
        server_default="unavailable",
        nullable=False,
    )
    roi_30d_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    win_rate_30d_status: Mapped[str] = mapped_column(
        String(16),
        default="unavailable",
        server_default="unavailable",
        nullable=False,
    )
    win_rate_30d_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    pnl_30d_status: Mapped[str] = mapped_column(
        String(16),
        default="unavailable",
        server_default="unavailable",
        nullable=False,
    )
    pnl_30d_value: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    trades_30d: Mapped[int | None] = mapped_column(Integer, nullable=True)
    volume_30d: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    markets_traded_30d: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reasons_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    risks_json: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    raw_summary_json: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    job = relationship("WalletAnalysisJob", back_populates="candidates")
