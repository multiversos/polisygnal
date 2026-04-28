from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.external_market_signal import ExternalMarketSignal
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.services.polysignal_score import build_polysignal_score


NOW = datetime(2026, 4, 27, 12, 0, tzinfo=UTC)


def test_polysignal_score_uses_latest_prediction_when_available(db_session: Session) -> None:
    market = _create_market(db_session, suffix="prediction")
    _add_snapshot(db_session, market=market, yes_price=Decimal("0.5500"))
    _add_prediction(db_session, market=market, yes_probability=Decimal("0.6700"))

    score = build_polysignal_score(db_session, market=market)

    assert score.source == "latest_prediction"
    assert score.score_probability == Decimal("0.6700")
    assert score.score_percent == Decimal("67.0")
    assert score.confidence_label == "Media"
    assert score.components[0].name == "latest_prediction"


def test_polysignal_score_falls_back_to_market_price(db_session: Session) -> None:
    market = _create_market(db_session, suffix="market-price")
    _add_snapshot(db_session, market=market, yes_price=Decimal("0.5800"))

    score = build_polysignal_score(db_session, market=market)

    assert score.source == "preliminary_composite"
    assert score.score_probability == Decimal("0.5800")
    assert score.market_yes_price == Decimal("0.5800")
    assert "polymarket_baseline" in [component.name for component in score.components]
    assert "preliminary_score" in score.warnings


def test_polysignal_score_blends_reliable_external_signal(db_session: Session) -> None:
    market = _create_market(db_session, suffix="external")
    _add_snapshot(db_session, market=market, yes_price=Decimal("0.5800"))
    _add_external_signal(
        db_session,
        market=market,
        yes_probability=Decimal("0.7000"),
        source_confidence=Decimal("0.8000"),
        match_confidence=Decimal("0.9000"),
    )

    score = build_polysignal_score(db_session, market=market)

    assert score.source == "preliminary_composite"
    assert score.score_probability is not None
    assert score.score_probability > Decimal("0.5800")
    assert score.score_probability < Decimal("0.7000")
    assert "external_signal" in [component.name for component in score.components]


def test_polysignal_score_ignores_low_match_external_signal(db_session: Session) -> None:
    market = _create_market(db_session, suffix="low-match")
    _add_snapshot(db_session, market=market, yes_price=Decimal("0.5800"))
    _add_external_signal(
        db_session,
        market=market,
        yes_probability=Decimal("0.9000"),
        source_confidence=Decimal("1.0000"),
        match_confidence=Decimal("0.2000"),
    )

    score = build_polysignal_score(db_session, market=market)

    assert score.score_probability == Decimal("0.5800")
    assert "external_signal" not in [component.name for component in score.components]
    assert "external_signal_low_match_confidence" in score.warnings


def test_polysignal_score_caps_momentum_adjustment(db_session: Session) -> None:
    market = _create_market(db_session, suffix="momentum")
    _add_snapshot(
        db_session,
        market=market,
        yes_price=Decimal("0.1000"),
        captured_at=NOW - timedelta(hours=3),
    )
    _add_snapshot(
        db_session,
        market=market,
        yes_price=Decimal("0.3000"),
        captured_at=NOW - timedelta(hours=2),
    )
    _add_snapshot(
        db_session,
        market=market,
        yes_price=Decimal("0.5000"),
        captured_at=NOW - timedelta(hours=1),
    )

    score = build_polysignal_score(db_session, market=market)

    momentum = next(component for component in score.components if component.name == "price_momentum")
    assert momentum.adjustment == Decimal("0.0500")
    assert score.score_probability == Decimal("0.5500")


def test_polysignal_score_clamps_probability(db_session: Session) -> None:
    market = _create_market(db_session, suffix="clamp")
    _add_snapshot(
        db_session,
        market=market,
        yes_price=Decimal("0.9000"),
        captured_at=NOW - timedelta(hours=3),
    )
    _add_snapshot(
        db_session,
        market=market,
        yes_price=Decimal("0.9500"),
        captured_at=NOW - timedelta(hours=2),
    )
    _add_snapshot(
        db_session,
        market=market,
        yes_price=Decimal("0.9800"),
        captured_at=NOW - timedelta(hours=1),
    )

    score = build_polysignal_score(db_session, market=market)

    assert score.score_probability == Decimal("0.9900")


def test_candidate_score_changes_confidence_not_probability(db_session: Session) -> None:
    market = _create_market(db_session, suffix="candidate-confidence")
    _add_snapshot(db_session, market=market, yes_price=Decimal("0.5800"))

    low_candidate = build_polysignal_score(
        db_session,
        market=market,
        candidate_score=Decimal("0.0000"),
    )
    high_candidate = build_polysignal_score(
        db_session,
        market=market,
        candidate_score=Decimal("100.0000"),
    )

    assert low_candidate.score_probability == high_candidate.score_probability
    assert high_candidate.confidence > low_candidate.confidence


