from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.market import Market
from app.repositories.markets import get_market_by_id
from app.services.research.codex_agent_adapter import (
    DEFAULT_REQUEST_DIR,
    prepare_codex_agent_research_request,
)
from app.services.research.candidate_selector import ResearchCandidate, list_research_candidates


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepara un request JSON para research externo con Codex Agent."
    )
    parser.add_argument("--market-id", type=int, default=None, help="ID interno del mercado.")
    parser.add_argument(
        "--auto-select",
        action="store_true",
        help="Selecciona el mejor candidato sin ejecutar research.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Cantidad maxima de candidatos a evaluar cuando se usa --auto-select.",
    )
    parser.add_argument("--vertical", default=None, help="Filtro opcional de vertical.")
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
    if args.market_id is None and not args.auto_select:
        parser.error("usa --market-id o --auto-select.")

    try:
        with SessionLocal() as db:
            market, selected_candidate = _resolve_market_for_prepare(
                db,
                market_id=args.market_id,
                auto_select=args.auto_select,
                vertical=args.vertical,
                sport=args.sport,
                market_shape=args.market_shape,
                limit=args.limit,
            )
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
                "auto_selected": selected_candidate is not None,
                "selected_candidate": (
                    selected_candidate.to_payload() if selected_candidate is not None else None
                ),
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


def _resolve_market_for_prepare(
    db: Session,
    *,
    market_id: int | None,
    auto_select: bool,
    vertical: str | None,
    sport: str | None,
    market_shape: str | None,
    limit: int,
) -> tuple[Market, ResearchCandidate | None]:
    if market_id is not None:
        market = get_market_by_id(db, market_id)
        if market is None:
            raise ValueError(f"Market {market_id} no encontrado.")
        return market, None

    if not auto_select:
        raise ValueError("Debe indicarse --market-id o --auto-select.")

    candidates = list_research_candidates(
        db,
        limit=max(limit, 1),
        vertical=vertical,
        sport=sport,
        market_shape=market_shape,
    )
    if not candidates:
        raise ValueError("No se encontraron candidatos para prepare_codex_research.")

    selected_candidate = candidates[0]
    market = get_market_by_id(db, selected_candidate.market_id)
    if market is None:
        raise ValueError(f"Market {selected_candidate.market_id} no encontrado.")
    return market, selected_candidate


if __name__ == "__main__":
    main()
