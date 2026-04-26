from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import AliasChoices, Field, field_validator
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
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"],
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
    kalshi_base_url: str = Field(
        default="https://api.elections.kalshi.com/trade-api/v2",
        alias="POLYSIGNAL_KALSHI_BASE_URL",
    )
    kalshi_timeout_seconds: float = Field(
        default=20.0,
        alias="POLYSIGNAL_KALSHI_TIMEOUT_SECONDS",
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
    openai_api_key: str | None = Field(
        default=None,
        alias="OPENAI_API_KEY",
    )
    openai_base_url: str = Field(
        default="https://api.openai.com/v1",
        alias="POLYSIGNAL_OPENAI_BASE_URL",
    )
    openai_research_enabled: bool = Field(
        default=True,
        alias="OPENAI_RESEARCH_ENABLED",
    )
    openai_research_model: str = Field(
        default="gpt-5-mini",
        validation_alias=AliasChoices("OPENAI_RESEARCH_MODEL", "POLYSIGNAL_RESEARCH_CHEAP_MODEL"),
    )
    openai_research_timeout_seconds: float = Field(
        default=45.0,
        validation_alias=AliasChoices(
            "OPENAI_RESEARCH_TIMEOUT_SECONDS",
            "POLYSIGNAL_RESEARCH_TIMEOUT_SECONDS",
        ),
    )
    openai_research_max_sources: int = Field(
        default=6,
        alias="OPENAI_RESEARCH_MAX_SOURCES",
    )
    openai_research_allowed_domains: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        alias="OPENAI_RESEARCH_ALLOWED_DOMAINS",
    )
    openai_research_blocked_domains: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        alias="OPENAI_RESEARCH_BLOCKED_DOMAINS",
    )
    linear_api_url: str = Field(
        default="https://api.linear.app/graphql",
        alias="POLYSIGNAL_LINEAR_API_URL",
    )
    linear_api_key: str | None = Field(
        default=None,
        alias="LINEAR_API_KEY",
    )
    linear_oauth_authorize_url: str = Field(
        default="https://linear.app/oauth/authorize",
        alias="POLYSIGNAL_LINEAR_OAUTH_AUTHORIZE_URL",
    )
    linear_oauth_token_url: str = Field(
        default="https://api.linear.app/oauth/token",
        alias="POLYSIGNAL_LINEAR_OAUTH_TOKEN_URL",
    )
    linear_oauth_client_id: str | None = Field(
        default=None,
        alias="LINEAR_OAUTH_CLIENT_ID",
    )
    linear_oauth_client_secret: str | None = Field(
        default=None,
        alias="LINEAR_OAUTH_CLIENT_SECRET",
    )
    linear_oauth_redirect_uri: str = Field(
        default="http://127.0.0.1:8765/callback",
        alias="POLYSIGNAL_LINEAR_OAUTH_REDIRECT_URI",
    )
    linear_oauth_scopes: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["read", "write"],
        alias="POLYSIGNAL_LINEAR_OAUTH_SCOPES",
    )
    linear_oauth_actor: str = Field(
        default="user",
        alias="POLYSIGNAL_LINEAR_OAUTH_ACTOR",
    )
    linear_oauth_credentials_path: str = Field(
        default=".linear/oauth-credentials.json",
        alias="POLYSIGNAL_LINEAR_OAUTH_CREDENTIALS_PATH",
    )
    linear_team_id: str | None = Field(
        default=None,
        alias="LINEAR_TEAM_ID",
    )
    linear_project_id: str | None = Field(
        default=None,
        alias="LINEAR_PROJECT_ID",
    )
    linear_sync_source_path: str = Field(
        default="docs/linear-project-board.json",
        alias="POLYSIGNAL_LINEAR_SYNC_SOURCE_PATH",
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

    @field_validator("linear_oauth_scopes", mode="before")
    @classmethod
    def parse_linear_oauth_scopes(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator(
        "openai_research_allowed_domains",
        "openai_research_blocked_domains",
        mode="before",
    )
    @classmethod
    def parse_openai_research_domains(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip().lower() for item in value.split(",") if item.strip()]
        return value

    @field_validator("openai_research_max_sources", mode="before")
    @classmethod
    def parse_openai_research_max_sources(cls, value: object) -> object:
        if value is None:
            return value
        parsed = int(value)
        if parsed < 1:
            raise ValueError("OPENAI_RESEARCH_MAX_SOURCES debe ser al menos 1.")
        return parsed

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

    @field_validator("linear_oauth_actor", mode="before")
    @classmethod
    def parse_linear_oauth_actor(cls, value: object) -> str:
        if not isinstance(value, str):
            raise TypeError("POLYSIGNAL_LINEAR_OAUTH_ACTOR debe ser un string.")
        actor = value.strip().lower()
        if actor not in {"user", "app"}:
            raise ValueError(
                "POLYSIGNAL_LINEAR_OAUTH_ACTOR debe ser uno de: user, app."
            )
        return actor

    @property
    def research_timeout_seconds(self) -> float:
        return self.openai_research_timeout_seconds

    @property
    def research_cheap_model(self) -> str:
        return self.openai_research_model


@lru_cache
def get_settings() -> Settings:
    return Settings()
