from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.commands.score_missing_markets import score_missing_markets
from app.core.config import get_settings
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import DEFAULT_PREDICTION_FAMILY, Prediction


def test_score_missing_markets_dry_run_does_not_write_predictions(
    db_session: Session,
) -> None:
    _create_market(db_session, index=1, with_snapshot=True)
    _create_market(db_session, index=2, with_snapshot=True)
    db_session.commit()

    summary = score_missing_markets(
        db_session,
        settings=_settings(),
        limit=20,
        apply=False,
        run_at=_run_at(),
    )

    assert summary.dry_run is True
    assert summary.apply is False
    assert summary.candidates_checked == 2
    assert summary.candidates_without_prediction == 2
    assert summary.candidates_with_snapshot == 2
    assert summary.scored == 0
    assert summary.skipped == 2
    assert summary.skipped_reasons == {"dry_run": 2}
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == 0


def test_score_missing_markets_apply_scores_only_missing_predictions(
    db_session: Session,
) -> None:
    _create_market(db_session, index=1, with_snapshot=True)
    _create_market(db_session, index=2, with_snapshot=True)
    _create_market(db_session, index=3, with_snapshot=True, with_prediction=True)
    db_session.commit()

    summary = score_missing_markets(
        db_session,
        settings=_settings(),
        limit=20,
        apply=True,
        run_at=_run_at(),
    )

    assert summary.dry_run is False
    assert summary.apply is True
    assert summary.candidates_checked == 2
    assert summary.candidates_without_prediction == 2
    assert summary.candidates_with_snapshot == 2
    assert summary.scored == 2
    assert summary.skipped == 0
    assert summary.market_ids_scored == [1, 2]
    assert len(summary.prediction_ids_created) == 2
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == 3


def test_score_missing_markets_does_not_duplicate_existing_predictions(
    db_session: Session,
) -> None:
    _create_market(db_session, index=1, with_snapshot=True, with_prediction=True)
    db_session.commit()

    summary = score_missing_markets(
        db_session,
        settings=_settings(),
        limit=20,
        apply=True,
        run_at=_run_at(),
    )

    assert summary.candidates_checked == 0
    assert summary.scored == 0
    assert summary.prediction_ids_created == []
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == 1


def test_score_missing_markets_skips_markets_without_snapshot(
    db_session: Session,
) -> None:
    _create_market(db_session, index=1, with_snapshot=False)
    _create_market(db_session, index=2, with_snapshot=True)
    db_session.commit()

    summary = score_missing_markets(
        db_session,
        settings=_settings(),
        limit=20,
        apply=True,
        run_at=_run_at(),
    )

    assert summary.candidates_checked == 2
    assert summary.candidates_with_snapshot == 1
    assert summary.scored == 1
    assert summary.skipped == 1
    assert summary.skipped_reasons == {"no_snapshot": 1}
    assert db_session.scalar(select(func.count()).select_from(Prediction)) == 1


def test_score_missing_markets_respects_limit(
    db_session: Session,
) -> None:
    _create_market(db_session, index=1, with_snapshot=True)
    _create_market(db_session, index=2, with_snapshot=True)
    _create_market(db_session, index=3, with_snapshot=True)
    db_session.commit()

    summary = score_missing_markets(
        db_session,
        settings=_settings(),
        limit=2,
        apply=False,
        run_at=_run_at(),
    )

    assert summary.candidates_checked == 2
    assert summary.candidates_without_prediction == 2
    assert summary.skipped_reasons == {"dry_run": 2}


