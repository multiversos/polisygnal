from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ManualEvidenceItem(Base):
    __tablename__ = "manual_evidence_items"
    __table_args__ = (
        CheckConstraint(
            "stance in ('favor_yes', 'against_yes', 'neutral', 'risk')",
            name="ck_manual_evidence_items_stance",
        ),
        CheckConstraint(
            "review_status in ('pending_review', 'reviewed', 'rejected')",
            name="ck_manual_evidence_items_review_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    market_id: Mapped[int] = mapped_column(
        ForeignKey("markets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    source_name: Mapped[str] = mapped_column(String(256), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    stance: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    evidence_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    credibility_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_status: Mapped[str] = mapped_column(
        String(32),
        default="pending_review",
        server_default="pending_review",
        index=True,
        nullable=False,
    )
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

    market = relationship("Market", back_populates="manual_evidence_items")
