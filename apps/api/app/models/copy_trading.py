from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CopyWallet(Base):
    __tablename__ = "copy_wallets"
    __table_args__ = (
        CheckConstraint("mode in ('demo', 'real')", name="ck_copy_wallets_mode"),
        CheckConstraint(
            "copy_amount_mode in ('preset', 'custom')",
            name="ck_copy_wallets_copy_amount_mode",
        ),
        CheckConstraint("copy_amount_usd > 0", name="ck_copy_wallets_copy_amount_positive"),
        CheckConstraint("max_trade_usd is null or max_trade_usd > 0", name="ck_copy_wallets_max_trade_positive"),
        CheckConstraint("max_daily_usd is null or max_daily_usd > 0", name="ck_copy_wallets_max_daily_positive"),
        CheckConstraint(
            "max_slippage_bps is null or max_slippage_bps >= 0",
            name="ck_copy_wallets_max_slippage_non_negative",
        ),
        CheckConstraint(
            "max_delay_seconds is null or max_delay_seconds >= 0",
            name="ck_copy_wallets_max_delay_non_negative",
        ),
        UniqueConstraint("proxy_wallet", name="uq_copy_wallets_proxy_wallet"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    label: Mapped[str | None] = mapped_column(String(160), nullable=True)
    profile_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    proxy_wallet: Mapped[str] = mapped_column(String(42), index=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(default=True, server_default="true", nullable=False)
    mode: Mapped[str] = mapped_column(String(16), default="demo", server_default="demo", index=True, nullable=False)
    real_trading_enabled: Mapped[bool] = mapped_column(default=False, server_default="false", nullable=False)
    copy_buys: Mapped[bool] = mapped_column(default=True, server_default="true", nullable=False)
    copy_sells: Mapped[bool] = mapped_column(default=True, server_default="true", nullable=False)
    copy_amount_mode: Mapped[str] = mapped_column(
        String(16),
        default="preset",
        server_default="preset",
        nullable=False,
    )
    copy_amount_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("5"),
        server_default="5",
        nullable=False,
    )
    max_trade_usd: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2),
        default=Decimal("20"),
        server_default="20",
        nullable=True,
    )
    max_daily_usd: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2),
        default=Decimal("100"),
        server_default="100",
        nullable=True,
    )
    max_slippage_bps: Mapped[int | None] = mapped_column(
        Integer,
        default=300,
        server_default="300",
        nullable=True,
    )
    max_delay_seconds: Mapped[int | None] = mapped_column(
        Integer,
        default=10,
        server_default="10",
        nullable=True,
    )
    sports_only: Mapped[bool] = mapped_column(default=False, server_default="false", nullable=False)
    last_scan_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_trade_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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

    detected_trades = relationship(
        "CopyDetectedTrade",
        back_populates="wallet",
        cascade="all, delete-orphan",
    )
    orders = relationship("CopyOrder", back_populates="wallet", cascade="all, delete-orphan")
    demo_positions = relationship("CopyDemoPosition", back_populates="wallet", cascade="all, delete-orphan")
    events = relationship("CopyBotEvent", back_populates="wallet")


