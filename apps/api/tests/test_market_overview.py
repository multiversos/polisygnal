from __future__ import annotations

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


def test_get_markets_overview_returns_aggregated_items_in_operational_order(
    client: TestClient,
    db_session: Session,
) -> None:
    base_time = datetime(2026, 4, 21, 12, 0, tzinfo=UTC)
    primary_market = _create_market(
        db_session,
        suffix="overview-primary",
        question="NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
    )
    secondary_market = _create_market(
        db_session,
        suffix="overview-secondary",
        question="NBA Playoffs: Who Will Win Series? - Lakers vs. Rockets",
    )
    empty_market = _create_market(db_session, suffix="overview-empty")
    _create_market(db_session, suffix="overview-excluded", sport_type="nfl")

    _add_snapshot(
        db_session,
        market=primary_market,
        captured_at=base_time,
        yes_price=Decimal("0.3111"),
        no_price=Decimal("0.6889"),
        spread=Decimal("0.0200"),
        volume=Decimal("1234.5000"),
        liquidity=Decimal("456789.0000"),
    )
    _add_prediction(
        db_session,
        market=primary_market,
        run_at=base_time,
        yes_probability=Decimal("0.3111"),
        no_probability=Decimal("0.6889"),
        confidence_score=Decimal("1.0000"),
        edge_signed=Decimal("0.3071"),
        edge_magnitude=Decimal("0.3071"),
        edge_class="review",
        opportunity=True,
        review_confidence=True,
        review_edge=True,
        used_odds_count=1,
        used_news_count=1,
    )
    _add_evidence(
        db_session,
        market=primary_market,
        provider="the_odds_api",
        evidence_type="odds",
        timestamp=base_time - timedelta(hours=1),
    )
    _add_evidence(
        db_session,
        market=primary_market,
        provider="espn_rss",
        evidence_type="news",
        timestamp=base_time - timedelta(minutes=30),
    )

    _add_snapshot(
        db_session,
        market=secondary_market,
        captured_at=base_time - timedelta(minutes=15),
        yes_price=Decimal("0.4500"),
        no_price=Decimal("0.5500"),
        spread=Decimal("0.0400"),
        volume=Decimal("800.0000"),
        liquidity=Decimal("90000.0000"),
    )
    _add_prediction(
        db_session,
        market=secondary_market,
        run_at=base_time + timedelta(minutes=5),
        yes_probability=Decimal("0.5200"),
        no_probability=Decimal("0.4800"),
        confidence_score=Decimal("0.6500"),
        edge_signed=Decimal("0.0700"),
        edge_magnitude=Decimal("0.0700"),
        edge_class="moderate",
        opportunity=False,
        review_confidence=False,
        review_edge=False,
        used_odds_count=0,
        used_news_count=0,
    )
    _add_evidence(
        db_session,
        market=empty_market,
        provider="espn_rss",
        evidence_type="news",
        timestamp=base_time - timedelta(minutes=20),
    )

    db_session.commit()

    response = client.get("/markets/overview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["filters"]["sport_type"] == "nba"
    assert payload["filters"]["market_type"] == "winner"
    assert payload["total_count"] == 3
    assert [item["market"]["id"] for item in payload["items"]] == [
        primary_market.id,
        secondary_market.id,
        empty_market.id,
    ]

    first_item = payload["items"][0]
    assert first_item["priority_rank"] == 1
    assert first_item["priority_bucket"] == "priority"
    assert first_item["market"]["question"] == primary_market.question
    assert first_item["market"]["evidence_eligible"] is True
    assert first_item["market"]["evidence_shape"] == "matchup"
    assert first_item["market"]["evidence_skip_reason"] is None
    assert first_item["latest_snapshot"]["yes_price"] == "0.3111"
    assert first_item["latest_prediction"]["edge_class"] == "review"
    assert first_item["latest_prediction"]["opportunity"] is True
    assert first_item["latest_prediction"]["action_score"] is None
    assert first_item["evidence_summary"]["evidence_count"] == 2
    assert first_item["evidence_summary"]["odds_evidence_count"] == 1
    assert first_item["evidence_summary"]["news_evidence_count"] == 1
    assert first_item["evidence_summary"]["latest_evidence_at"].startswith("2026-04-21T11:30:00")

    empty_item = payload["items"][2]
    assert empty_item["priority_rank"] == 3
    assert empty_item["priority_bucket"] == "no_prediction"
    assert empty_item["market"]["id"] == empty_market.id
    assert empty_item["market"]["evidence_eligible"] is False
    assert empty_item["market"]["evidence_shape"] == "ambiguous"
    assert empty_item["latest_snapshot"] is None
    assert empty_item["latest_prediction"] is None
    assert empty_item["evidence_summary"]["evidence_count"] == 0
    assert empty_item["evidence_summary"]["news_evidence_count"] == 0
    assert empty_item["evidence_summary"]["latest_evidence_at"] is None


def test_get_markets_overview_supports_filters_and_pagination(
    client: TestClient,
    db_session: Session,
) -> None:
    base_time = datetime(2026, 4, 21, 12, 0, tzinfo=UTC)
    top_market = _create_market(db_session, suffix="filters-top", active=True)
    inactive_market = _create_market(db_session, suffix="filters-inactive", active=False)
    moderate_market = _create_market(db_session, suffix="filters-moderate", active=True)
    eligible_market = _create_market(
        db_session,
        suffix="filters-eligible",
        question="NBA Playoffs: Who Will Win Series? - Bucks vs. Pacers",
        active=True,
    )
    _create_market(db_session, suffix="filters-spread", market_type="spread")

    _add_prediction(
        db_session,
        market=top_market,
        run_at=base_time,
        yes_probability=Decimal("0.6500"),
        no_probability=Decimal("0.3500"),
        confidence_score=Decimal("0.8500"),
        edge_signed=Decimal("0.2800"),
        edge_magnitude=Decimal("0.2800"),
        edge_class="review",
        opportunity=True,
        review_confidence=True,
        review_edge=True,
        used_odds_count=0,
        used_news_count=0,
    )
    _add_prediction(
        db_session,
        market=inactive_market,
        run_at=base_time - timedelta(minutes=5),
        yes_probability=Decimal("0.6100"),
        no_probability=Decimal("0.3900"),
        confidence_score=Decimal("0.8200"),
        edge_signed=Decimal("0.2100"),
        edge_magnitude=Decimal("0.2100"),
        edge_class="strong",
        opportunity=True,
        review_confidence=True,
        review_edge=False,
        used_odds_count=0,
        used_news_count=0,
    )
    _add_prediction(
        db_session,
        market=moderate_market,
        run_at=base_time - timedelta(minutes=10),
        yes_probability=Decimal("0.5400"),
        no_probability=Decimal("0.4600"),
        confidence_score=Decimal("0.6000"),
        edge_signed=Decimal("0.0800"),
        edge_magnitude=Decimal("0.0800"),
        edge_class="moderate",
        opportunity=False,
        review_confidence=False,
        review_edge=False,
        used_odds_count=0,
        used_news_count=0,
    )
    _add_prediction(
        db_session,
        market=eligible_market,
        run_at=base_time - timedelta(minutes=2),
        yes_probability=Decimal("0.5600"),
        no_probability=Decimal("0.4400"),
        confidence_score=Decimal("0.9000"),
        edge_signed=Decimal("0.0400"),
        edge_magnitude=Decimal("0.0400"),
        edge_class="no_signal",
        opportunity=False,
        review_confidence=True,
        review_edge=False,
        used_odds_count=1,
        used_news_count=0,
    )

    db_session.commit()

    opportunity_response = client.get("/markets/overview", params={"opportunity_only": "true"})
    assert opportunity_response.status_code == 200
    opportunity_payload = opportunity_response.json()
    assert opportunity_payload["total_count"] == 2
    assert [item["market"]["id"] for item in opportunity_payload["items"]] == [
        top_market.id,
        inactive_market.id,
    ]

    edge_class_response = client.get("/markets/overview", params={"edge_class": "moderate"})
    assert edge_class_response.status_code == 200
    edge_class_payload = edge_class_response.json()
    assert edge_class_payload["total_count"] == 1
    assert edge_class_payload["items"][0]["market"]["id"] == moderate_market.id

    active_response = client.get("/markets/overview", params={"active": "false"})
    assert active_response.status_code == 200
    active_payload = active_response.json()
    assert active_payload["total_count"] == 1
    assert active_payload["items"][0]["market"]["id"] == inactive_market.id

    evidence_eligible_response = client.get(
        "/markets/overview",
        params={"evidence_eligible_only": "true"},
    )
    assert evidence_eligible_response.status_code == 200
    evidence_eligible_payload = evidence_eligible_response.json()
    assert evidence_eligible_payload["filters"]["evidence_eligible_only"] is True
    assert evidence_eligible_payload["total_count"] == 1
    assert evidence_eligible_payload["items"][0]["market"]["id"] == eligible_market.id
    assert evidence_eligible_payload["items"][0]["priority_bucket"] == "watchlist"
    assert evidence_eligible_payload["items"][0]["scoring_mode"] == "evidence_backed"

    confidence_sort_response = client.get(
        "/markets/overview",
        params={"sort_by": "confidence_score"},
    )
    assert confidence_sort_response.status_code == 200
    confidence_sort_payload = confidence_sort_response.json()
    assert confidence_sort_payload["filters"]["sort_by"] == "confidence_score"
    assert confidence_sort_payload["items"][0]["market"]["id"] == eligible_market.id

    evidence_only_response = client.get(
        "/markets/overview",
        params={"evidence_only": "true"},
    )
    assert evidence_only_response.status_code == 200
    evidence_only_payload = evidence_only_response.json()
    assert evidence_only_payload["filters"]["evidence_only"] is True
    assert evidence_only_payload["total_count"] == 1
    assert evidence_only_payload["items"][0]["market"]["id"] == eligible_market.id
    assert evidence_only_payload["items"][0]["scoring_mode"] == "evidence_backed"

    fallback_only_response = client.get(
        "/markets/overview",
        params={"fallback_only": "true"},
    )
    assert fallback_only_response.status_code == 200
    fallback_only_payload = fallback_only_response.json()
    assert fallback_only_payload["filters"]["fallback_only"] is True
    assert [item["market"]["id"] for item in fallback_only_payload["items"]] == [
        top_market.id,
        inactive_market.id,
        moderate_market.id,
    ]
    assert all(item["scoring_mode"] == "fallback_only" for item in fallback_only_payload["items"])

    watchlist_response = client.get(
        "/markets/overview",
        params={"bucket": "watchlist"},
    )
    assert watchlist_response.status_code == 200
    watchlist_payload = watchlist_response.json()
    assert watchlist_payload["filters"]["bucket"] == "watchlist"
    assert watchlist_payload["total_count"] == 1
    assert watchlist_payload["items"][0]["market"]["id"] == eligible_market.id

    pagination_response = client.get("/markets/overview", params={"limit": 1, "offset": 1})
    assert pagination_response.status_code == 200
    pagination_payload = pagination_response.json()
    assert pagination_payload["total_count"] == 4
    assert len(pagination_payload["items"]) == 1
    assert pagination_payload["items"][0]["market"]["id"] == inactive_market.id


def test_get_markets_overview_orders_top_opportunities_by_action_score(
    client: TestClient,
    db_session: Session,
) -> None:
    base_time = datetime(2026, 4, 21, 12, 0, tzinfo=UTC)
    high_action_market = _create_market(
        db_session,
        suffix="action-high",
        question="NBA Playoffs: Who Will Win Series? - Nuggets vs. Thunder",
    )
    high_edge_market = _create_market(
        db_session,
        suffix="action-edge",
        question="NBA Playoffs: Who Will Win Series? - Clippers vs. Wolves",
    )

    _add_prediction(
        db_session,
        market=high_action_market,
        run_at=base_time,
        yes_probability=Decimal("0.5600"),
        no_probability=Decimal("0.4400"),
        confidence_score=Decimal("0.6500"),
        edge_signed=Decimal("0.0600"),
        edge_magnitude=Decimal("0.0600"),
        edge_class="moderate",
        opportunity=True,
        review_confidence=False,
        review_edge=False,
        action_score=Decimal("0.9000"),
    )
    _add_prediction(
        db_session,
        market=high_edge_market,
        run_at=base_time,
        yes_probability=Decimal("0.7000"),
        no_probability=Decimal("0.3000"),
        confidence_score=Decimal("0.9000"),
        edge_signed=Decimal("0.2000"),
        edge_magnitude=Decimal("0.2000"),
        edge_class="strong",
        opportunity=True,
        review_confidence=True,
        review_edge=False,
        action_score=Decimal("0.4000"),
    )
    db_session.commit()

    response = client.get("/markets/overview", params={"opportunity_only": "true"})

    assert response.status_code == 200
    payload = response.json()
    assert [item["market"]["id"] for item in payload["items"]] == [
        high_action_market.id,
        high_edge_market.id,
    ]
    assert payload["items"][0]["latest_prediction"]["action_score"] == "0.9000"
    assert payload["items"][1]["latest_prediction"]["action_score"] == "0.4000"


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    question: str | None = None,
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
        question=question or f"Will team {suffix} win?",
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
    no_price: Decimal,
    spread: Decimal,
    volume: Decimal,
    liquidity: Decimal,
) -> None:
    db_session.add(
        MarketSnapshot(
            market_id=market.id,
            captured_at=captured_at,
            yes_price=yes_price,
            no_price=no_price,
            spread=spread,
            volume=volume,
            liquidity=liquidity,
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
    action_score: Decimal | None = None,
    used_odds_count: int = 0,
    used_news_count: int = 0,
) -> None:
    computed = {"action_score": str(action_score)} if action_score is not None else {}
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
                "computed": computed,
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