def test_polysignal_score_returns_pending_when_data_missing(db_session: Session) -> None:
    market = _create_market(db_session, suffix="missing-data")

    score = build_polysignal_score(db_session, market=market)

    assert score.score_probability is None
    assert score.score_percent is None
    assert score.source == "insufficient_data"
    assert score.confidence_label == "Baja"
    assert "insufficient_data" in score.warnings


def test_polysignal_score_labels_positive_negative_and_neutral(db_session: Session) -> None:
    positive_market = _create_market(db_session, suffix="positive")
    _add_snapshot(db_session, market=positive_market, yes_price=Decimal("0.5000"))
    _add_external_signal(
        db_session,
        market=positive_market,
        yes_probability=Decimal("0.9000"),
        source_confidence=Decimal("1.0000"),
        match_confidence=Decimal("1.0000"),
    )

    negative_market = _create_market(db_session, suffix="negative")
    _add_snapshot(db_session, market=negative_market, yes_price=Decimal("0.7000"))
    _add_external_signal(
        db_session,
        market=negative_market,
        yes_probability=Decimal("0.3000"),
        source_confidence=Decimal("1.0000"),
        match_confidence=Decimal("1.0000"),
    )

    neutral_market = _create_market(db_session, suffix="neutral")
    _add_snapshot(db_session, market=neutral_market, yes_price=Decimal("0.5000"))
    _add_external_signal(
        db_session,
        market=neutral_market,
        yes_probability=Decimal("0.5100"),
        source_confidence=Decimal("1.0000"),
        match_confidence=Decimal("1.0000"),
    )

    assert build_polysignal_score(db_session, market=positive_market).color_hint == "positive"
    assert build_polysignal_score(db_session, market=negative_market).color_hint == "negative"
    assert build_polysignal_score(db_session, market=neutral_market).color_hint == "neutral"


def _create_market(db_session: Session, *, suffix: str) -> Market:
    event = Event(
        polymarket_event_id=f"score-event-{suffix}",
        title=f"Score Event {suffix}",
        category="sports",
        slug=f"score-event-{suffix}",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"score-market-{suffix}",
        event_id=event.id,
        question="Will the Lakers beat the Warriors?",
        slug=f"score-market-{suffix}",
        sport_type="nba",
        market_type="match_winner",
        active=True,
        closed=False,
        end_date=NOW + timedelta(hours=12),
    )
    db_session.add(market)
    db_session.flush()
    return market


def _add_snapshot(
    db_session: Session,
    *,
    market: Market,
    yes_price: Decimal,
    captured_at: datetime = NOW,
) -> MarketSnapshot:
    snapshot = MarketSnapshot(
        market_id=market.id,
        captured_at=captured_at,
        yes_price=yes_price,
        no_price=Decimal("1.0000") - yes_price,
        midpoint=yes_price,
        last_trade_price=yes_price,
        spread=Decimal("0.0200"),
        volume=Decimal("10000.0000"),
        liquidity=Decimal("10000.0000"),
    )
    db_session.add(snapshot)
    db_session.flush()
    return snapshot


def _add_prediction(
    db_session: Session,
    *,
    market: Market,
    yes_probability: Decimal,
) -> Prediction:
    prediction = Prediction(
        market_id=market.id,
        run_at=NOW,
        model_version="fixture",
        prediction_family="research_v1_local",
        yes_probability=yes_probability,
        no_probability=Decimal("1.0000") - yes_probability,
        confidence_score=Decimal("0.7200"),
        edge_signed=Decimal("0.1200"),
        edge_magnitude=Decimal("0.1200"),
        edge_class="moderate",
        opportunity=False,
        review_confidence=False,
        review_edge=False,
        explanation_json={"fixture": True},
        components_json={"fixture": True},
    )
    db_session.add(prediction)
    db_session.flush()
    return prediction


def _add_external_signal(
    db_session: Session,
    *,
    market: Market,
    yes_probability: Decimal,
    source_confidence: Decimal,
    match_confidence: Decimal,
) -> ExternalMarketSignal:
    signal = ExternalMarketSignal(
        source="kalshi",
        source_market_id=f"KX-SCORE-{market.id}",
        source_event_id="KX-SCORE",
        source_ticker=f"KX-SCORE-{market.id}",
        polymarket_market_id=market.id,
        title="Kalshi linked signal",
        yes_probability=yes_probability,
        no_probability=Decimal("1.0000") - yes_probability,
        mid_price=yes_probability,
        spread=Decimal("0.0200"),
        source_confidence=source_confidence,
        match_confidence=match_confidence,
        warnings=[],
        raw_json={"fixture": True},
        fetched_at=NOW,
    )
    db_session.add(signal)
    db_session.flush()
    return signal
