from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class WalletTradeSignalRead(BaseModel):
    wallet_address: str
    wallet_short: str
    profile_name: str | None = None
    side: str | None = None
    trade_action: str | None = None
    outcome: str | None = None
    trade_size_usd: Decimal | None = None
    price: Decimal | None = None
    token_size: Decimal | None = None
    timestamp: datetime | None = None
    signal_type: str
    signal_score: Decimal
    transaction_hash: str | None = None
    warnings: list[str] = Field(default_factory=list)


class WalletPositionSignalRead(BaseModel):
    wallet_address: str
    wallet_short: str
    profile_name: str | None = None
    side: str | None = None
    outcome: str | None = None
    position_size_usd: Decimal | None = None
    avg_price: Decimal | None = None
    current_price: Decimal | None = None
    token_size: Decimal | None = None
    realized_pnl: Decimal | None = None
    total_pnl: Decimal | None = None
    signal_type: str
    signal_score: Decimal
    warnings: list[str] = Field(default_factory=list)


class NotableWalletRead(BaseModel):
    wallet_address: str
    wallet_short: str
    profile_name: str | None = None
    trade_count: int
    max_trade_size_usd: Decimal | None = None
    position_size_usd: Decimal | None = None
    realized_pnl: Decimal | None = None
    signal_types: list[str] = Field(default_factory=list)
    signal_score: Decimal
    warnings: list[str] = Field(default_factory=list)


class WalletConcentrationSideRead(BaseModel):
    side: str
    wallet_count: int
    total_position_size_usd: Decimal
    largest_wallet_share: Decimal | None = None


class WalletConcentrationSummaryRead(BaseModel):
    total_position_size_usd: Decimal
    sides: list[WalletConcentrationSideRead] = Field(default_factory=list)
    concentrated_side: str | None = None
    warnings: list[str] = Field(default_factory=list)


class WalletIntelligenceRead(BaseModel):
    market_id: int
    condition_id: str | None = None
    threshold_usd: Decimal
    limit: int
    data_available: bool
    large_trades: list[WalletTradeSignalRead] = Field(default_factory=list)
    large_positions: list[WalletPositionSignalRead] = Field(default_factory=list)
    notable_wallets: list[NotableWalletRead] = Field(default_factory=list)
    concentration_summary: WalletConcentrationSummaryRead
    warnings: list[str] = Field(default_factory=list)
    generated_at: datetime
