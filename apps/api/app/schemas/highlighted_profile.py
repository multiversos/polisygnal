from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

WalletHistoryResult = Literal["lost", "pending", "unknown", "won"]


class HighlightedProfileMarketHistoryItem(BaseModel):
    amount_usd: float | None = Field(
        default=None,
        validation_alias=AliasChoices("amountUsd", "amount_usd"),
        serialization_alias="amountUsd",
    )
    average_price: float | None = Field(
        default=None,
        validation_alias=AliasChoices("averagePrice", "average_price"),
        serialization_alias="averagePrice",
    )
    condition_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("conditionId", "condition_id"),
        serialization_alias="conditionId",
        max_length=180,
    )
    market_slug: str | None = Field(
        default=None,
        validation_alias=AliasChoices("marketSlug", "market_slug"),
        serialization_alias="marketSlug",
        max_length=180,
    )
    market_title: str | None = Field(
        default=None,
        validation_alias=AliasChoices("marketTitle", "market_title"),
        serialization_alias="marketTitle",
        max_length=220,
    )
    market_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("marketUrl", "market_url"),
        serialization_alias="marketUrl",
        max_length=512,
    )
    outcome: str | None = Field(default=None, max_length=120)
    realized_pnl: float | None = Field(
        default=None,
        validation_alias=AliasChoices("realizedPnl", "realized_pnl"),
        serialization_alias="realizedPnl",
    )
    result: WalletHistoryResult = "unknown"
    source: str = Field(default="polymarket_data_api", max_length=120)
    timestamp: str | None = Field(default=None, max_length=80)

    model_config = ConfigDict(populate_by_name=True)


class HighlightedProfileSourceMarket(BaseModel):
    detected_at: datetime | None = Field(
        default=None,
        validation_alias=AliasChoices("detectedAt", "detected_at"),
        serialization_alias="detectedAt",
    )
    source_market_slug: str | None = Field(
        default=None,
        validation_alias=AliasChoices("sourceMarketSlug", "source_market_slug"),
        serialization_alias="sourceMarketSlug",
        max_length=256,
    )
    source_market_title: str | None = Field(
        default=None,
        validation_alias=AliasChoices("sourceMarketTitle", "source_market_title"),
        serialization_alias="sourceMarketTitle",
        max_length=256,
    )
    source_market_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("sourceMarketUrl", "source_market_url"),
        serialization_alias="sourceMarketUrl",
        max_length=512,
    )

    model_config = ConfigDict(populate_by_name=True)


