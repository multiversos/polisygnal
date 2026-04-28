from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MarketTag(Base):
    __tablename__ = "market_tags"
    __table_args__ = (
        CheckConstraint("tag_type in ('manual', 'system')", name="ck_market_tags_tag_type"),
        UniqueConstraint("slug", name="uq_market_tags_slug"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True, nullable=False)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tag_type: Mapped[str] = mapped_column(
        String(24),
        default="manual",
        server_default="manual",
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    links = relationship("MarketTagLink", back_populates="tag", cascade="all, delete-orphan")


class MarketTagLink(Base):
    __tablename__ = "market_tag_links"
    __table_args__ = (
        UniqueConstraint("market_id", "tag_id", name="uq_market_tag_links_market_tag"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    market_id: Mapped[int] = mapped_column(
        ForeignKey("markets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("market_tags.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    market = relationship("Market", back_populates="tag_links")
    tag = relationship("MarketTag", back_populates="links")
