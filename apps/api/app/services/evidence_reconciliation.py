from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.evidence_item import EvidenceItem
from app.models.source import Source
from app.repositories.markets import list_nba_winner_evidence_candidates
from app.services.nba_team_matching import assess_market_for_evidence

MVP_EVIDENCE_PROVIDERS = ("the_odds_api", "espn_rss")


@dataclass(slots=True)
class EvidenceReconciliationSummary:
    apply: bool = False
    markets_considered: int = 0
    markets_eligible: int = 0
    markets_non_eligible: int = 0
    markets_skipped_non_matchable: int = 0
    markets_skipped_unsupported_shape: int = 0
    markets_with_legacy_evidence: int = 0
    markets_cleaned: int = 0
    sources_found: int = 0
    evidence_found: int = 0
    sources_deleted: int = 0
    evidence_deleted: int = 0
    cleaned_markets: list[dict[str, object]] = field(default_factory=list)
    partial_errors: list[str] = field(default_factory=list)


def reconcile_legacy_evidence(
    db: Session,
    *,
    apply: bool,
    limit: int | None = None,
) -> EvidenceReconciliationSummary:
    markets = list_nba_winner_evidence_candidates(db, limit=limit)
    summary = EvidenceReconciliationSummary(
        apply=apply,
        markets_considered=len(markets),
    )

    for market in markets:
        assessment = assess_market_for_evidence(market.question)
        if assessment.eligible:
            summary.markets_eligible += 1
            continue

        summary.markets_non_eligible += 1
        if assessment.shape == "futures":
            summary.markets_skipped_non_matchable += 1
        else:
            summary.markets_skipped_unsupported_shape += 1

        sources = list(
            db.scalars(
                select(Source).where(
                    Source.market_id == market.id,
                    Source.provider.in_(MVP_EVIDENCE_PROVIDERS),
                )
            ).all()
        )
        if not sources:
            continue

        evidence_items = list(
            db.scalars(
                select(EvidenceItem).where(
                    EvidenceItem.market_id == market.id,
                    EvidenceItem.provider.in_(MVP_EVIDENCE_PROVIDERS),
                )
            ).all()
        )

        source_count = len(sources)
        evidence_count = len(evidence_items)
        summary.markets_with_legacy_evidence += 1
        summary.sources_found += source_count
        summary.evidence_found += evidence_count
        summary.cleaned_markets.append(
            {
                "market_id": market.id,
                "question": market.question,
                "evidence_shape": assessment.shape,
                "evidence_skip_reason": assessment.skip_reason,
                "sources_found": source_count,
                "evidence_found": evidence_count,
            }
        )

        if not apply:
            continue

        try:
            with db.begin_nested():
                for evidence_item in evidence_items:
                    db.delete(evidence_item)
                for source in sources:
                    db.delete(source)
            summary.markets_cleaned += 1
            summary.sources_deleted += source_count
            summary.evidence_deleted += evidence_count
        except Exception as exc:
            summary.partial_errors.append(
                f"Market {market.id}: error limpiando evidencia legacy: {exc}"
            )

    if apply:
        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            summary.partial_errors.append(f"Error confirmando limpieza de evidencia legacy: {exc}")

    return summary
