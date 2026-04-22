from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from time import perf_counter

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.repositories.markets import get_market_by_id
from app.services.scoring import score_market


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Calcula y persiste scoring v1 para un market_id especifico."
    )
    parser.add_argument("--market-id", type=int, required=True, help="ID interno del mercado.")
    args = parser.parse_args()

    settings = get_settings()
    started_at = datetime.now(tz=UTC)
    started_perf = perf_counter()

    try:
        with SessionLocal() as db:
            market = get_market_by_id(db, args.market_id)
            if market is None:
                raise ValueError(f"Market {args.market_id} no encontrado.")

            result = score_market(
                db,
                market=market,
                settings=settings,
                run_at=started_at,
            )
            db.commit()
            if result.prediction is None:
                command_payload = {
                    "status": "warning",
                    "started_at": started_at.isoformat(),
                    "market_id": args.market_id,
                    "partial_errors": result.partial_errors,
                    "used_odds_count": result.used_odds_count,
                    "used_news_count": result.used_news_count,
                }
            else:
                command_payload = {
                    "status": "warning" if result.partial_errors else "ok",
                    "started_at": started_at.isoformat(),
                    "market_id": args.market_id,
                    "prediction_id": result.prediction.id,
                    "model_version": result.prediction.model_version,
                    "yes_probability": str(result.prediction.yes_probability),
                    "no_probability": str(result.prediction.no_probability),
                    "confidence_score": str(result.prediction.confidence_score),
                    "edge_signed": str(result.prediction.edge_signed),
                    "edge_magnitude": str(result.prediction.edge_magnitude),
                    "edge_class": result.prediction.edge_class,
                    "opportunity": result.prediction.opportunity,
                    "review_confidence": result.prediction.review_confidence,
                    "review_edge": result.prediction.review_edge,
                    "used_odds_count": result.used_odds_count,
                    "used_news_count": result.used_news_count,
                    "partial_errors": result.partial_errors,
                    "explanation_json": result.prediction.explanation_json,
                }
    except Exception as exc:
        finished_at = datetime.now(tz=UTC)
        payload = {
            "status": "error",
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": round(perf_counter() - started_perf, 3),
            "market_id": args.market_id,
            "error_type": type(exc).__name__,
            "error": str(exc),
        }
        print(json.dumps(payload, indent=2, ensure_ascii=True), file=sys.stderr)
        raise SystemExit(1) from exc

    finished_at = datetime.now(tz=UTC)
    payload = {
        **command_payload,
        "finished_at": finished_at.isoformat(),
        "duration_seconds": round(perf_counter() - started_perf, 3),
    }
    print(json.dumps(payload, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
