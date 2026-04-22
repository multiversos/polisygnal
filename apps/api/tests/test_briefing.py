from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.evidence_item import EvidenceItem
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.source import Source
from app.services import briefing as briefing_service


def test_get_briefing_returns_compact_operational_summary(
    client: TestClient,
    db_session: Session,
    tmp_path,
    monkeypatch,
) -> None:
    base_time = datetime(2026, 4, 21, 15, 0, tzinfo=UTC)
    monkeypatch.setattr(briefing_service, "REPO_ROOT", tmp_path)
    _write_summary(
        tmp_path / "logs" / "market_pipeline" / "latest-summary.json",
        {
            "status": "ok",
            "started_at": (base_time - timedelta(minutes=15)).isoformat(),
            "finished_at": (base_time - timedelta(minutes=5)).isoformat(),
        },
    )
    _write_summary(
        tmp_path / "logs" / "reports" / "latest-summary.json",
        {
            "status": "ok",
            "started_at": (base_time - timedelta(minutes=4)).isoformat(),
            "finished_at": (base_time - timedelta(minutes=1)).isoformat(),
        },
    )

    top_market = _create_market(
        db_session,
        suffix="briefing-top",
        question="NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
    )
    watchlist_market = _create_market(
        db_session,
        suffix="briefing-watchlist",
        question="NBA Playoffs: Who Will Win Series? - Lakers vs. Rockets",
    )
    review_market = _create_market(
        db_session,
        suffix="briefing-review",
        question="Will the Atlanta Hawks win the 2026 NBA Finals?",
    )
    fallback_market = _create_market(
        db_session,
        suffix="briefing-fallback",
        question="Will the Miami Heat win the 2026 NBA Finals?",
    )

    _add_snapshot(
        db_session,
        market=top_market,
        captured_at=base_time - timedelta(minutes=3),
        yes_price=Decimal("0.6400"),
    )
    _add_prediction(
        db_session,
        market=top_market,
        run_at=base_time,
        yes_probability=Decimal("0.5692"),
        no_probability=Decimal("0.4308"),
        confidence_score=Decimal("0.8000"),
        edge_signed=Decimal("-0.0708"),
        edge_magnitude=Decimal("0.0758"),
        edge_class="moderate",
        opportunity=True,
        review_confidence=False,
        review_edge=False,
        used_odds_count=1,
        used_news_count=1,
    )
    _add_evidence(
        db_session,
        market=top_market,
        provider="the_odds_api",
        evidence_type="odds",
        timestamp=base_time - timedelta(minutes=6),
    )
    _add_evidence(
        db_session,
        market=top_market,
        provider="espn_rss",
        evidence_type="news",
        timestamp=base_time - timedelta(minutes=2),
    )

    _add_snapshot(
        db_session,
        market=watchlist_market,
        captured_at=base_time - timedelta(minutes=4),
        yes_price=Decimal("0.3250"),
    )
    _add_prediction(
        db_session,
        market=watchlist_market,
        run_at=base_time - timedelta(minutes=1),
        yes_probability=Decimal("0.3530"),
        no_probability=Decimal("0.6470"),
        confidence_score=Decimal("0.8000"),
        edge_signed=Decimal("0.0280"),
        edge_magnitude=Decimal("0.0280"),
        edge_class="no_signal",
        opportunity=False,
        review_confidence=False,
        review_edge=False,
        used_odds_count=1,
        used_news_count=0,
    )
    _add_evidence(
        db_session,
        market=watchlist_market,
        provider="the_odds_api",
        evidence_type="odds",
        timestamp=base_time - timedelta(minutes=7),
    )

    _add_snapshot(
        db_session,
        market=review_market,
        captured_at=base_time - timedelta(minutes=5),
        yes_price=Decimal("0.0035"),
    )
    _add_prediction(
        db_session,
        market=review_market,
        run_at=base_time - timedelta(minutes=2),
        yes_probability=Decimal("0.3111"),
        no_probability=Decimal("0.6889"),
        confidence_score=Decimal("1.0000"),
        edge_signed=Decimal("0.3076"),
        edge_magnitude=Decimal("0.3076"),
        edge_class="review",
        opportunity=True,
        review_confidence=True,
        review_edge=True,
        used_odds_count=0,
        used_news_count=0,
    )

    _add_snapshot(
        db_session,
        market=fallback_market,
        captured_at=base_time - timedelta(minutes=8),
        yes_price=Decimal("0.0140"),
    )
    _add_prediction(
        db_session,
        market=fallback_market,
        run_at=base_time - timedelta(minutes=8),
        yes_probability=Decimal("0.0140"),
        no_probability=Decimal("0.9860"),
        confidence_score=Decimal("0.2450"),
        edge_signed=Decimal("0.0000"),
        edge_magnitude=Decimal("0.0000"),
        edge_class="no_signal",
        opportunity=False,
        review_confidence=False,
        review_edge=False,
        used_odds_count=0,
        used_news_count=0,
    )

    db_session.commit()

    response = client.get(
        "/briefing",
        params={"top_limit": 3, "watchlist_limit": 2, "review_limit": 3},
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["filters"] == {
        "sport_type": "nba",
        "market_type": "winner",
        "active": True,
        "top_limit": 3,
        "watchlist_limit": 2,
        "review_limit": 3,
    }
    assert payload["summary"] == (
        "2 top opportunities, 1 watchlist, 1 review flags, 2 evidence-backed, 2 fallback-only."
    )

    assert [item["market_id"] for item in payload["top_opportunities"]] == [
        top_market.id,
        review_market.id,
    ]
    assert payload["watchlist"][0]["market_id"] == watchlist_market.id
    assert payload["review_flags"][0]["market_id"] == review_market.id
    assert payload["review_flags"][0]["review_reasons"] == [
        "review_edge",
        "review_confidence",
        "fallback_only",
        "non_evidence_eligible",
    ]

    assert payload["operational_counts"] == {
        "total_markets": 4,
        "opportunity_count": 2,
        "watchlist_count": 1,
        "review_flag_count": 1,
        "review_edge_count": 1,
        "review_confidence_count": 1,
        "evidence_backed_count": 2,
        "fallback_only_count": 2,
        "no_prediction_count": 0,
        "evidence_eligible_count": 2,
        "evidence_non_eligible_count": 2,
    }

    assert payload["freshness"]["pipeline_status"] == "ok"
    assert payload["freshness"]["reports_status"] == "ok"
    assert payload["freshness"]["pipeline_finished_at"].startswith("2026-04-21T14:55:00")
    assert payload["freshness"]["reports_finished_at"].startswith("2026-04-21T14:59:00")
    assert payload["freshness"]["latest_prediction_at"].startswith("2026-04-21T15:00:00")
    assert payload["freshness"]["latest_snapshot_at"].startswith("2026-04-21T14:57:00")
    assert payload["freshness"]["latest_evidence_at"].startswith("2026-04-21T14:58:00")


def _write_summary(path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    question: str,
    sport_type: str = "nba",
    market_type: str = "winner",
    active: bool = True,
) -> Market:
    event = Event(
        polymarket_event_id=f"event-{suffix}",
        title=f"Event {suffix}",
        category="sports",
        slug=f"event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id=f"market-{suffix}",
        event_id=event.id,
        question=question,
        slug=f"market-{suffix}",
        sport_type=sport_type,
        market_type=market_type,
        active=active,
        closed=False,
    )
    db_session.add(market)
    db_session.flush()
    return market


def _add_snapshot(
    db_session: Session,
    *,
    market: Market,
    captured_at: datetime,
    yes_price: Decimal,
) -> None:
    db_session.add(
        MarketSnapshot(
            market_id=market.id,
            captured_at=captured_at,
            yes_price=yes_price,
            no_price=Decimal("1.0000") - yes_price,
            spread=Decimal("0.0200"),
            volume=Decimal("1000.0000"),
            liquidity=Decimal("90000.0000"),
        )
    )


def _add_prediction(
    db_session: Session,
    *,
    market: Market,
    run_at: datetime,
    yes_probability: Decimal,
    no_probability: Decimal,
    confidence_score: Decimal,
    edge_signed: Decimal,
    edge_magnitude: Decimal,
    edge_class: str,
    opportunity: bool,
    review_confidence: bool,
    review_edge: bool,
    used_odds_count: int,
    used_news_count: int,
) -> None:
    db_session.add(
        Prediction(
            market_id=market.id,
            run_at=run_at,
            model_version="scoring_v1",
            yes_probability=yes_probability,
            no_probability=no_probability,
            confidence_score=confidence_score,
            edge_signed=edge_signed,
            edge_magnitude=edge_magnitude,
            edge_class=edge_class,
            opportunity=opportunity,
            review_confidence=review_confidence,
            review_edge=review_edge,
            explanation_json={
                "summary": f"Prediction for market {market.id}",
                "counts": {
                    "odds_count": used_odds_count,
                    "news_count": used_news_count,
                },
            },
        )
    )


def _add_evidence(
    db_session: Session,
    *,
    market: Market,
    provider: str,
    evidence_type: str,
    timestamp: datetime,
) -> None:
    source = Source(
        market_id=market.id,
        provider=provider,
        source_type=evidence_type,
        external_id=f"{provider}-{market.id}-{evidence_type}-{timestamp.isoformat()}",
        title=f"{provider} {evidence_type}",
        published_at=timestamp,
        fetched_at=timestamp,
        raw_json={"provider": provider, "evidence_type": evidence_type},
    )
    db_session.add(source)
    db_session.flush()
    db_session.add(
        EvidenceItem(
            market_id=market.id,
            source_id=source.id,
            provider=provider,
            evidence_type=evidence_type,
            stance="favor" if evidence_type == "odds" else "unknown",
            strength=Decimal("0.6000") if evidence_type == "odds" else None,
            confidence=Decimal("0.75") if evidence_type == "odds" else None,
            summary=f"{provider} {evidence_type} summary",
            high_contradiction=False,
            bookmaker_count=3 if evidence_type == "odds" else None,
        )
    )
