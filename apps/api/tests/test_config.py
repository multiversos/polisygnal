from __future__ import annotations

from app.core.config import Settings


def test_settings_parse_cors_origins_from_csv(monkeypatch) -> None:
    monkeypatch.setenv("POLYSIGNAL_CORS_ORIGINS", "http://localhost:3000,http://localhost:3001")

    settings = Settings()

    assert settings.cors_origins == [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
    ]


def test_settings_keeps_localhost_and_loopback_cors_aliases_together(monkeypatch) -> None:
    monkeypatch.setenv("POLYSIGNAL_CORS_ORIGINS", "http://127.0.0.1:3000")

    settings = Settings()

    assert settings.cors_origins == [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ]


def test_settings_read_linear_env_vars(monkeypatch) -> None:
    monkeypatch.setenv("LINEAR_API_KEY", "linear-test-key")
    monkeypatch.setenv("LINEAR_OAUTH_CLIENT_ID", "oauth-client-id")
    monkeypatch.setenv("LINEAR_OAUTH_CLIENT_SECRET", "oauth-client-secret")
    monkeypatch.setenv("POLYSIGNAL_LINEAR_OAUTH_SCOPES", "read,write,issues:create")
    monkeypatch.setenv("POLYSIGNAL_LINEAR_OAUTH_ACTOR", "user")
    monkeypatch.setenv("LINEAR_TEAM_ID", "team-uuid")
    monkeypatch.setenv("LINEAR_PROJECT_ID", "project-uuid")
    monkeypatch.setenv("POLYSIGNAL_LINEAR_SYNC_SOURCE_PATH", "docs/custom-board.json")

    settings = Settings()

    assert settings.linear_api_key == "linear-test-key"
    assert settings.linear_oauth_client_id == "oauth-client-id"
    assert settings.linear_oauth_client_secret == "oauth-client-secret"
    assert settings.linear_oauth_scopes == ["read", "write", "issues:create"]
    assert settings.linear_oauth_actor == "user"
    assert settings.linear_team_id == "team-uuid"
    assert settings.linear_project_id == "project-uuid"
    assert settings.linear_sync_source_path == "docs/custom-board.json"


def test_settings_read_research_openai_env_vars(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "openai-test-key")
    monkeypatch.setenv("POLYSIGNAL_OPENAI_BASE_URL", "https://api.example.com/v1")
    monkeypatch.setenv("OPENAI_RESEARCH_ENABLED", "true")
    monkeypatch.setenv("OPENAI_RESEARCH_TIMEOUT_SECONDS", "12.5")
    monkeypatch.setenv("OPENAI_RESEARCH_MODEL", "gpt-test-mini")
    monkeypatch.setenv("OPENAI_RESEARCH_MAX_SOURCES", "4")
    monkeypatch.setenv("OPENAI_RESEARCH_ALLOWED_DOMAINS", "nba.com,espn.com")
    monkeypatch.setenv("OPENAI_RESEARCH_BLOCKED_DOMAINS", "example.com")

    settings = Settings()

    assert settings.openai_api_key == "openai-test-key"
    assert settings.openai_base_url == "https://api.example.com/v1"
    assert settings.openai_research_enabled is True
    assert settings.openai_research_timeout_seconds == 12.5
    assert settings.openai_research_model == "gpt-test-mini"
    assert settings.openai_research_max_sources == 4
    assert settings.openai_research_allowed_domains == ["nba.com", "espn.com"]
    assert settings.openai_research_blocked_domains == ["example.com"]
    assert settings.research_timeout_seconds == 12.5
    assert settings.research_cheap_model == "gpt-test-mini"
