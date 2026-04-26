from __future__ import annotations

from collections.abc import Generator
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.core.config import Settings, get_settings


class KalshiClientError(Exception):
    """Raised when the Kalshi read-only client cannot complete a request."""


class KalshiMarketPayload(BaseModel):
    ticker: str
    event_ticker: str | None = None
    market_type: str | None = None
    yes_sub_title: str | None = None
    no_sub_title: str | None = None
    status: str | None = None
    title: str | None = None
    subtitle: str | None = None
    rules_primary: str | None = None
    rules_secondary: str | None = None
    close_time: datetime | None = None
    expiration_time: datetime | None = None
    expected_expiration_time: datetime | None = None
    yes_bid_dollars: Decimal | None = None
    yes_ask_dollars: Decimal | None = None
    no_bid_dollars: Decimal | None = None
    no_ask_dollars: Decimal | None = None
    last_price_dollars: Decimal | None = None
    volume_fp: Decimal | None = None
    volume_24h_fp: Decimal | None = None
    liquidity_dollars: Decimal | None = None
    open_interest_fp: Decimal | None = None
    response_price_units: str | None = None
    primary_participant_key: str | None = None

    model_config = ConfigDict(extra="ignore")

    @field_validator(
        "yes_bid_dollars",
        "yes_ask_dollars",
        "no_bid_dollars",
        "no_ask_dollars",
        "last_price_dollars",
        "volume_fp",
        "volume_24h_fp",
        "liquidity_dollars",
        "open_interest_fp",
        mode="before",
    )
    @classmethod
    def parse_decimal_field(cls, value: object) -> Decimal | None:
        return _parse_decimal(value)


class KalshiEventPayload(BaseModel):
    event_ticker: str
    series_ticker: str | None = None
    sub_title: str | None = None
    title: str | None = None
    category: str | None = None
    status: str | None = None
    strike_date: datetime | None = None
    last_updated_ts: datetime | None = None
    markets: list[KalshiMarketPayload] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class KalshiEventMetadataMarketDetailPayload(BaseModel):
    market_ticker: str | None = None
    image_url: str | None = None
    color_code: str | None = None

    model_config = ConfigDict(extra="ignore")


class KalshiEventMetadataPayload(BaseModel):
    image_url: str | None = None
    featured_image_url: str | None = None
    competition: str | None = None
    competition_scope: str | None = None
    market_details: list[KalshiEventMetadataMarketDetailPayload] = Field(default_factory=list)
    settlement_sources: list[dict[str, object]] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class KalshiOrderbookPayload(BaseModel):
    ticker: str | None = None
    orderbook_fp: dict[str, object] | None = None
    orderbook: dict[str, object] | None = None

    model_config = ConfigDict(extra="ignore")


@dataclass(slots=True)
class KalshiMarketsPage:
    markets: list[KalshiMarketPayload]
    cursor: str | None = None
    errors: list[str] = field(default_factory=list)


@dataclass(slots=True)
class KalshiEventsPage:
    events: list[KalshiEventPayload]
    cursor: str | None = None
    errors: list[str] = field(default_factory=list)


