from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Literal

from app.core.config import REPO_ROOT
from app.db.session import SessionLocal
from app.services.dashboard import (
    build_dashboard_artifact,
    render_dashboard_html,
    write_dashboard_html,
)

ActiveFilter = Literal["true", "false", "any"]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Genera un dashboard HTML estatico con la vista minima de consumo del MVP."
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
    parser.add_argument(
        "--output-dir",
        type=str,
        default=str(REPO_ROOT / "logs" / "dashboard"),
        help="Directorio donde se escriben los archivos latest/timestamped.",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir).expanduser()
    active = _parse_active_filter(args.active)

    try:
        with SessionLocal() as db:
            dashboard = build_dashboard_artifact(
                db,
                sport_type=args.sport_type,
                market_type=args.market_type,
                active=active,
                top_limit=args.top_limit,
                watchlist_limit=args.watchlist_limit,
                repo_root=REPO_ROOT,
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

    html = render_dashboard_html(dashboard)
    written_paths = write_dashboard_html(
        html,
        output_dir=output_dir,
        generated_at=dashboard.generated_at,
    )

    summary = {
        "status": "ok",
        "generated_at": dashboard.generated_at.isoformat(),
        "output_dir": str(output_dir),
        "html_output_path": written_paths["html_output_path"],
        "latest_html_path": written_paths["latest_html_path"],
        "overall_status": dashboard.overall_status,
        "total_top_opportunities": dashboard.total_top_opportunities,
        "top_opportunities_rendered": len(dashboard.top_opportunities),
        "total_watchlist": dashboard.total_watchlist,
        "watchlist_rendered": len(dashboard.watchlist),
        "evaluation": {
            "accuracy": dashboard.evaluation.accuracy,
            "opportunity_accuracy": dashboard.evaluation.opportunity_accuracy,
            "brier_score": dashboard.evaluation.brier_score,
            "evaluable": dashboard.evaluation.evaluable,
            "pending": dashboard.evaluation.pending,
        },
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