def test_score_missing_markets_respects_sport_type_and_market_type(
    db_session: Session,
) -> None:
    _create_market(
        db_session,
        index=1,
        sport_type="soccer",
        market_type="match_winner",
        with_snapshot=True,
    )
    _create_market(
        db_session,
        index=2,
        sport_type="soccer",
        market_type="exact_score",
        with_snapshot=True,
    )
    _create_market(
        db_session,
        index=3,
        sport_type="basketball",
        market_type="match_winner",
        with_snapshot=True,
    )
    db_session.commit()

    summary = score_missing_markets(
        db_session,
        settings=_settings(),
        limit=20,
        apply=False,
        sport_type="soccer",
        market_type="match_winner",
        run_at=_run_at(),
    )

    assert summary.sport_type == "soccer"
    assert summary.market_type == "match_winner"
    assert summary.candidates_checked == 1
    assert summary.candidates_with_snapshot == 1
    assert summary.skipped_reasons == {"dry_run": 1}


def test_score_missing_markets_payload_contains_operational_summary(
    db_session: Session,
) -> None:
    _create_market(db_session, index=1, with_snapshot=True)
    db_session.commit()

    summary = score_missing_markets(
        db_session,
        settings=_settings(),
        limit=20,
        apply=False,
        run_at=_run_at(),
    )
    payload = summary.to_payload()

    assert payload["status"] == "ok"
    assert payload["dry_run"] is True
    assert payload["apply"] is False
    assert payload["candidates_checked"] == 1
    assert payload["candidates_without_prediction"] == 1
    assert payload["candidates_with_snapshot"] == 1
    assert payload["scored"] == 0
    assert payload["skipped"] == 1
    assert payload["skipped_reasons"] == {"dry_run": 1}
    assert payload["errors"] == []
    assert payload["prediction_ids_created"] == []
    assert payload["market_ids_scored"] == []
    assert payload["markets_considered"] == 1
    assert payload["markets_scored"] == 0
    assert payload["predictions_created"] == 0


def _settings():
    return get_settings().model_copy(
        update={
            "scoring_model_version": DEFAULT_PREDICTION_FAMILY,
            "scoring_low_liquidity_threshold": 50000.0,
            "scoring_odds_window_hours": 24,
            "scoring_news_window_hours": 48,
            "scoring_freshness_window_hours": 24,
        }
    )


def _run_at() -> datetime:
    return datetime(2026, 5, 4, 12, 0, tzinfo=UTC)


def _create_market(
    db_session: Session,
    *,
    index: int,
    sport_type: str = "soccer",
    market_type: str = "match_winner",
    with_snapshot: bool,
    with_prediction: bool = False,
) -> Market:
    run_at = _run_at()
    event = Event(
        polymarket_event_id=f"event-missing-score-{index}",
        title=f"Missing score event {index}",
        category="sports",
        slug=f"missing-score-event-{index}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id=f"market-missing-score-{index}",
        event_id=event.id,
        question=f"Will Team {index} win on 2026-05-04?",
        slug=f"will-team-{index}-win-missing-score",
        active=True,
        closed=False,
        sport_type=sport_type,
        market_type=market_type,
    )
    db_session.add(market)
    db_session.flush()

    if with_snapshot:
        db_session.add(
            MarketSnapshot(
                market_id=market.id,
                captured_at=run_at - timedelta(hours=1),
                yes_price=Decimal("0.4200"),
                no_price=Decimal("0.5800"),
                midpoint=Decimal("0.4200"),
                last_trade_price=Decimal("0.4200"),
                spread=Decimal("0.0400"),
                volume=Decimal("1000.0000"),
                liquidity=Decimal("100000.0000"),
            )
        )
        db_session.flush()

    if with_prediction:
        db_session.add(
            Prediction(
                market_id=market.id,
                run_at=run_at - timedelta(minutes=30),
                model_version=DEFAULT_PREDICTION_FAMILY,
                prediction_family=DEFAULT_PREDICTION_FAMILY,
                yes_probability=Decimal("0.4200"),
                no_probability=Decimal("0.5800"),
                confidence_score=Decimal("0.2000"),
                edge_signed=Decimal("0.0000"),
                edge_magnitude=Decimal("0.0000"),
                edge_class="no_signal",
                opportunity=False,
                review_confidence=False,
                review_edge=False,
                explanation_json={"counts": {"odds_count": 0, "news_count": 0}},
            )
        )
        db_session.flush()

    return market
