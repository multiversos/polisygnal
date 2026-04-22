from __future__ import annotations

from collections.abc import Generator
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

import httpx

from app.core.config import Settings, get_settings


class ClobClientError(Exception):
    """Raised when the CLOB client cannot complete a request."""


class ClobNotFoundError(ClobClientError):
    """Raised when the requested token has no order book or pricing record."""


@dataclass(slots=True)
class ClobOrderBook:
    best_bid: Decimal | None = None
    best_ask: Decimal | None = None


@dataclass(slots=True)
class ClobPricePoint:
    timestamp: datetime
    price: Decimal


class PolymarketClobClient:
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
    def from_settings(cls, settings: Settings) -> PolymarketClobClient:
        return cls(
            base_url=settings.polymarket_clob_base_url,
            timeout_seconds=settings.polymarket_clob_timeout_seconds,
            user_agent=settings.polymarket_user_agent,
        )

    def close(self) -> None:
        self._client.close()

    def fetch_order_book(self, token_id: str) -> ClobOrderBook:
        payload = self._request_json("GET", "/book", params={"token_id": token_id})
        if not isinstance(payload, dict):
            raise ClobClientError("La API CLOB devolvio un payload invalido para /book.")

        bids = payload.get("bids")
        asks = payload.get("asks")
        return ClobOrderBook(
            best_bid=_select_best_price(bids, highest=True),
            best_ask=_select_best_price(asks, highest=False),
        )

    def fetch_midpoint(self, token_id: str) -> Decimal | None:
        payload = self._request_json("GET", "/midpoint", params={"token_id": token_id})
        if not isinstance(payload, dict):
            raise ClobClientError("La API CLOB devolvio un payload invalido para /midpoint.")
        return _parse_decimal(payload.get("mid"))

    def fetch_spread(self, token_id: str) -> Decimal | None:
        payload = self._request_json("GET", "/spread", params={"token_id": token_id})
        if not isinstance(payload, dict):
            raise ClobClientError("La API CLOB devolvio un payload invalido para /spread.")
        return _parse_decimal(payload.get("spread"))

    def fetch_last_trade_prices(self, token_ids: list[str]) -> dict[str, Decimal | None]:
        if not token_ids:
            return {}

        payload = self._request_json(
            "POST",
            "/last-trades-prices",
            json=[{"token_id": token_id} for token_id in token_ids],
        )
        if not isinstance(payload, list):
            raise ClobClientError(
                "La API CLOB devolvio un payload invalido para /last-trades-prices."
            )

        last_trade_by_token: dict[str, Decimal | None] = {}
        for raw_item in payload:
            if not isinstance(raw_item, dict):
                continue
            token_id = raw_item.get("token_id")
            if not isinstance(token_id, str) or not token_id.strip():
                continue
            last_trade_by_token[token_id] = _parse_decimal(raw_item.get("price"))

        return last_trade_by_token

    def fetch_price_history(
        self,
        token_id: str,
        *,
        start_ts: int | None = None,
        end_ts: int | None = None,
        interval: str = "1h",
        fidelity: int = 60,
    ) -> list[ClobPricePoint]:
        params: dict[str, object] = {
            "market": token_id,
            "interval": interval,
            "fidelity": fidelity,
        }
        if start_ts is not None:
            params["startTs"] = start_ts
        if end_ts is not None:
            params["endTs"] = end_ts

        payload = self._request_json("GET", "/prices-history", params=params)
        if not isinstance(payload, dict):
            raise ClobClientError("La API CLOB devolvio un payload invalido para /prices-history.")

        history = payload.get("history", [])
        if not isinstance(history, list):
            raise ClobClientError("La API CLOB devolvio un history invalido para /prices-history.")

        points: list[ClobPricePoint] = []
        for raw_item in history:
            if not isinstance(raw_item, dict):
                continue
            price = _parse_decimal(raw_item.get("p"))
            timestamp = _parse_timestamp(raw_item.get("t"))
            if price is None or timestamp is None:
                continue
            points.append(ClobPricePoint(timestamp=timestamp, price=price))

        return points

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, object] | None = None,
        json: object | None = None,
    ) -> object:
        try:
            response = self._client.request(method, path, params=params, json=json)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            message = exc.response.text[:300]
            if exc.response.status_code == 404:
                raise ClobNotFoundError(
                    f"CLOB respondio con 404 para {path}: {message}"
                ) from exc
            raise ClobClientError(
                f"CLOB respondio con {exc.response.status_code} para {path}: {message}"
            ) from exc
        except httpx.RequestError as exc:
            raise ClobClientError(f"No se pudo conectar con CLOB: {exc}") from exc
        except ValueError as exc:
            raise ClobClientError(
                f"La respuesta de CLOB no se pudo decodificar como JSON para {path}."
            ) from exc


def get_clob_client() -> Generator[PolymarketClobClient, None, None]:
    settings = get_settings()
    client = PolymarketClobClient.from_settings(settings)
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


def _parse_timestamp(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, int | float):
        return datetime.fromtimestamp(value, tz=UTC)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return datetime.fromtimestamp(float(stripped), tz=UTC)
        except Exception:
            return None
    return None


def _select_best_price(levels: object, *, highest: bool) -> Decimal | None:
    if not isinstance(levels, list):
        return None

    prices = [
        price
        for price in (_parse_decimal(item.get("price")) for item in levels if isinstance(item, dict))
        if price is not None
    ]
    if not prices:
        return None
    return max(prices) if highest else min(prices)