class KalshiReadOnlyClient:
    def __init__(
        self,
        *,
        base_url: str,
        timeout_seconds: float,
        user_agent: str,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            transport=transport,
            headers={
                "Accept": "application/json",
                "User-Agent": user_agent,
            },
        )

    @classmethod
    def from_settings(cls, settings: Settings) -> KalshiReadOnlyClient:
        return cls(
            base_url=settings.kalshi_base_url,
            timeout_seconds=settings.kalshi_timeout_seconds,
            user_agent=settings.polymarket_user_agent,
        )

    def close(self) -> None:
        self._client.close()

    def list_markets(
        self,
        *,
        limit: int = 100,
        status: str | None = None,
        cursor: str | None = None,
        query: str | None = None,
    ) -> KalshiMarketsPage:
        params: dict[str, object] = {"limit": limit}
        if status:
            params["status"] = status
        if cursor:
            params["cursor"] = cursor

        payload = self._get_json("/markets", params=params)
        if not isinstance(payload, dict):
            raise KalshiClientError("Kalshi devolvio un payload invalido para /markets.")
        raw_markets = payload.get("markets", [])
        if not isinstance(raw_markets, list):
            raise KalshiClientError("Kalshi devolvio una lista de markets invalida.")

        markets: list[KalshiMarketPayload] = []
        errors: list[str] = []
        for index, raw_market in enumerate(raw_markets):
            try:
                market = KalshiMarketPayload.model_validate(raw_market)
            except ValidationError as exc:
                errors.append(
                    f"Error parseando market index={index}: {exc.errors()[0]['msg']}"
                )
                continue
            if _matches_query(market, query):
                markets.append(market)

        return KalshiMarketsPage(
            markets=markets,
            cursor=_parse_optional_text(payload.get("cursor")),
            errors=errors,
        )

    def get_market(self, ticker: str) -> KalshiMarketPayload:
        payload = self._get_json(f"/markets/{ticker}", params={})
        if not isinstance(payload, dict) or not isinstance(payload.get("market"), dict):
            raise KalshiClientError(
                f"Kalshi devolvio un payload invalido para /markets/{ticker}."
            )
        try:
            return KalshiMarketPayload.model_validate(payload["market"])
        except ValidationError as exc:
            raise KalshiClientError(
                f"Error parseando market {ticker}: {exc.errors()[0]['msg']}"
            ) from exc

    def get_orderbook(self, ticker: str, *, depth: int | None = None) -> KalshiOrderbookPayload:
        params: dict[str, object] = {}
        if depth is not None:
            params["depth"] = depth
        payload = self._get_json(f"/markets/{ticker}/orderbook", params=params)
        if not isinstance(payload, dict):
            raise KalshiClientError(
                f"Kalshi devolvio un payload invalido para /markets/{ticker}/orderbook."
            )
        payload = {"ticker": ticker, **payload}
        try:
            return KalshiOrderbookPayload.model_validate(payload)
        except ValidationError as exc:
            raise KalshiClientError(
                f"Error parseando orderbook {ticker}: {exc.errors()[0]['msg']}"
            ) from exc

    def list_events(
        self,
        *,
        limit: int = 100,
        cursor: str | None = None,
        status: str | None = None,
    ) -> KalshiEventsPage:
        params: dict[str, object] = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        if status:
            params["status"] = status
        payload = self._get_json("/events", params=params)
        if not isinstance(payload, dict):
            raise KalshiClientError("Kalshi devolvio un payload invalido para /events.")
        raw_events = payload.get("events", [])
        if not isinstance(raw_events, list):
            raise KalshiClientError("Kalshi devolvio una lista de events invalida.")

        events: list[KalshiEventPayload] = []
        errors: list[str] = []
        for index, raw_event in enumerate(raw_events):
            try:
                events.append(KalshiEventPayload.model_validate(raw_event))
            except ValidationError as exc:
                errors.append(
                    f"Error parseando event index={index}: {exc.errors()[0]['msg']}"
                )
        return KalshiEventsPage(
            events=events,
            cursor=_parse_optional_text(payload.get("cursor")),
            errors=errors,
        )

    def get_event(self, event_ticker: str) -> KalshiEventPayload:
        payload = self._get_json(f"/events/{event_ticker}", params={})
        if not isinstance(payload, dict) or not isinstance(payload.get("event"), dict):
            raise KalshiClientError(
                f"Kalshi devolvio un payload invalido para /events/{event_ticker}."
            )
        try:
            return KalshiEventPayload.model_validate(payload["event"])
        except ValidationError as exc:
            raise KalshiClientError(
                f"Error parseando event {event_ticker}: {exc.errors()[0]['msg']}"
            ) from exc

    def get_event_metadata(self, event_ticker: str) -> KalshiEventMetadataPayload:
        payload = self._get_json(f"/events/{event_ticker}/metadata", params={})
        if not isinstance(payload, dict):
            raise KalshiClientError(
                f"Kalshi devolvio un payload invalido para /events/{event_ticker}/metadata."
            )
        try:
            return KalshiEventMetadataPayload.model_validate(payload)
        except ValidationError as exc:
            raise KalshiClientError(
                f"Error parseando metadata {event_ticker}: {exc.errors()[0]['msg']}"
            ) from exc

    def get_sport_filters(self) -> dict[str, object]:
        payload = self._get_json("/search/filters_by_sport", params={})
        if not isinstance(payload, dict):
            raise KalshiClientError(
                "Kalshi devolvio un payload invalido para /search/filters_by_sport."
            )
        return payload

    def _get_json(self, path: str, *, params: dict[str, object]) -> object:
        try:
            response = self._client.get(path, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            message = exc.response.text[:300]
            raise KalshiClientError(
                f"Kalshi respondio con {exc.response.status_code} para {path}: {message}"
            ) from exc
        except httpx.RequestError as exc:
            raise KalshiClientError(f"No se pudo conectar con Kalshi: {exc}") from exc
        except ValueError as exc:
            raise KalshiClientError(
                f"La respuesta de Kalshi no se pudo decodificar como JSON para {path}."
            ) from exc


def get_kalshi_client() -> Generator[KalshiReadOnlyClient, None, None]:
    settings = get_settings()
    client = KalshiReadOnlyClient.from_settings(settings)
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


def _matches_query(market: KalshiMarketPayload, query: str | None) -> bool:
    if not query or not query.strip():
        return True
    normalized_query = query.strip().lower()
    haystack = " ".join(
        part
        for part in [
            market.ticker,
            market.event_ticker or "",
            market.title or "",
            market.subtitle or "",
            market.yes_sub_title or "",
            market.no_sub_title or "",
        ]
        if part
    ).lower()
    return normalized_query in haystack
