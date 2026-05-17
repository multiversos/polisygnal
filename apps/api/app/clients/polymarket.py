from __future__ import annotations

import json
from collections.abc import Generator
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

import httpx
from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
)

from app.core.config import Settings, get_settings


class PolymarketClientError(Exception):
    """Raised when the Polymarket client cannot complete a request."""


class PolymarketTagPayload(BaseModel):
    id: str | None = None
    label: str | None = None
    slug: str | None = None

    model_config = ConfigDict(extra="ignore")


class PolymarketMarketPayload(BaseModel):
    id: str | None = None
    question: str | None = None
    slug: str | None = None
    condition_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("conditionId", "conditionID", "condition_id"),
    )
    question_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("questionID", "questionId", "question_id"),
    )
    description: str | None = None
    image_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "image",
            "imageUrl",
            "image_url",
            "imageOptimized",
            "imageOptimizedUrl",
            "thumbnail",
            "thumbnailUrl",
        ),
    )
    icon_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "icon",
            "iconUrl",
            "icon_url",
            "iconOptimized",
            "iconOptimizedUrl",
            "logo",
            "logoUrl",
        ),
    )
    active: bool | None = None
    closed: bool | None = None
    resolution_source: str | None = Field(
        default=None,
        validation_alias=AliasChoices("resolutionSource", "resolution_source"),
    )
    end_date: datetime | None = Field(default=None, alias="endDate")
    start_date: datetime | None = Field(default=None, alias="startDate")
    liquidity: Decimal | None = None
    volume: Decimal | None = None
    clob_token_ids: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("clobTokenIds", "clobTokenIDs", "clob_token_ids"),
    )
    outcomes: list[str] = Field(default_factory=list)
    outcome_prices: list[Decimal] = Field(
        default_factory=list,
        validation_alias=AliasChoices("outcomePrices", "outcome_prices"),
    )
    outcome_tokens: list[dict[str, object]] = Field(
        default_factory=list,
        validation_alias=AliasChoices("tokens", "outcomeTokens", "outcome_tokens"),
    )
    uma_resolution_statuses: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("umaResolutionStatuses", "uma_resolution_statuses"),
    )

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    @field_validator("clob_token_ids", "outcomes", "uma_resolution_statuses", mode="before")
    @classmethod
    def parse_string_list(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item) for item in value]
        if isinstance(value, str):
            raw_value = value.strip()
            if not raw_value:
                return []
            try:
                parsed = json.loads(raw_value)
            except json.JSONDecodeError:
                return [raw_value]
            if isinstance(parsed, list):
                return [str(item) for item in parsed]
        return []

    @field_validator("outcome_prices", mode="before")
    @classmethod
    def parse_decimal_list(cls, value: object) -> list[Decimal]:
        if value is None:
            return []
        if isinstance(value, str):
            raw_value = value.strip()
            if not raw_value:
                return []
            try:
                value = json.loads(raw_value)
            except json.JSONDecodeError:
                parsed = _parse_decimal(raw_value)
                return [parsed] if parsed is not None else []
        if not isinstance(value, list):
            parsed = _parse_decimal(value)
            return [parsed] if parsed is not None else []
        prices: list[Decimal] = []
        for item in value:
            parsed = _parse_decimal(item)
            if parsed is not None:
                prices.append(parsed)
        return prices

    @field_validator("liquidity", "volume", mode="before")
    @classmethod
    def parse_base_decimal_field(cls, value: object) -> Decimal | None:
        return _parse_decimal(value)

    @field_validator("outcome_tokens", mode="before")
    @classmethod
    def parse_outcome_tokens(cls, value: object) -> list[dict[str, object]]:
        if value is None:
            return []
        if isinstance(value, str):
            raw_value = value.strip()
            if not raw_value:
                return []
            try:
                value = json.loads(raw_value)
            except json.JSONDecodeError:
                return []
        if not isinstance(value, list):
            return []
        tokens: list[dict[str, object]] = []
        for item in value:
            if isinstance(item, dict):
                clean_item: dict[str, object] = {}
                for key in (
                    "token_id",
                    "tokenId",
                    "id",
                    "outcome",
                    "name",
                    "price",
                ):
                    if item.get(key) is not None:
                        clean_item[key] = item[key]
                if clean_item:
                    tokens.append(clean_item)
            elif item is not None:
                tokens.append({"token_id": str(item)})
        return tokens

    @field_validator("image_url", "icon_url", mode="before")
    @classmethod
    def parse_optional_url(cls, value: object) -> str | None:
        return _parse_optional_text(value)


class PolymarketMarketDetailsPayload(PolymarketMarketPayload):
    liquidity: Decimal | None = None
    volume: Decimal | None = None

    @field_validator("liquidity", "volume", mode="before")
    @classmethod
    def parse_decimal_field(cls, value: object) -> Decimal | None:
        return _parse_decimal(value)


class PolymarketEventPayload(BaseModel):
    id: str | None = None
    slug: str | None = None
    title: str | None = None
    category: str | None = None
    description: str | None = None
    image_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "image",
            "imageUrl",
            "image_url",
            "imageOptimized",
            "imageOptimizedUrl",
            "thumbnail",
            "thumbnailUrl",
        ),
    )
    icon_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "icon",
            "iconUrl",
            "icon_url",
            "iconOptimized",
            "iconOptimizedUrl",
            "logo",
            "logoUrl",
        ),
    )
    active: bool | None = None
    closed: bool | None = None
    start_date: datetime | None = Field(default=None, alias="startDate")
    end_date: datetime | None = Field(default=None, alias="endDate")
    tags: list[PolymarketTagPayload] = Field(default_factory=list)
    markets: list[PolymarketMarketPayload] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    @field_validator("image_url", "icon_url", mode="before")
    @classmethod
    def parse_optional_url(cls, value: object) -> str | None:
        return _parse_optional_text(value)


@dataclass(slots=True)
class PolymarketEventsPage:
    events: list[PolymarketEventPayload]
    errors: list[str] = field(default_factory=list)
    next_offset: int | None = None


