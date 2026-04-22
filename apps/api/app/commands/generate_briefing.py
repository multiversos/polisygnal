from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from app.core.config import REPO_ROOT
from app.db.session import SessionLocal
from app.services.briefing import build_operational_briefing, render_operational_briefing_text

ActiveFilter = Literal["true", "false", "any"]
OutputFormat = Literal["json", "txt", "both"]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Genera un briefing operativo compacto para el subset del MVP."
    )
    parser.add_argument("--sport-type", type=str, default="nba")
    parser.add_argument("--market-type", type=str, default="winner")
    parser.add_argument(
        "--active",
        choices=["true", "false", "any"],
        default="true",
        help="Filtro por estado activo. Default: true.",
    )
    parser.add_argument("--top-limit", type=int, default=5)
    parser.add_argument("--watchlist-limit", type=int, default=5)
    parser.add_argument("--review-limit", type=int, default=5)
    parser.add_argument(
        "--format",
        choices=["json", "txt", "both"],
        default="both",
        help="Formato de salida de archivos.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=str(REPO_ROOT / "logs" / "briefings"),
        help="Directorio donde se escriben los archivos latest/timestamped.",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir).expanduser()
    active = _parse_active_filter(args.active)

    try:
        with SessionLocal() as db:
            briefing = build_operational_briefing(
                db,
                sport_type=args.sport_type,
                market_type=args.market_type,
                active=active,
                top_limit=args.top_limit,
                watchlist_limit=args.watchlist_limit,
                review_limit=args.review_limit,
            )
    except Exception as exc:
        print(
            json.dumps(
                {
                    "status": "error",
                    "error_type": type(exc).__name__,
                    "error": str(exc),
                },
                indent=2,
                ensure_ascii=True,
            ),
            file=sys.stderr,
        )
        raise SystemExit(1) from exc

    run_started_at = datetime.now(tz=UTC)
    run_id = run_started_at.strftime("%Y%m%d_%H%M%S")
    output_dir.mkdir(parents=True, exist_ok=True)

    briefing_payload = briefing.model_dump(mode="json")
    json_output_path: Path | None = None
    latest_json_path: Path | None = None
    text_output_path: Path | None = None
    latest_text_path: Path | None = None

    if args.format in {"json", "both"}:
        json_content = json.dumps(briefing_payload, indent=2, ensure_ascii=True)
        json_output_path = output_dir / f"{run_id}.briefing.json"
        latest_json_path = output_dir / "latest-briefing.json"
        json_output_path.write_text(json_content, encoding="utf-8")
        latest_json_path.write_text(json_content, encoding="utf-8")

    if args.format in {"txt", "both"}:
        text_content = render_operational_briefing_text(briefing)
        text_output_path = output_dir / f"{run_id}.briefing.txt"
        latest_text_path = output_dir / "latest-briefing.txt"
        text_output_path.write_text(text_content, encoding="utf-8")
        latest_text_path.write_text(text_content, encoding="utf-8")

    summary = {
        "status": "ok",
        "generated_at": briefing.generated_at.isoformat(),
        "summary": briefing.summary,
        "format": args.format,
        "output_dir": str(output_dir),
        "json_output_path": str(json_output_path) if json_output_path is not None else None,
        "latest_json_path": str(latest_json_path) if latest_json_path is not None else None,
        "text_output_path": str(text_output_path) if text_output_path is not None else None,
        "latest_text_path": str(latest_text_path) if latest_text_path is not None else None,
        "top_opportunities_count": len(briefing.top_opportunities),
        "watchlist_count": len(briefing.watchlist),
        "review_flags_count": len(briefing.review_flags),
        "total_markets": briefing.operational_counts.total_markets,
    }
    print(json.dumps(summary, indent=2, ensure_ascii=True))


def _parse_active_filter(value: ActiveFilter) -> bool | None:
    if value == "true":
        return True
    if value == "false":
        return False
    return None


if __name__ == "__main__":
    main()
