from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = API_DIR.parents[1]


class Settings(BaseSettings):
    app_name: str = "PolySignal API"
    environment: str = Field(default="development", alias="POLYSIGNAL_ENV")
    api_host: str = Field(default="0.0.0.0", alias="POLYSIGNAL_API_HOST")
    api_port: int = Field(default=8000, alias="POLYSIGNAL_API_PORT")
    database_url: str = Field(
        default="postgresql+psycopg://postgres:postgres@localhost:5432/polysignal",
        alias="POLYSIGNAL_DATABASE_URL",
    )
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"],
        alias="POLYSIGNAL_CORS_ORIGINS",
    )
    polymarket_base_url: str = Field(
        default="https://gamma-api.polymarket.com",
        alias="POLYSIGNAL_POLYMARKET_BASE_URL",
    )
    polymarket_timeout_seconds: float = Field(
        default=20.0,
        alias="POLYSIGNAL_POLYMARKET_TIMEOUT_SECONDS",
    )
    polymarket_page_limit: int = Field(
        default=100,
        alias="POLYSIGNAL_POLYMARKET_PAGE_LIMIT",
    )
    polymarket_clob_base_url: str = Field(
        default="https://clob.polymarket.com",
        alias="POLYSIGNAL_CLOB_BASE_URL",
    )
    polymarket_clob_timeout_seconds: float = Field(
        default=20.0,
        alias="POLYSIGNAL_CLOB_TIMEOUT_SECONDS",
    )
    polymarket_user_agent: str = Field(
        default="PolySignal/0.1",
        alias="POLYSIGNAL_POLYMARKET_USER_AGENT",
    )
    mvp_discovery_scope: str = Field(
        default="nba",
        alias="POLYSIGNAL_MVP_DISCOVERY_SCOPE",
    )
    polymarket_sports_tag_id: str = Field(
        default="1",
        alias="POLYSIGNAL_POLYMARKET_SPORTS_TAG_ID",
    )
    polymarket_nba_tag_id: str = Field(
        default="745",
        alias="POLYSIGNAL_POLYMARKET_NBA_TAG_ID",
    )
    snapshot_batch_size: int = Field(
        default=50,
        alias="POLYSIGNAL_SNAPSHOT_BATCH_SIZE",
    )
    snapshot_history_default_limit: int = Field(
        default=10,
        alias="POLYSIGNAL_SNAPSHOT_HISTORY_DEFAULT_LIMIT",
    )
    snapshot_history_max_limit: int = Field(
        default=100,
        alias="POLYSIGNAL_SNAPSHOT_HISTORY_MAX_LIMIT",
    )
    odds_api_key: str | None = Field(
        default=None,
        alias="ODDS_API_KEY",
    )
    odds_api_base_url: str = Field(
        default="https://api.the-odds-api.com",
        alias="POLYSIGNAL_ODDS_API_BASE_URL",
    )
    odds_api_timeout_seconds: float = Field(
        default=20.0,
        alias="POLYSIGNAL_ODDS_API_TIMEOUT_SECONDS",
    )
    odds_api_regions: str = Field(
        default="us",
        alias="POLYSIGNAL_ODDS_API_REGIONS",
    )
    odds_api_markets: str = Field(
        default="h2h",
        alias="POLYSIGNAL_ODDS_API_MARKETS",
    )
    odds_high_contradiction_delta: float = Field(
        default=0.10,
        alias="POLYSIGNAL_ODDS_HIGH_CONTRADICTION_DELTA",
    )
    espn_nba_rss_url: str = Field(
        default="https://www.espn.com/espn/rss/nba/news",
        alias="POLYSIGNAL_ESPN_NBA_RSS_URL",
    )
    espn_rss_timeout_seconds: float = Field(
        default=20.0,
        alias="POLYSIGNAL_ESPN_RSS_TIMEOUT_SECONDS",
    )
    evidence_news_summary_max_length: int = Field(
        default=280,
        alias="POLYSIGNAL_EVIDENCE_NEWS_SUMMARY_MAX_LENGTH",
    )
    scoring_model_version: str = Field(
        default="scoring_v1",
        alias="POLYSIGNAL_SCORING_MODEL_VERSION",
    )
    scoring_odds_window_hours: int = Field(
        default=24,
        alias="POLYSIGNAL_SCORING_ODDS_WINDOW_HOURS",
    )
    scoring_news_window_hours: int = Field(
        default=48,
        alias="POLYSIGNAL_SCORING_NEWS_WINDOW_HOURS",
    )
    scoring_freshness_window_hours: int = Field(
        default=24,
        alias="POLYSIGNAL_SCORING_FRESHNESS_WINDOW_HOURS",
    )
    scoring_low_liquidity_threshold: float = Field(
        default=50000.0,
        alias="POLYSIGNAL_SCORING_LOW_LIQUIDITY_THRESHOLD",
    )

    model_config = SettingsConfigDict(
        env_file=(API_DIR / ".env", REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("mvp_discovery_scope", mode="before")
    @classmethod
    def parse_mvp_discovery_scope(cls, value: object) -> str:
        if not isinstance(value, str):
            raise TypeError("POLYSIGNAL_MVP_DISCOVERY_SCOPE debe ser un string.")
        scope = value.strip().lower()
        if scope not in {"nba", "sports", "all"}:
            raise ValueError(
                "POLYSIGNAL_MVP_DISCOVERY_SCOPE debe ser uno de: nba, sports, all."
            )
        return scope


@lru_cache
def get_settings() -> Settings:
    return Settings()