class PolymarketGammaClient:
    def __init__(
        self,
        *,
        base_url: str,
        timeout_seconds: float,
        user_agent: str,
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            headers={
                "Accept": "application/json",
                "User-Agent": user_agent,
            },
        )

    @classmethod
    def from_settings(cls, settings: Settings) -> PolymarketGammaClient:
        return cls(
            base_url=settings.polymarket_base_url,
            timeout_seconds=settings.polymarket_timeout_seconds,
            user_agent=settings.polymarket_user_agent,
        )

    def close(self) -> None:
        self._client.close()

    def fetch_active_events_page(
        self,
        *,
        limit: int,
        offset: int,
        tag_id: str | None = None,
        order: str | None = None,
        ascending: bool | None = None,
        end_date_min: datetime | None = None,
        end_date_max: datetime | None = None,
    ) -> PolymarketEventsPage:
        params: dict[str, object] = {
            "active": "true",
            "closed": "false",
            "limit": limit,
            "offset": offset,
        }
        if tag_id:
            params["tag_id"] = tag_id
        if order:
            params["order"] = order
        if ascending is not None:
            params["ascending"] = "true" if ascending else "false"
        if end_date_min is not None:
            params["end_date_min"] = end_date_min.isoformat()
        if end_date_max is not None:
            params["end_date_max"] = end_date_max.isoformat()

        payload = self._get_json(
            "/events",
            params=params,
        )
        if not isinstance(payload, list):
            raise PolymarketClientError("La API de Polymarket devolvio un payload invalido para /events.")

        events: list[PolymarketEventPayload] = []
        errors: list[str] = []
        for index, raw_event in enumerate(payload):
            try:
                events.append(PolymarketEventPayload.model_validate(raw_event))
            except ValidationError as exc:
                errors.append(
                    f"Error parseando evento en offset={offset}, index={index}: {exc.errors()[0]['msg']}"
                )

        next_offset = offset + limit if len(payload) == limit and len(payload) > 0 else None
        return PolymarketEventsPage(events=events, errors=errors, next_offset=next_offset)

    def fetch_markets_by_ids(
        self,
        market_ids: list[str],
    ) -> dict[str, PolymarketMarketDetailsPayload]:
        if not market_ids:
            return {}

        payload = self._get_json(
            "/markets",
            params=[("id", market_id) for market_id in market_ids],
        )
        if not isinstance(payload, list):
            raise PolymarketClientError("La API de Polymarket devolvio un payload invalido para /markets.")

        markets_by_id: dict[str, PolymarketMarketDetailsPayload] = {}
        for index, raw_market in enumerate(payload):
            try:
                market = PolymarketMarketDetailsPayload.model_validate(raw_market)
            except ValidationError as exc:
                raise PolymarketClientError(
                    f"Error parseando mercado en /markets index={index}: {exc.errors()[0]['msg']}"
                ) from exc
            if market.id:
                markets_by_id[market.id] = market

        return markets_by_id

    def fetch_markets_by_condition_ids(
        self,
        condition_ids: list[str],
    ) -> dict[str, PolymarketMarketDetailsPayload]:
        if not condition_ids:
            return {}

        payload = self._get_json(
            "/markets",
            params=[("condition_ids", condition_id) for condition_id in condition_ids],
        )
        if not isinstance(payload, list):
            raise PolymarketClientError("La API de Polymarket devolvio un payload invalido para /markets.")

        markets_by_condition_id: dict[str, PolymarketMarketDetailsPayload] = {}
        for index, raw_market in enumerate(payload):
            try:
                market = PolymarketMarketDetailsPayload.model_validate(raw_market)
            except ValidationError as exc:
                raise PolymarketClientError(
                    f"Error parseando mercado en /markets index={index}: {exc.errors()[0]['msg']}"
                ) from exc
            if market.condition_id:
                markets_by_condition_id[market.condition_id] = market
        return markets_by_condition_id

    def fetch_market_by_condition_id(self, condition_id: str) -> PolymarketMarketDetailsPayload | None:
        markets = self.fetch_markets_by_condition_ids([condition_id])
        return markets.get(condition_id)

    def fetch_market_by_slug(self, slug: str) -> PolymarketMarketDetailsPayload | None:
        payload = self._get_json(
            "/markets",
            params={"slug": slug},
        )
        if not isinstance(payload, list):
            raise PolymarketClientError("La API de Polymarket devolvio un payload invalido para /markets.")
        if len(payload) == 0:
            return None
        try:
            return PolymarketMarketDetailsPayload.model_validate(payload[0])
        except ValidationError as exc:
            raise PolymarketClientError(
                f"Error parseando mercado en /markets slug={slug}: {exc.errors()[0]['msg']}"
            ) from exc

    def fetch_event_by_slug(self, slug: str) -> PolymarketEventPayload | None:
        payload = self._get_json(
            "/events",
            params={"slug": slug},
        )
        if not isinstance(payload, list):
            raise PolymarketClientError("La API de Polymarket devolvio un payload invalido para /events.")
        if len(payload) == 0:
            return None
        try:
            return PolymarketEventPayload.model_validate(payload[0])
        except ValidationError as exc:
            raise PolymarketClientError(
                f"Error parseando evento en /events slug={slug}: {exc.errors()[0]['msg']}"
            ) from exc

    def _get_json(self, path: str, *, params: dict[str, object] | list[tuple[str, object]]) -> object:
        try:
            response = self._client.get(path, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            message = exc.response.text[:300]
            raise PolymarketClientError(
                f"Polymarket respondio con {exc.response.status_code} para {path}: {message}"
            ) from exc
        except httpx.RequestError as exc:
            raise PolymarketClientError(f"No se pudo conectar con Polymarket: {exc}") from exc
        except ValueError as exc:
            raise PolymarketClientError(
                f"La respuesta de Polymarket no se pudo decodificar como JSON para {path}."
            ) from exc


def get_polymarket_client() -> Generator[PolymarketGammaClient, None, None]:
    settings = get_settings()
    client = PolymarketGammaClient.from_settings(settings)
    try:
        yield client
    finally:
        client.close()


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


def _parse_optional_text(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value).strip() or None
