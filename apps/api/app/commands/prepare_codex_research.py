from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.db.session import SessionLocal
from app.repositories.markets import get_market_by_id
from app.services.research.codex_agent_adapter import (
    DEFAULT_REQUEST_DIR,
    prepare_codex_agent_research_request,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepara un request JSON para research externo con Codex Agent."
    )
    parser.add_argument("--market-id", type=int, required=True, help="ID interno del mercado.")
    parser.add_argument("--sport", default=None, help="Override opcional de deporte.")
    parser.add_argument(
        "--market-shape",
        default=None,
        help="Override opcional del market shape.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_REQUEST_DIR),
        help="Directorio donde se escribira {run_id}.json.",
    )
    args = parser.parse_args()

    try:
        with SessionLocal() as db:
            market = get_market_by_id(db, args.market_id)
            if market is None:
                raise ValueError(f"Market {args.market_id} no encontrado.")
            prepared = prepare_codex_agent_research_request(
                db,
                market=market,
                output_dir=Path(args.output_dir),
                sport_override=args.sport,
                market_shape_override=args.market_shape,
            )
            db.commit()
            payload = {
                "status": "ok",
                "research_run_id": prepared.research_run.id,
                "market_id": market.id,
                "research_mode": prepared.research_run.research_mode,
                "research_status": prepared.research_run.status,
                "vertical": prepared.request_payload.vertical,
                "sport": prepared.request_payload.sport,
                "market_shape": prepared.request_payload.market_shape,
                "research_template_name": prepared.request_payload.research_template_name,
                "classification_reason": prepared.request_payload.classification_reason,
                "request_path": str(prepared.request_path),
                "response_path_expected": str(
                    prepared.request_path.parents[1]
                    / "responses"
                    / f"{prepared.research_run.id}.json"
                ),
                "codex_prompt": prepared.prompt,
            }
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

    print(json.dumps(payload, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
