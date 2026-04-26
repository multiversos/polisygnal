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
    end_date: datetime | None = Field(default=None, alias="endDate")
    start_date: datetime | None = Field(default=None, alias="startDate")
    clob_token_ids: list[str] = Field(default_factory=list, alias="clobTokenIds")

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    @field_validator("clob_token_ids", mode="before")
    @classmethod
    def parse_clob_token_ids(cls, value: object) -> list[str]:
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
    ) -> PolymarketEventsPage:
        params: dict[str, object] = {
            "active": "true",
            "closed": "false",
            "limit": limit,
            "offset": offset,
        }
        if tag_id:
            params["tag_id"] = tag_id

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
