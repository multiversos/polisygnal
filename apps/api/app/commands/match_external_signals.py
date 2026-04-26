from __future__ import annotations

import argparse
import json
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.external_market_signal import ExternalMarketSignal
from app.services.external_market_signal_matching import (
    MATCH_LINK_THRESHOLD,
    ExternalSignalMatchCandidate,
    action_for_match,
    apply_external_signal_match,
    find_external_signal_match_candidates,
    list_match_candidate_markets,
    list_unlinked_external_signals,
)


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.apply and args.dry_run:
        parser.error("--apply no puede combinarse con --dry-run.")
    min_confidence = _parse_confidence(args.min_confidence, parser)

    db = SessionLocal()
    try:
        payload = _run(args, db, min_confidence=min_confidence)
        if args.apply:
            db.commit()
        else:
            db.rollback()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=True))
    else:
        _print_human(payload)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Propone o aplica vinculos conservadores entre senales externas y mercados Polymarket."
    )
    parser.add_argument("--source", type=str, default="kalshi", help="Fuente externa a evaluar.")
    parser.add_argument("--limit", type=int, default=10, help="Cantidad maxima de senales a evaluar.")
    parser.add_argument(
        "--min-confidence",
        type=str,
        default=str(MATCH_LINK_THRESHOLD),
        help="Threshold minimo para aplicar vinculos.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Modo solo lectura. Es el comportamiento por defecto si no se usa --apply.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Aplica vinculos solo si superan --min-confidence.",
    )
    parser.add_argument("--signal-id", type=int, default=None, help="Evalua una senal especifica.")
    parser.add_argument("--market-id", type=int, default=None, help="Evalua contra un mercado especifico.")
    parser.add_argument("--json", action="store_true", help="Imprime JSON.")
    return parser


def _run(
    args: argparse.Namespace,
    db: Session,
    *,
    min_confidence: Decimal,
) -> dict[str, Any]:
    dry_run = not args.apply
    signals = list_unlinked_external_signals(
        db,
        source=args.source,
        limit=args.limit,
        signal_id=args.signal_id,
    )
    markets = list_match_candidate_markets(db, market_id=args.market_id)
    results: list[dict[str, Any]] = []
    links_applied = 0

    for signal in signals:
        candidates = find_external_signal_match_candidates(signal, markets, limit=5)
        best = candidates[0] if candidates else None
        result = _serialize_signal_result(
            signal=signal,
            best=best,
            candidates=candidates,
            min_confidence=min_confidence,
            dry_run=dry_run,
        )
        if args.apply and best is not None:
            action = action_for_match(
                best.estimate.match_confidence,
                min_confidence=min_confidence,
            )
            if action == "would_link" and signal.polymarket_market_id is None:
                apply_external_signal_match(db, signal=signal, candidate=best)
                result["action"] = "linked"
                result["linked_market_id"] = best.market.id
                links_applied += 1
        results.append(result)

    return {
        "status": "ok",
        "dry_run": dry_run,
        "apply_enabled": args.apply,
        "read_only": dry_run,
        "source": args.source,
        "limit": args.limit,
        "min_confidence": str(min_confidence),
        "signals_considered": len(signals),
        "candidate_markets_considered": len(markets),
        "links_applied": links_applied,
        "predictions_created": 0,
        "research_runs_created": 0,
        "trading_executed": False,
        "results": results,
    }


def _serialize_signal_result(
    *,
    signal: ExternalMarketSignal,
    best: ExternalSignalMatchCandidate | None,
    candidates: list[ExternalSignalMatchCandidate],
    min_confidence: Decimal,
    dry_run: bool,
) -> dict[str, Any]:
    confidence = best.estimate.match_confidence if best is not None else None
    action = action_for_match(confidence, min_confidence=min_confidence)
    if action == "would_link" and not dry_run:
        action = "linked"
    if signal.polymarket_market_id is not None:
        action = "already_linked"

    return {
        "signal_id": signal.id,
        "source": signal.source,
        "source_ticker": signal.source_ticker,
        "signal_title": signal.title,
        "proposed_market_id": best.market.id if best is not None else None,
        "market_question": best.market.question if best is not None else None,
        "match_confidence": str(confidence) if confidence is not None else None,
        "match_reason": best.estimate.match_reason if best is not None else None,
        "warnings": best.estimate.warnings if best is not None else ["no_candidate_market"],
        "action": action,
        "top_matches": [_serialize_candidate(candidate) for candidate in candidates],
    }


def _serialize_candidate(candidate: ExternalSignalMatchCandidate) -> dict[str, Any]:
    market = candidate.market
    estimate = candidate.estimate
    return {
        "market_id": market.id,
        "market_question": market.question,
        "sport_type": market.sport_type,
        "market_type": market.market_type,
        "match_confidence": str(estimate.match_confidence),
        "match_reason": estimate.match_reason,
        "warnings": estimate.warnings,
    }


def _parse_confidence(value: str, parser: argparse.ArgumentParser) -> Decimal:
    try:
        parsed = Decimal(value)
    except InvalidOperation:
        parser.error("--min-confidence debe ser un decimal entre 0 y 1.")
    if parsed < Decimal("0") or parsed > Decimal("1"):
        parser.error("--min-confidence debe estar entre 0 y 1.")
    return parsed


def _print_human(payload: dict[str, Any]) -> None:
    if payload["dry_run"]:
        print("DRY RUN / READ ONLY - no se aplican vinculos.")
    else:
        print("APPLY ENABLED - solo se vinculan matches sobre el threshold.")
    print(f"Source: {payload['source']}")
    print(f"Signals considered: {payload['signals_considered']}")
    print(f"Links applied: {payload['links_applied']}")
    print(f"Predictions created: {payload['predictions_created']}")
    print(f"Research runs created: {payload['research_runs_created']}")
    print(f"Trading executed: {payload['trading_executed']}")
    for result in payload["results"]:
        print(
            "\n"
            f"Signal #{result['signal_id']} -> market {result['proposed_market_id']} "
            f"confidence={result['match_confidence']} action={result['action']}"
        )
        print(f"  title: {result['signal_title']}")
        print(f"  market: {result['market_question']}")
        print(f"  reason: {result['match_reason']}")
        if result["warnings"]:
            print(f"  warnings: {', '.join(result['warnings'])}")


if __name__ == "__main__":
    main()
