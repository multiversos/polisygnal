from __future__ import annotations

from app.commands.check_database_config import (
    DATABASE_ENV_NAMES,
    _masked_database_url,
    _redact_database_error,
    build_report,
    main,
)


if __name__ == "__main__":
    main()
