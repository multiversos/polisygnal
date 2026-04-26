from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.db.session import SessionLocal
from app.services.research.codex_agent_adapter import (
    DEFAULT_RESPONSE_DIR,
    ingest_codex_agent_research_response,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingesta una response JSON producida por Codex Agent research."
    )
    parser.add_argument("--run-id", type=int, required=True, help="ID del research_run.")
    parser.add_argument(
        "--response-path",
        default=None,
        help="Ruta opcional al response JSON. Default: logs/research-agent/responses/{run_id}.json",
    )
    args = parser.parse_args()
    response_path = (
        Path(args.response_path)
        if args.response_path is not None
        else DEFAULT_RESPONSE_DIR / f"{args.run_id}.json"
    )

    with SessionLocal() as db:
        result = ingest_codex_agent_research_response(
            db,
            run_id=args.run_id,
            response_path=response_path,
        )
        db.commit()
        payload = {
            "status": "ok" if result.ok else "error",
            "research_run_id": result.research_run.id,
            "research_status": result.research_run.status,
            "market_id": result.research_run.market_id,
            "response_path": str(result.response_path),
            "prediction_id": result.prediction.id if result.prediction is not None else None,
            "prediction_family": (
                result.prediction.prediction_family if result.prediction is not None else None
            ),
            "report_id": result.report.id if result.report is not None else None,
            "findings_created": len(result.findings),
            "error_message": result.error_message,
        }

    print(json.dumps(payload, indent=2, ensure_ascii=True))
    if not result.ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
