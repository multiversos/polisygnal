from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.commands.check_supabase_config import (
    _masked_database_url,
    _redact_database_error,
)
from app.core.config import Settings


def test_database_url_alias_priority_prefers_database_url() -> None:
    settings = Settings(
        _env_file=None,
        DATABASE_URL="sqlite+pysqlite:///priority-database-url.db",
        POLYSIGNAL_DATABASE_URL="sqlite+pysqlite:///priority-polysignal-url.db",
        SUPABASE_DATABASE_URL="sqlite+pysqlite:///priority-supabase-url.db",
    )

    assert settings.database_url == "sqlite+pysqlite:///priority-database-url.db"


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
