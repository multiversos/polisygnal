from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.services.nba_team_matching import assess_market_for_evidence


class Market(Base):
    __tablename__ = "markets"

    id: Mapped[int] = mapped_column(primary_key=True)
    polymarket_market_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    question: Mapped[str] = mapped_column(String(512), nullable=False)
    slug: Mapped[str] = mapped_column(String(256), unique=True, nullable=False)
    condition_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    question_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    clob_token_ids: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    outcome_tokens: Mapped[list[dict[str, object]] | None] = mapped_column(JSON, nullable=True)
    polymarket_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    yes_token_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    no_token_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sport_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    market_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    icon_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rules_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    event = relationship("Event", back_populates="markets")
    snapshots = relationship(
        "MarketSnapshot",
        back_populates="market",
        cascade="all, delete-orphan",
        order_by="MarketSnapshot.captured_at.desc()",
    )
    sources = relationship(
        "Source",
        back_populates="market",
        cascade="all, delete-orphan",
    )
    evidence_items = relationship(
        "EvidenceItem",
        back_populates="market",
        cascade="all, delete-orphan",
    )
    manual_evidence_items = relationship(
        "ManualEvidenceItem",
        back_populates="market",
        cascade="all, delete-orphan",
        order_by="ManualEvidenceItem.created_at.desc()",
    )
    predictions = relationship(
        "Prediction",
        back_populates="market",
        cascade="all, delete-orphan",
        order_by="Prediction.run_at.desc()",
    )
    research_runs = relationship(
        "ResearchRun",
        back_populates="market",
        cascade="all, delete-orphan",
        order_by="ResearchRun.started_at.desc()",
    )
    research_findings = relationship(
        "ResearchFinding",
        back_populates="market",
        cascade="all, delete-orphan",
        order_by="ResearchFinding.id.asc()",
    )
    prediction_reports = relationship(
        "PredictionReport",
        back_populates="market",
        cascade="all, delete-orphan",
        order_by="PredictionReport.created_at.desc()",
    )
    external_signals = relationship(
        "ExternalMarketSignal",
        back_populates="market",
        passive_deletes=True,
        order_by="ExternalMarketSignal.fetched_at.desc()",
    )
    outcome = relationship(
        "MarketOutcome",
        back_populates="market",
        cascade="all, delete-orphan",
        uselist=False,
    )
    watchlist_item = relationship(
        "WatchlistItem",
        back_populates="market",
        cascade="all, delete-orphan",
        uselist=False,
    )
    investigation_status = relationship(
        "MarketInvestigationStatus",
        back_populates="market",
        cascade="all, delete-orphan",
        uselist=False,
    )
    decision_logs = relationship(
        "MarketDecisionLog",
        back_populates="market",
        cascade="all, delete-orphan",
        order_by="MarketDecisionLog.created_at.desc()",
    )
    tag_links = relationship(
        "MarketTagLink",
        back_populates="market",
        cascade="all, delete-orphan",
    )

    @property
    def latest_yes_price(self) -> Decimal | None:
        if not self.snapshots:
            return None
        return self.snapshots[0].yes_price

    @property
    def evidence_eligible(self) -> bool:
        return assess_market_for_evidence(self.question).eligible

    @property
    def evidence_shape(self) -> str:
        return assess_market_for_evidence(self.question).shape

    @property
    def evidence_skip_reason(self) -> str | None:
        return assess_market_for_evidence(self.question).skip_reason