class HighlightedWalletProfileUpsert(BaseModel):
    avatar_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("avatarUrl", "avatar_url", "profileImageUrl", "profile_image_url"),
        serialization_alias="avatarUrl",
        max_length=1024,
    )
    closed_markets: int | None = Field(
        default=None,
        validation_alias=AliasChoices("closedMarkets", "closed_markets"),
        serialization_alias="closedMarkets",
        ge=0,
    )
    detected_at: datetime | None = Field(
        default=None,
        validation_alias=AliasChoices("detectedAt", "detected_at"),
        serialization_alias="detectedAt",
    )
    history: list[HighlightedProfileMarketHistoryItem] = Field(
        default_factory=list,
        validation_alias=AliasChoices("history", "marketHistory", "market_history"),
        max_length=25,
        serialization_alias="history",
    )
    last_seen_at: datetime | None = Field(
        default=None,
        validation_alias=AliasChoices("lastSeenAt", "last_seen_at"),
        serialization_alias="lastSeenAt",
    )
    last_updated_at: datetime | None = Field(
        default=None,
        validation_alias=AliasChoices("lastUpdatedAt", "last_updated_at"),
        serialization_alias="lastUpdatedAt",
    )
    losses: int | None = Field(default=None, ge=0)
    name: str | None = Field(default=None, max_length=120)
    no_longer_qualifies: bool | None = Field(
        default=None,
        validation_alias=AliasChoices("noLongerQualifies", "no_longer_qualifies"),
        serialization_alias="noLongerQualifies",
    )
    observed_capital_usd: Decimal | None = Field(
        default=None,
        validation_alias=AliasChoices("observedCapitalUsd", "observed_capital_usd"),
        serialization_alias="observedCapitalUsd",
    )
    profile_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("profileUrl", "profile_url"),
        serialization_alias="profileUrl",
        max_length=512,
    )
    proxy_wallet: str | None = Field(
        default=None,
        validation_alias=AliasChoices("proxyWallet", "proxy_wallet"),
        serialization_alias="proxyWallet",
        max_length=80,
    )
    pseudonym: str | None = Field(default=None, max_length=120)
    realized_pnl: Decimal | None = Field(
        default=None,
        validation_alias=AliasChoices("realizedPnl", "realized_pnl"),
        serialization_alias="realizedPnl",
    )
    short_address: str | None = Field(
        default=None,
        validation_alias=AliasChoices("shortAddress", "short_address"),
        serialization_alias="shortAddress",
        max_length=32,
    )
    source: str = Field(default="wallet_intelligence", max_length=120)
    source_limitations: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("sourceLimitations", "source_limitations", "limitations"),
        serialization_alias="sourceLimitations",
        max_length=20,
    )
    source_markets: list[HighlightedProfileSourceMarket] = Field(
        default_factory=list,
        validation_alias=AliasChoices("sourceMarkets", "source_markets"),
        serialization_alias="sourceMarkets",
        max_length=20,
    )
    source_market_slug: str | None = Field(
        default=None,
        validation_alias=AliasChoices("sourceMarketSlug", "source_market_slug"),
        serialization_alias="sourceMarketSlug",
        max_length=256,
    )
    source_market_title: str | None = Field(
        default=None,
        validation_alias=AliasChoices("sourceMarketTitle", "source_market_title"),
        serialization_alias="sourceMarketTitle",
        max_length=256,
    )
    source_market_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("sourceMarketUrl", "source_market_url"),
        serialization_alias="sourceMarketUrl",
        max_length=512,
    )
    source_sport: str | None = Field(
        default=None,
        validation_alias=AliasChoices("sourceSport", "source_sport"),
        serialization_alias="sourceSport",
        max_length=64,
    )
    source_warnings: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("sourceWarnings", "source_warnings", "warnings"),
        serialization_alias="sourceWarnings",
        max_length=20,
    )
    unrealized_pnl: Decimal | None = Field(
        default=None,
        validation_alias=AliasChoices("unrealizedPnl", "unrealized_pnl"),
        serialization_alias="unrealizedPnl",
    )
    verified_badge: bool | None = Field(
        default=None,
        validation_alias=AliasChoices("verifiedBadge", "verified_badge"),
        serialization_alias="verifiedBadge",
    )
    wallet_address: str = Field(
        validation_alias=AliasChoices("walletAddress", "wallet_address"),
        serialization_alias="walletAddress",
        max_length=42,
    )
    win_rate: Decimal | None = Field(
        default=None,
        validation_alias=AliasChoices("winRate", "win_rate"),
        serialization_alias="winRate",
    )
    wins: int | None = Field(default=None, ge=0)
    x_username: str | None = Field(
        default=None,
        validation_alias=AliasChoices("xUsername", "x_username"),
        serialization_alias="xUsername",
        max_length=120,
    )

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("wallet_address", mode="before")
    @classmethod
    def normalize_wallet_address(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("walletAddress must be a public wallet address.")
        return value.strip().lower()

    @field_validator(
        "observed_capital_usd",
        "realized_pnl",
        "unrealized_pnl",
        "win_rate",
        mode="before",
    )
    @classmethod
    def normalize_decimal(cls, value: object) -> Decimal | None:
        if value is None:
            return None
        if isinstance(value, Decimal):
            return value
        if isinstance(value, int | float | str):
            try:
                return Decimal(str(value).strip())
            except (InvalidOperation, ValueError):
                return None
        return None


class HighlightedWalletProfileRead(BaseModel):
    id: str
    wallet_address: str = Field(serialization_alias="walletAddress")
    short_address: str | None = Field(default=None, serialization_alias="shortAddress")
    profile_url: str | None = Field(default=None, serialization_alias="profileUrl")
    pseudonym: str | None = None
    public_name: str | None = Field(default=None, serialization_alias="name")
    profile_image_url: str | None = Field(default=None, serialization_alias="avatarUrl")
    x_username: str | None = Field(default=None, serialization_alias="xUsername")
    verified_badge: bool | None = Field(default=None, serialization_alias="verifiedBadge")
    win_rate: float | None = Field(default=None, serialization_alias="winRate")
    closed_markets: int | None = Field(default=None, serialization_alias="closedMarkets")
    wins: int | None = None
    losses: int | None = None
    realized_pnl: float | None = Field(default=None, serialization_alias="realizedPnl")
    unrealized_pnl: float | None = Field(default=None, serialization_alias="unrealizedPnl")
    observed_capital_usd: float | None = Field(default=None, serialization_alias="observedCapitalUsd")
    qualifies: bool
    qualification_reason: str | None = Field(default=None, serialization_alias="qualificationReason")
    no_longer_qualifies: bool = Field(serialization_alias="noLongerQualifies")
    source: str
    source_market_title: str | None = Field(default=None, serialization_alias="sourceMarketTitle")
    source_market_slug: str | None = Field(default=None, serialization_alias="sourceMarketSlug")
    source_market_url: str | None = Field(default=None, serialization_alias="sourceMarketUrl")
    source_sport: str | None = Field(default=None, serialization_alias="sourceSport")
    market_history: list[dict[str, object]] = Field(default_factory=list, serialization_alias="history")
    warnings: list[str] = Field(default_factory=list, serialization_alias="sourceWarnings")
    limitations: list[str] = Field(default_factory=list, serialization_alias="sourceLimitations")
    first_detected_at: datetime = Field(serialization_alias="detectedAt")
    last_seen_at: datetime = Field(serialization_alias="lastSeenAt")
    last_refreshed_at: datetime | None = Field(default=None, serialization_alias="lastUpdatedAt")
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class HighlightedWalletProfileList(BaseModel):
    items: list[HighlightedWalletProfileRead]
    total: int
