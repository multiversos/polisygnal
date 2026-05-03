from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.commands.check_database_config import (
    _masked_database_url,
    _redact_database_error,
    build_report,
)
from app.core.config import Settings, get_settings


def test_database_url_alias_priority_prefers_database_url() -> None:
    settings = Settings(
        _env_file=None,
        DATABASE_URL="sqlite+pysqlite:///priority-database-url.db",
        NEON_DATABASE_URL="sqlite+pysqlite:///priority-neon-url.db",
        POLYSIGNAL_DATABASE_URL="sqlite+pysqlite:///priority-polysignal-url.db",
        SUPABASE_DATABASE_URL="sqlite+pysqlite:///priority-supabase-url.db",
    )

    assert settings.database_url == "sqlite+pysqlite:///priority-database-url.db"


def test_alembic_database_url_prefers_database_migration_url() -> None:
    settings = Settings(
        _env_file=None,
        DATABASE_URL="sqlite+pysqlite:///runtime.db",
        DATABASE_MIGRATION_URL="sqlite+pysqlite:///migration.db",
        NEON_DATABASE_DIRECT_URL="sqlite+pysqlite:///neon-direct.db",
    )

    assert settings.database_url == "sqlite+pysqlite:///runtime.db"
    assert settings.alembic_database_url == "sqlite+pysqlite:///migration.db"


def test_alembic_database_url_accepts_neon_direct_alias() -> None:
    settings = Settings(
        _env_file=None,
        DATABASE_URL=(
            "postgresql://neondb_owner:password@"
            "ep-cool-darkness-123456-pooler.us-east-2.aws.neon.tech/neondb"
            "?sslmode=require&channel_binding=require"
        ),
        NEON_DATABASE_DIRECT_URL=(
            "postgresql://neondb_owner:password@"
            "ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb"
            "?sslmode=require&channel_binding=require"
        ),
    )

    assert "-pooler." in settings.database_url
    assert "-pooler." not in settings.alembic_database_url


def test_alembic_database_url_falls_back_to_runtime_database_url() -> None:
    settings = Settings(
        _env_file=None,
        DATABASE_URL="sqlite+pysqlite:///runtime.db",
    )

    assert settings.alembic_database_url == settings.database_url


def test_database_url_accepts_neon_alias() -> None:
    settings = Settings(
        _env_file=None,
        NEON_DATABASE_URL=(
            "postgresql://neondb_owner:password@"
            "ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb"
            "?sslmode=require&channel_binding=require"
        ),
    )

    assert settings.database_url.startswith("postgresql://")
    assert "neon.tech" in settings.database_url


def test_database_url_accepts_supabase_alias() -> None:
    settings = Settings(
        _env_file=None,
        SUPABASE_DATABASE_URL=(
            "postgresql+psycopg://postgres.project:password@"
            "aws-0-us-east-1.pooler.supabase.com:6543/postgres"
        ),
    )

    assert settings.database_url.startswith("postgresql+psycopg://")
    assert "pooler.supabase.com" in settings.database_url


def test_database_url_rejects_empty_values() -> None:
    with pytest.raises(ValidationError, match="DATABASE_URL"):
        Settings(_env_file=None, DATABASE_URL="")


def test_masked_database_url_hides_password() -> None:
    masked = _masked_database_url(
        "postgresql+psycopg://postgres.project:secret@"
        "aws-0-us-east-1.pooler.supabase.com:6543/postgres"
    )

    assert "secret" not in masked
    assert "***" in masked
    assert "pooler.supabase.com" in masked


def test_database_error_redaction_hides_password_and_full_url() -> None:
    url = (
        "postgresql+psycopg://postgres.project:secret@"
        "aws-0-us-east-1.pooler.supabase.com:6543/postgres"
    )
    redacted = _redact_database_error(f"could not connect using {url}", url)

    assert "secret" not in redacted
    assert url not in redacted
    assert "***" in redacted


def test_database_report_identifies_neon(monkeypatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://neondb_owner:secret@"
        "ep-cool-darkness-123456-pooler.us-east-2.aws.neon.tech/neondb"
        "?sslmode=require&channel_binding=require",
    )

    report = build_report(connect=False)

    assert report["database_env_name"] == "DATABASE_URL"
    assert report["looks_like_neon"] is True
    assert report["looks_like_neon_pooler"] is True
    assert report["looks_like_neon_direct"] is False
    assert report["sslmode_present"] is True
    assert report["channel_binding_present"] is True
    assert report["runtime"]["looks_like_neon_pooler"] is True
    assert report["migration"]["looks_like_neon_pooler"] is True
    assert report["migration_uses_runtime_database_url"] is True
    assert "secret" not in str(report)
    get_settings.cache_clear()


def test_database_report_identifies_direct_migration_url(monkeypatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://neondb_owner:runtime-secret@"
        "ep-cool-darkness-123456-pooler.us-east-2.aws.neon.tech/neondb"
        "?sslmode=require&channel_binding=require",
    )
    monkeypatch.setenv(
        "DATABASE_MIGRATION_URL",
        "postgresql://neondb_owner:migration-secret@"
        "ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb"
        "?sslmode=require&channel_binding=require",
    )

    report = build_report(connect=False)

    assert report["runtime"]["database_env_name"] == "DATABASE_URL"
    assert report["runtime"]["looks_like_neon_pooler"] is True
    assert report["migration"]["database_env_name"] == "DATABASE_MIGRATION_URL"
    assert report["migration"]["looks_like_neon_direct"] is True
    assert report["migration"]["looks_like_neon_pooler"] is False
    assert report["migration_uses_runtime_database_url"] is False
    assert "runtime-secret" not in str(report)
    assert "migration-secret" not in str(report)
    get_settings.cache_clear()
