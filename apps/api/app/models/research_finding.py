from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ResearchFinding(Base):
    __tablename__ = "research_findings"

    id: Mapped[int] = mapped_column(primary_key=True)
    research_run_id: Mapped[int] = mapped_column(
        ForeignKey("research_runs.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    market_id: Mapped[int] = mapped_column(
        ForeignKey("markets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("sources.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    factor_type: Mapped[str] = mapped_column(String(64), nullable=False)
    stance: Mapped[str] = mapped_column(String(32), nullable=False)
    impact_score: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    freshness_score: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    credibility_score: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_summary: Mapped[str] = mapped_column(Text, nullable=False)
    citation_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    source_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[dict[str, object] | list[object] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    research_run = relationship("ResearchRun", back_populates="findings")
    market = relationship("Market", back_populates="research_findings")
    source = relationship("Source", back_populates="research_findings")
