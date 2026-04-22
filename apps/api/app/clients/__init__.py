"""External API clients."""

from app.clients.clob import (
    ClobClientError,
    ClobNotFoundError,
    PolymarketClobClient,
    get_clob_client,
)
from app.clients.espn_rss import EspnNewsItem, EspnRssClient, EspnRssClientError, get_espn_rss_client
from app.clients.polymarket import PolymarketClientError, PolymarketGammaClient, get_polymarket_client
from app.clients.the_odds_api import TheOddsApiClient, TheOddsApiClientError, get_the_odds_api_client

__all__ = [
    "ClobClientError",
    "ClobNotFoundError",
    "EspnNewsItem",
    "EspnRssClient",
    "EspnRssClientError",
    "PolymarketClobClient",
    "PolymarketClientError",
    "PolymarketGammaClient",
    "TheOddsApiClient",
    "TheOddsApiClientError",
    "get_espn_rss_client",
    "get_clob_client",
    "get_polymarket_client",
    "get_the_odds_api_client",
]
