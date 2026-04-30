from __future__ import annotations

from collections.abc import Generator
from datetime import UTC, datetime
from decimal import Decimal
from typing import TypeVar

import httpx
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

from app.core.config import Settings, get_settings


class PolymarketDataClientError(Exception):
    """Raised when the public Polymarket Data API cannot complete a request."""


class PolymarketDataTrade(BaseModel):
    proxy_wallet: str | None = Field(default=None, alias="proxyWallet")
    side: str | None = None
    asset: str | None = None
    condition_id: str | None = Field(default=None, alias="conditionId")
    size: Decimal | None = None
    price: Decimal | None = None
    timestamp: datetime | None = None
    title: str | None = None
    slug: str | None = None
    event_slug: str | None = Field(default=None, alias="eventSlug")
    outcome: str | None = None
    outcome_index: int | None = Field(default=None, alias="outcomeIndex")
    pseudonym: str | None = None
    transaction_hash: str | None = Field(default=None, alias="transactionHash")

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    @field_validator("size", "price", mode="before")
    @classmethod
    def parse_decimal(cls, value: object) -> Decimal | None:
        return _parse_decimal(value)

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, value: object) -> datetime | None:
        return _parse_timestamp(value)


class PolymarketDataMarketPosition(BaseModel):
    proxy_wallet: str | None = Field(default=None, alias="proxyWallet")
    pseudonym: str | None = None
    asset: str | None = None
    condition_id: str | None = Field(default=None, alias="conditionId")
    avg_price: Decimal | None = Field(default=None, alias="avgPrice")
    size: Decimal | None = None
    curr_price: Decimal | None = Field(
        default=None,
        validation_alias=AliasChoices("currPrice", "curPrice"),
    )
    current_value: Decimal | None = Field(default=None, alias="currentValue")
    cash_pnl: Decimal | None = Field(default=None, alias="cashPnl")
    total_bought: Decimal | None = Field(default=None, alias="totalBought")
    realized_pnl: Decimal | None = Field(default=None, alias="realizedPnl")
    total_pnl: Decimal | None = Field(default=None, alias="totalPnl")
    outcome: str | None = None
    outcome_index: int | None = Field(default=None, alias="outcomeIndex")

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    @field_validator(
        "avg_price",
        "size",
        "curr_price",
        "current_value",
        "cash_pnl",
        "total_bought",
        "realized_pnl",
        "total_pnl",
        mode="before",
    )
    @classmethod
    def parse_decimal(cls, value: object) -> Decimal | None:
        return _parse_decimal(value)


class PolymarketDataMarketPositionGroup(BaseModel):
    token: str | None = None
    positions: list[PolymarketDataMarketPosition] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class PolymarketDataUserPosition(BaseModel):
    proxy_wallet: str | None = Field(default=None, alias="proxyWallet")
    asset: str | None = None
    condition_id: str | None = Field(default=None, alias="conditionId")
    size: Decimal | None = None
    avg_price: Decimal | None = Field(default=None, alias="avgPrice")
    current_value: Decimal | None = Field(default=None, alias="currentValue")
    cash_pnl: Decimal | None = Field(default=None, alias="cashPnl")
    percent_pnl: Decimal | None = Field(default=None, alias="percentPnl")
    total_bought: Decimal | None = Field(default=None, alias="totalBought")
    realized_pnl: Decimal | None = Field(default=None, alias="realizedPnl")
    title: str | None = None
    outcome: str | None = None
    timestamp: datetime | None = None

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    @field_validator(
        "size",
        "avg_price",
        "current_value",
        "cash_pnl",
        "percent_pnl",
        "total_bought",
        "realized_pnl",
        mode="before",
    )
    @classmethod
    def parse_decimal(cls, value: object) -> Decimal | None:
        return _parse_decimal(value)

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, value: object) -> datetime | None:
        return _parse_timestamp(value)


class PolymarketLeaderboardEntry(BaseModel):
    rank: str | int | None = None
    proxy_wallet: str | None = Field(default=None, alias="proxyWallet")
    user_name: str | None = Field(default=None, alias="userName")
    volume: Decimal | None = Field(default=None, alias="vol")
    pnl: Decimal | None = None
    verified_badge: bool | None = Field(default=None, alias="verifiedBadge")

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    @field_validator("volume", "pnl", mode="before")
    @classmethod
    def parse_decimal(cls, value: object) -> Decimal | None:
        return _parse_decimal(value)


class PolymarketPublicProfile(BaseModel):
    proxy_wallet: str | None = Field(default=None, alias="proxyWallet")
    pseudonym: str | None = None

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class PolymarketDataClient:
    def __init__(
        self,
        *,
        base_url: str,
        gamma_base_url: str,
        timeout_seconds: float,
        user_agent: str,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._gamma_base_url = gamma_base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            headers={
                "Accept": "application/json",
                "User-Agent": user_agent,
            },
            transport=transport,
        )

    @classmethod
    def from_settings(cls, settings: Settings) -> PolymarketDataClient:
        return cls(
            base_url=settings.polymarket_data_base_url,
            gamma_base_url=settings.polymarket_base_url,
            timeout_seconds=settings.polymarket_data_timeout_seconds,
            user_agent=settings.polymarket_user_agent,
        )

    def close(self) -> None:
        self._client.close()

    def get_trades_for_market(
        self,
        condition_id: str,
        *,
        limit: int = 50,
        offset: int = 0,
        taker_only: bool = True,
    ) -> list[PolymarketDataTrade]:
        payload = self._get_json(
            "/trades",
            params={
                "market": condition_id,
                "limit": limit,
                "offset": offset,
                "takerOnly": str(taker_only).lower(),
            },
        )
        return _parse_list(payload, PolymarketDataTrade)

    def get_trades_for_user(
        self,
        wallet: str,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> list[PolymarketDataTrade]:
        payload = self._get_json(
            "/trades",
            params={"user": wallet, "limit": limit, "offset": offset},
        )
        return _parse_list(payload, PolymarketDataTrade)

    def get_user_positions(
        self,
        wallet: str,
        *,
        limit: int = 100,
        offset: int = 0,
    ) -> list[PolymarketDataUserPosition]:
        payload = self._get_json(
            "/positions",
            params={"user": wallet, "limit": limit, "offset": offset},
        )
        return _parse_list(payload, PolymarketDataUserPosition)

    def get_user_closed_positions(
        self,
        wallet: str,
        *,
        limit: int = 100,
        offset: int = 0,
    ) -> list[PolymarketDataUserPosition]:
        payload = self._get_json(
            "/closed-positions",
            params={"user": wallet, "limit": limit, "offset": offset},
        )
        return _parse_list(payload, PolymarketDataUserPosition)

    def get_user_profile(self, wallet: str) -> PolymarketPublicProfile | None:
        payload = self._get_json_url(
            f"{self._gamma_base_url}/public-profile",
            params={"address": wallet},
        )
        if not isinstance(payload, dict):
            return None
        return PolymarketPublicProfile.model_validate(payload)

    def get_positions_for_market(
        self,
        condition_id: str,
        *,
        status: str = "OPEN",
        limit: int = 50,
    ) -> list[PolymarketDataMarketPosition]:
        payload = self._get_json(
            "/v1/market-positions",
            params={
                "market": condition_id,
                "status": status,
                "sortBy": "CURRENT_VALUE",
                "sortDirection": "DESC",
            },
        )
        groups = _parse_list(payload, PolymarketDataMarketPositionGroup)
        positions: list[PolymarketDataMarketPosition] = []
        for group in groups:
            positions.extend(group.positions)
            if len(positions) >= limit:
                break
        return positions[:limit]

    def get_leaderboard(
        self,
        *,
        limit: int = 25,
        category: str = "OVERALL",
        time_period: str = "ALL",
        order_by: str = "PNL",
    ) -> list[PolymarketLeaderboardEntry]:
        payload = self._get_json(
            "/v1/leaderboard",
            params={
                "limit": limit,
                "category": category,
                "timePeriod": time_period,
                "orderBy": order_by,
            },
        )
        return _parse_list(payload, PolymarketLeaderboardEntry)

    def _get_json(self, path: str, *, params: dict[str, object]) -> object:
        try:
            response = self._client.get(path, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            message = exc.response.text[:300]
            raise PolymarketDataClientError(
                f"Polymarket Data API respondio con {exc.response.status_code} para {path}: {message}"
            ) from exc
        except httpx.RequestError as exc:
            raise PolymarketDataClientError(
                f"No se pudo conectar con Polymarket Data API: {exc}"
            ) from exc
        except ValueError as exc:
            raise PolymarketDataClientError(
                f"La respuesta de Polymarket Data API no se pudo decodificar como JSON para {path}."
            ) from exc

    def _get_json_url(self, url: str, *, params: dict[str, object]) -> object:
        try:
            response = self._client.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            message = exc.response.text[:300]
            raise PolymarketDataClientError(
                f"Polymarket public profile respondio con {exc.response.status_code}: {message}"
            ) from exc
        except httpx.RequestError as exc:
            raise PolymarketDataClientError(
                f"No se pudo conectar con Polymarket public profile: {exc}"
            ) from exc
        except ValueError as exc:
            raise PolymarketDataClientError(
                "La respuesta de Polymarket public profile no se pudo decodificar como JSON."
            ) from exc


def get_polymarket_data_client() -> Generator[PolymarketDataClient, None, None]:
    settings = get_settings()
    client = PolymarketDataClient.from_settings(settings)
    try:
        yield client
    finally:
        client.close()


ModelT = TypeVar("ModelT", bound=BaseModel)


def _parse_list(payload: object, model_type: type[ModelT]) -> list[ModelT]:
    items = payload
    if isinstance(payload, dict):
        for key in ("data", "items", "results"):
            if isinstance(payload.get(key), list):
                items = payload[key]
                break
    if not isinstance(items, list):
        raise PolymarketDataClientError("La API de Polymarket Data devolvio un payload invalido.")
    return [model_type.model_validate(item) for item in items if isinstance(item, dict)]


def _parse_decimal(value: object) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int | float):
        return Decimal(str(value))
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return Decimal(stripped)
        except Exception:
            return None
    return None


def _parse_timestamp(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    if isinstance(value, int | float):
        return datetime.fromtimestamp(value, tz=UTC)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return datetime.fromtimestamp(float(stripped), tz=UTC)
        except Exception:
            try:
                parsed = datetime.fromisoformat(stripped.replace("Z", "+00:00"))
            except ValueError:
                return None
            return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)
    return None
