from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.evidence_item import EvidenceItem
from app.models.event import Event
from app.models.market import Market
from app.models.source import Source
from app.services.evidence_reconciliation import reconcile_legacy_evidence


def test_reconcile_legacy_evidence_dry_run_and_apply(db_session: Session) -> None:
    event = Event(
        polymarket_event_id="event-reconcile-1",
        title="Evidence reconcile",
        category="sports",
        slug="evidence-reconcile",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    skipped_market = Market(
        polymarket_market_id="market-reconcile-1",
        event_id=event.id,
        question="Will the Sacramento Kings win the 2026 NBA Finals?",
        slug="will-the-sacramento-kings-win-the-2026-nba-finals-reconcile",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    eligible_market = Market(
        polymarket_market_id="market-reconcile-2",
        event_id=event.id,
        question="NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
        slug="nba-playoffs-who-will-win-series-knicks-vs-hawks-reconcile",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    db_session.add_all([skipped_market, eligible_market])
    db_session.flush()

    skipped_source = Source(
        market_id=skipped_market.id,
        provider="the_odds_api",
        source_type="odds",
        external_id="skipped-source",
        fetched_at=datetime(2026, 4, 21, 12, 0, tzinfo=UTC),
        raw_json={"id": "skipped-source"},
    )
    eligible_source = Source(
        market_id=eligible_market.id,
        provider="the_odds_api",
        source_type="odds",
        external_id="eligible-source",
        fetched_at=datetime(2026, 4, 21, 12, 0, tzinfo=UTC),
        raw_json={"id": "eligible-source"},
    )
    db_session.add_all([skipped_source, eligible_source])
    db_session.flush()

    db_session.add_all(
        [
            EvidenceItem(
                market_id=skipped_market.id,
                source_id=skipped_source.id,
                provider="the_odds_api",
                evidence_type="odds",
                stance="favor",
                strength=Decimal("0.7000"),
                confidence=Decimal("1.00"),
                summary="Legacy evidence to clean",
                high_contradiction=False,
                bookmaker_count=5,
            ),
            EvidenceItem(
                market_id=eligible_market.id,
                source_id=eligible_source.id,
                provider="the_odds_api",
                evidence_type="odds",
                stance="favor",
                strength=Decimal("0.6000"),
                confidence=Decimal("0.75"),
                summary="Valid evidence to keep",
                high_contradiction=False,
                bookmaker_count=3,
            ),
        ]
    )
    db_session.commit()

    dry_run_summary = reconcile_legacy_evidence(db_session, apply=False)

    assert dry_run_summary.markets_considered == 2
    assert dry_run_summary.markets_eligible == 1
    assert dry_run_summary.markets_non_eligible == 1
    assert dry_run_summary.markets_skipped_non_matchable == 1
    assert dry_run_summary.markets_skipped_unsupported_shape == 0
    assert dry_run_summary.markets_with_legacy_evidence == 1
    assert dry_run_summary.sources_found == 1
    assert dry_run_summary.evidence_found == 1
    assert dry_run_summary.sources_deleted == 0
    assert dry_run_summary.evidence_deleted == 0

    apply_summary = reconcile_legacy_evidence(db_session, apply=True)

    assert apply_summary.markets_cleaned == 1
    assert apply_summary.sources_deleted == 1
    assert apply_summary.evidence_deleted == 1
    assert apply_summary.partial_errors == []

    remaining_skipped_sources = db_session.scalar(
        select(func.count()).select_from(Source).where(Source.market_id == skipped_market.id)
    )
    remaining_skipped_evidence = db_session.scalar(
        select(func.count()).select_from(EvidenceItem).where(EvidenceItem.market_id == skipped_market.id)
    )
    remaining_eligible_sources = db_session.scalar(
        select(func.count()).select_from(Source).where(Source.market_id == eligible_market.id)
    )
    remaining_eligible_evidence = db_session.scalar(
        select(func.count()).select_from(EvidenceItem).where(EvidenceItem.market_id == eligible_market.id)
    )

    assert remaining_skipped_sources == 0
    assert remaining_skipped_evidence == 0
    assert remaining_eligible_sources == 1
    assert remaining_eligible_evidence == 1
