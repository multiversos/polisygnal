from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import create_engine, text

from app.core.config import API_DIR, REPO_ROOT, get_settings

DATABASE_ENV_NAMES = (
    "DATABASE_URL",
    "NEON_DATABASE_URL",
    "POLYSIGNAL_DATABASE_URL",
    "SUPABASE_DATABASE_URL",
)
MIGRATION_DATABASE_ENV_NAMES = (
    "DATABASE_MIGRATION_URL",
    "NEON_DATABASE_DIRECT_URL",
)


def _read_dotenv_names(path: Path) -> set[str]:
    names: set[str] = set()
    if not path.exists():
        return names

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, _value = stripped.split("=", 1)
        names.add(name.strip())
    return names


def _configured_database_env_name() -> str | None:
    return _configured_env_name(DATABASE_ENV_NAMES)


def _configured_migration_database_env_name() -> str | None:
    return _configured_env_name(MIGRATION_DATABASE_ENV_NAMES)


def _configured_env_name(names: tuple[str, ...]) -> str | None:
    for name in names:
        if os.environ.get(name):
            return name

    dotenv_names = _read_dotenv_names(API_DIR / ".env") | _read_dotenv_names(REPO_ROOT / ".env")
    for name in names:
        if name in dotenv_names:
            return name

    return None


def _masked_database_url(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.netloc:
        return f"{parsed.scheme}:<local>"

    user = parsed.username or "<user>"
    host = parsed.hostname or "<host>"
    port = f":{parsed.port}" if parsed.port else ""
    database = parsed.path or ""
    query = "?..." if parsed.query else ""
    return f"{parsed.scheme}://{user}:***@{host}{port}{database}{query}"


def _redact_database_error(message: str, database_url: str) -> str:
    parsed = urlparse(database_url)
    redacted = message.replace(database_url, _masked_database_url(database_url))
    if parsed.password:
        redacted = redacted.replace(parsed.password, "***")
    if parsed.netloc:
        redacted = redacted.replace(parsed.netloc, "***@***")
    return redacted


def _database_name(path: str) -> str | None:
    name = path.lstrip("/")
    return name or None


def _has_query_flag(query: str, flag: str) -> bool:
    return any(part.lower().startswith(f"{flag.lower()}=") for part in query.split("&"))


def _looks_like_neon(host_lower: str) -> bool:
    return host_lower.endswith(".neon.tech")


def _looks_like_neon_pooler(host_lower: str) -> bool:
    return "-pooler." in host_lower and _looks_like_neon(host_lower)


def _build_url_report(*, url: str, env_name: str | None) -> dict[str, object]:
    parsed = urlparse(url)
    host = parsed.hostname
    host_lower = host.lower() if host else ""
    looks_like_neon = _looks_like_neon(host_lower)
    looks_like_neon_pooler = _looks_like_neon_pooler(host_lower)
    return {
        "database_env_name": env_name or "default",
        "database_url_masked": _masked_database_url(url),
        "scheme": parsed.scheme,
        "host": host,
        "port": parsed.port,
        "database": _database_name(parsed.path),
        "looks_like_neon": looks_like_neon,
        "looks_like_neon_pooler": looks_like_neon_pooler,
        "looks_like_neon_direct": looks_like_neon and not looks_like_neon_pooler,
        "looks_like_supabase": bool(host and "supabase" in host_lower),
        "looks_like_supabase_pooler": bool(host and "pooler.supabase.com" in host_lower),
        "sslmode_present": _has_query_flag(parsed.query, "sslmode"),
        "channel_binding_present": _has_query_flag(parsed.query, "channel_binding"),
    }


def build_report(connect: bool) -> dict[str, object]:
    settings = get_settings()
    runtime_report = _build_url_report(
        url=settings.database_url,
        env_name=_configured_database_env_name(),
    )
    migration_report = _build_url_report(
        url=settings.alembic_database_url,
        env_name=(
            _configured_migration_database_env_name()
            if settings.database_migration_url
            else _configured_database_env_name()
        ),
    )
    report: dict[str, object] = {
        **runtime_report,
        "runtime": runtime_report,
        "migration": migration_report,
        "migration_uses_runtime_database_url": settings.database_migration_url is None,
        "frontend_database_client_required": False,
        "frontend_expected_public_env": ["NEXT_PUBLIC_API_BASE_URL"],
        "backend_expected_private_env": ["DATABASE_URL"],
        "backend_optional_migration_env": [
            "DATABASE_MIGRATION_URL",
            "NEON_DATABASE_DIRECT_URL",
        ],
        "accepted_database_env_aliases": list(DATABASE_ENV_NAMES),
        "accepted_migration_database_env_aliases": list(MIGRATION_DATABASE_ENV_NAMES),
        "connection_checked": connect,
    }

    if not connect:
        report["connection_status"] = "not_checked"
        return report

    try:
        parsed = urlparse(settings.database_url)
        connect_args = (
            {"connect_timeout": 8} if parsed.scheme.startswith("postgresql") else {}
        )
        engine = create_engine(settings.database_url, future=True, connect_args=connect_args)
        with engine.connect() as connection:
            select_one = connection.execute(text("select 1")).scalar_one()
            current_database = connection.execute(text("select current_database()")).scalar_one()
        report["connection_status"] = "ok"
        report["select_1"] = select_one
        report["current_database"] = current_database
    except Exception as exc:  # pragma: no cover - depends on local network/db state.
        report["connection_status"] = "failed"
        report["error_type"] = type(exc).__name__
        report["error"] = _redact_database_error(
            str(exc).splitlines()[0],
            settings.database_url,
        )

    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate Postgres configuration without printing secrets."
    )
    parser.add_argument(
        "--connect",
        action="store_true",
        help="Run a read-only SELECT 1 check against the configured database.",
    )
    args = parser.parse_args()
    print(json.dumps(build_report(connect=args.connect), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
