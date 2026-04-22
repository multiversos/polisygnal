from __future__ import annotations

from collections.abc import Generator
from datetime import UTC, datetime

import httpx

from app.core.config import Settings, get_settings


class TheOddsApiClientError(Exception):
    """Raised when The Odds API cannot complete a request."""


class TheOddsApiClient:
    def __init__(
        self,
        *,
        base_url: str,
        timeout_seconds: float,
        api_key: str | None,
        user_agent: str,
    ) -> None:
        self._api_key = api_key.strip() if isinstance(api_key, str) and api_key.strip() else None
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            headers={
                "Accept": "application/json",
                "User-Agent": user_agent,
            },
        )

    @classmethod
    def from_settings(cls, settings: Settings) -> TheOddsApiClient:
        return cls(
            base_url=settings.odds_api_base_url,
            timeout_seconds=settings.odds_api_timeout_seconds,
            api_key=settings.odds_api_key,
            user_agent=settings.polymarket_user_agent,
        )

    def is_configured(self) -> bool:
        return self._api_key is not None

    def close(self) -> None:
        self._client.close()

    def fetch_nba_odds(
        self,
        *,
        regions: str,
        markets: str,
    ) -> list[dict[str, object]]:
        if not self._api_key:
            raise TheOddsApiClientError("ODDS_API_KEY no esta configurada.")

        payload = self._get_json(
            "/v4/sports/basketball_nba/odds",
            params={
                "apiKey": self._api_key,
                "regions": regions,
                "markets": markets,
                "oddsFormat": "american",
                "dateFormat": "iso",
            },
        )
        if not isinstance(payload, list):
            raise TheOddsApiClientError(
                "The Odds API devolvio un payload invalido para /v4/sports/basketball_nba/odds."
            )

        return [item for item in payload if isinstance(item, dict)]

    def _get_json(self, path: str, *, params: dict[str, object]) -> object:
        try:
            response = self._client.get(path, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            message = exc.response.text[:300]
            raise TheOddsApiClientError(
                f"The Odds API respondio con {exc.response.status_code} para {path}: {message}"
            ) from exc
        except httpx.RequestError as exc:
            raise TheOddsApiClientError(f"No se pudo conectar con The Odds API: {exc}") from exc
        except ValueError as exc:
            raise TheOddsApiClientError(
                f"La respuesta de The Odds API no se pudo decodificar como JSON para {path}."
            ) from exc


def get_the_odds_api_client() -> Generator[TheOddsApiClient, None, None]:
    settings = get_settings()
    client = TheOddsApiClient.from_settings(settings)
    try:
        yield client
    finally:
        client.close()


def parse_iso_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    normalized = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed
