from __future__ import annotations

from app.core.config import Settings


def test_settings_parse_cors_origins_from_csv(monkeypatch) -> None:
    monkeypatch.setenv("POLYSIGNAL_CORS_ORIGINS", "http://localhost:3000,http://localhost:3001")

    settings = Settings()

    assert settings.cors_origins == [
        "http://localhost:3000",
        "http://localhost:3001",
    ]