class CopyDetectedTrade(Base):
    __tablename__ = "copy_detected_trades"
    __table_args__ = (
        UniqueConstraint("wallet_id", "dedupe_key", name="uq_copy_detected_trades_wallet_dedupe"),
        Index("ix_copy_detected_trades_wallet_id", "wallet_id"),
        Index("ix_copy_detected_trades_detected_at", "detected_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    wallet_id: Mapped[str] = mapped_column(
        ForeignKey("copy_wallets.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_transaction_hash: Mapped[str | None] = mapped_column(String(160), nullable=True)
    dedupe_key: Mapped[str] = mapped_column(String(320), nullable=False)
    source_proxy_wallet: Mapped[str] = mapped_column(String(42), nullable=False)
    condition_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    asset: Mapped[str | None] = mapped_column(String(160), nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(160), nullable=True)
    market_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    market_slug: Mapped[str | None] = mapped_column(String(320), nullable=True)
    side: Mapped[str] = mapped_column(String(16), nullable=False)
    source_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    source_size: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    source_amount_usd: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    source_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    raw_payload: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)

    wallet = relationship("CopyWallet", back_populates="detected_trades")
    orders = relationship("CopyOrder", back_populates="detected_trade")


class CopyOrder(Base):
    __tablename__ = "copy_orders"
    __table_args__ = (
        CheckConstraint("mode in ('demo', 'real')", name="ck_copy_orders_mode"),
        CheckConstraint("action in ('buy', 'sell')", name="ck_copy_orders_action"),
        CheckConstraint(
            "status in ('pending', 'simulated', 'skipped', 'blocked', 'submitted', 'filled', 'partial_failed', 'failed')",
            name="ck_copy_orders_status",
        ),
        Index("ix_copy_orders_wallet_id", "wallet_id"),
        Index("ix_copy_orders_created_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    wallet_id: Mapped[str] = mapped_column(
        ForeignKey("copy_wallets.id", ondelete="CASCADE"),
        nullable=False,
    )
    detected_trade_id: Mapped[str | None] = mapped_column(
        ForeignKey("copy_detected_trades.id", ondelete="SET NULL"),
        nullable=True,
    )
    mode: Mapped[str] = mapped_column(String(16), nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(160), nullable=True)
    intended_amount_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    intended_size: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    limit_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    simulated_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    filled_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    filled_size: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    polymarket_order_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
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

    wallet = relationship("CopyWallet", back_populates="orders")
    detected_trade = relationship("CopyDetectedTrade", back_populates="orders")
    opening_positions = relationship(
        "CopyDemoPosition",
        back_populates="opening_order",
        foreign_keys="CopyDemoPosition.opening_order_id",
    )
    closing_positions = relationship(
        "CopyDemoPosition",
        back_populates="closing_order",
        foreign_keys="CopyDemoPosition.closing_order_id",
    )


class CopyDemoPosition(Base):
    __tablename__ = "copy_demo_positions"
    __table_args__ = (
        CheckConstraint("entry_action in ('buy', 'sell')", name="ck_copy_demo_positions_entry_action"),
        CheckConstraint("status in ('open', 'closed')", name="ck_copy_demo_positions_status"),
        CheckConstraint("entry_amount_usd > 0", name="ck_copy_demo_positions_entry_amount_positive"),
        CheckConstraint("entry_size > 0", name="ck_copy_demo_positions_entry_size_positive"),
        CheckConstraint("entry_price > 0", name="ck_copy_demo_positions_entry_price_positive"),
        CheckConstraint("exit_price is null or exit_price >= 0", name="ck_copy_demo_positions_exit_price_non_negative"),
        CheckConstraint(
            "exit_value_usd is null or exit_value_usd >= 0",
            name="ck_copy_demo_positions_exit_value_non_negative",
        ),
        Index("ix_copy_demo_positions_wallet_id", "wallet_id"),
        Index("ix_copy_demo_positions_status", "status"),
        Index("ix_copy_demo_positions_opened_at", "opened_at"),
        Index("ix_copy_demo_positions_closed_at", "closed_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    wallet_id: Mapped[str] = mapped_column(
        ForeignKey("copy_wallets.id", ondelete="CASCADE"),
        nullable=False,
    )
    opening_order_id: Mapped[str] = mapped_column(
        ForeignKey("copy_orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    closing_order_id: Mapped[str | None] = mapped_column(
        ForeignKey("copy_orders.id", ondelete="SET NULL"),
        nullable=True,
    )
    condition_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    asset: Mapped[str | None] = mapped_column(String(160), nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(160), nullable=True)
    market_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    market_slug: Mapped[str | None] = mapped_column(String(320), nullable=True)
    entry_action: Mapped[str] = mapped_column(String(16), nullable=False)
    entry_price: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    entry_amount_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    entry_size: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    exit_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    exit_value_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    realized_pnl_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    close_reason: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="open", server_default="open", nullable=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    wallet = relationship("CopyWallet", back_populates="demo_positions")
    opening_order = relationship(
        "CopyOrder",
        back_populates="opening_positions",
        foreign_keys=[opening_order_id],
    )
    closing_order = relationship(
        "CopyOrder",
        back_populates="closing_positions",
        foreign_keys=[closing_order_id],
    )


class CopyBotEvent(Base):
    __tablename__ = "copy_bot_events"
    __table_args__ = (
        CheckConstraint("level in ('info', 'warning', 'error')", name="ck_copy_bot_events_level"),
        Index("ix_copy_bot_events_wallet_id", "wallet_id"),
        Index("ix_copy_bot_events_created_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    wallet_id: Mapped[str | None] = mapped_column(
        ForeignKey("copy_wallets.id", ondelete="SET NULL"),
        nullable=True,
    )
    level: Mapped[str] = mapped_column(String(16), nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    event_metadata: Mapped[dict[str, object] | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    wallet = relationship("CopyWallet", back_populates="events")
