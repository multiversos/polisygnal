from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.db.session import SessionLocal
from app.services.research.codex_agent_adapter import (
    DEFAULT_RESPONSE_DIR,
    DEFAULT_VALIDATION_DIR,
    ingest_codex_agent_research_response,
    validate_codex_agent_research_response_file,
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
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Valida el response JSON sin crear findings, report ni prediction.",
    )
    parser.add_argument(
        "--allow-review-required",
        action="store_true",
        help="Permite ingestar responses que el Quality Gate marco como review_required.",
    )
    parser.add_argument(
        "--validation-dir",
        default=str(DEFAULT_VALIDATION_DIR),
        help="Directorio donde se escribira logs/research-agent/validation/{run_id}.json.",
    )
    args = parser.parse_args()
    response_path = (
        Path(args.response_path)
        if args.response_path is not None
        else DEFAULT_RESPONSE_DIR / f"{args.run_id}.json"
    )

    with SessionLocal() as db:
        if args.dry_run:
            result = validate_codex_agent_research_response_file(
                db,
                run_id=args.run_id,
                response_path=response_path,
                validation_dir=Path(args.validation_dir),
            )
        else:
            result = ingest_codex_agent_research_response(
                db,
                run_id=args.run_id,
                response_path=response_path,
                allow_review_required=args.allow_review_required,
                validation_dir=Path(args.validation_dir),
            )
            db.commit()
        validation_report = (
            result.validation_report.to_payload()
            if result.validation_report is not None
            else None
        )
        payload = {
            "status": _status_from_result(result.ok, args.dry_run, validation_report),
            "dry_run": args.dry_run,
            "allow_review_required": args.allow_review_required,
            "research_run_id": result.research_run.id,
            "research_status": result.research_run.status,
            "market_id": result.research_run.market_id,
            "response_path": str(result.response_path),
            "validation_path": str(result.validation_path) if result.validation_path else None,
            "validation_report": validation_report,
            "prediction_id": result.prediction.id if result.prediction is not None else None,
            "prediction_family": (
                result.prediction.prediction_family if result.prediction is not None else None
            ),
            "report_id": result.report.id if result.report is not None else None,
            "findings_created": len(result.findings),
            "error_message": result.error_message,
        }

    print(json.dumps(payload, indent=2, ensure_ascii=True))
    if not args.dry_run and not result.ok:
        raise SystemExit(1)


def _status_from_result(
    ok: bool,
    dry_run: bool,
    validation_report: dict[str, object] | None,
) -> str:
    if not dry_run:
        return "ok" if ok else "error"
    action = (
        validation_report.get("recommended_action")
        if isinstance(validation_report, dict)
        else None
    )
    if action == "ingest":
        return "validation_pass"
    if action == "review_required":
        return "validation_review_required"
    return "validation_failed"


if __name__ == "__main__":
    main()
