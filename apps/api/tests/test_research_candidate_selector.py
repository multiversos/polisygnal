from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.commands import list_research_candidates, prepare_codex_research
from app.commands.prepare_codex_research import _resolve_market_for_prepare
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.services.research.candidate_selector import list_research_candidates as select_candidates


def test_candidate_selector_filters_closed_and_inactive_markets(db_session: Session) -> None:
    active = _create_market(
        db_session,
        suffix="active",
        question="Will the Lakers beat the Warriors?",
    )
    closed = _create_market(
        db_session,
        suffix="closed",
        question="Will the Celtics beat the Knicks?",
        closed=True,
    )
    inactive = _create_market(
        db_session,
        suffix="inactive",
        question="Will the Nuggets beat the Suns?",
        active=False,
    )
    _add_snapshot(db_session, market=active)
    _add_snapshot(db_session, market=closed)
    _add_snapshot(db_session, market=inactive)

    candidates = select_candidates(db_session, limit=10, vertical="sports")

    assert [candidate.market_id for candidate in candidates] == [active.id]


def test_candidate_selector_prioritizes_valid_snapshot(db_session: Session) -> None:
    with_snapshot = _create_market(
        db_session,
        suffix="with-snapshot",
        question="Will the Lakers beat the Warriors?",
    )
    without_snapshot = _create_market(
        db_session,
        suffix="without-snapshot",
        question="Will the Celtics beat the Knicks?",
    )
    _add_snapshot(
        db_session,
        market=with_snapshot,
        yes_price=Decimal("0.5200"),
        no_price=Decimal("0.4800"),
        liquidity=Decimal("25000.0000"),
        volume=Decimal("50000.0000"),
    )

    candidates = select_candidates(db_session, limit=10, sport="nba")

    assert candidates[0].market_id == with_snapshot.id
    assert candidates[0].market_yes_price == Decimal("0.5200")
    assert "valid_latest_snapshot:+20" in candidates[0].candidate_reasons
    missing_snapshot = next(item for item in candidates if item.market_id == without_snapshot.id)
    assert "missing_latest_snapshot" in missing_snapshot.warnings
    assert candidates[0].candidate_score > missing_snapshot.candidate_score


def test_candidate_selector_uses_research_classification(db_session: Session) -> None:
    market = _create_market(
        db_session,
        suffix="classification",
        question="Will the Lakers beat the Warriors?",
    )
    _add_snapshot(db_session, market=market)

    candidate = select_candidates(db_session, limit=1, sport="nba")[0]

    assert candidate.market_id == market.id
    assert candidate.vertical == "sports"
    assert candidate.sport == "nba"
    assert candidate.market_shape == "match_winner"
    assert candidate.research_template_name == "sports_nba_match_winner"


def test_candidate_selector_penalizes_poor_metadata_false_positive(
    db_session: Session,
) -> None:
    sports_market = _create_market(
        db_session,
        suffix="sports",
        question="Will the Thunder win the NBA Championship?",
        sport_type="nba",
    )
    poor_metadata_market = _create_market(
        db_session,
        suffix="poor-metadata",
        question="Will LeBron James win the 2028 US Presidential Election?",
        event_category="politics",
        sport_type=None,
    )
    _add_snapshot(db_session, market=sports_market)
    _add_snapshot(db_session, market=poor_metadata_market)

    candidates = select_candidates(db_session, limit=10)
    sports_candidate = next(item for item in candidates if item.market_id == sports_market.id)
    poor_metadata_candidate = next(
        item for item in candidates if item.market_id == poor_metadata_market.id
    )

    assert sports_candidate.candidate_score > poor_metadata_candidate.candidate_score
    assert "sports_inferred_from_text_only" in poor_metadata_candidate.warnings
    assert "possible_non_sports_market" in poor_metadata_candidate.warnings


def test_candidate_commands_import() -> None:
    assert list_research_candidates.main is not None
    assert prepare_codex_research.main is not None


def test_prepare_codex_market_id_still_resolves_explicit_market(
    db_session: Session,
) -> None:
    market = _create_market(
        db_session,
        suffix="explicit",
        question="Will the Celtics beat the Knicks?",
    )
    _add_snapshot(db_session, market=market)

    resolved_market, selected_candidate = _resolve_market_for_prepare(
        db_session,
        market_id=market.id,
        auto_select=False,
        vertical=None,
        sport=None,
        market_shape=None,
        limit=1,
    )

    assert resolved_market.id == market.id
    assert selected_candidate is None


def test_prepare_codex_cli_writes_packet_for_explicit_market(
    db_session: Session,
    monkeypatch,
    tmp_path,
    capsys,
) -> None:
    market = _create_market(
        db_session,
        suffix="cli-packet",
        question="Will the Celtics beat the Knicks?",
    )
    _add_snapshot(db_session, market=market)
    monkeypatch.setattr(prepare_codex_research, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(
        "sys.argv",
        [
            "prepare_codex_research",
            "--market-id",
            str(market.id),
            "--output-dir",
            str(tmp_path / "requests"),
            "--packet-dir",
            str(tmp_path / "packets"),
        ],
    )

    prepare_codex_research.main()
    payload = __import__("json").loads(capsys.readouterr().out)

    assert payload["market_id"] == market.id
    assert payload["packet_path"].endswith(".md")
    assert payload["response_path_expected"].endswith(".json")
    assert payload["ingest_command"] == (
        f"python -m app.commands.ingest_codex_research --run-id "
        f"{payload['research_run_id']}"
    )
    packet_text = __import__("pathlib").Path(payload["packet_path"]).read_text(
        encoding="utf-8"
    )
    assert "Do not invent sources" in packet_text
    assert "Do not include secrets" in packet_text


def test_prepare_codex_cli_supports_no_packet(
    db_session: Session,
    monkeypatch,
    tmp_path,
    capsys,
) -> None:
    market = _create_market(
        db_session,
        suffix="cli-no-packet",
        question="Will the Celtics beat the Knicks?",
    )
    _add_snapshot(db_session, market=market)
    monkeypatch.setattr(prepare_codex_research, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(
        "sys.argv",
        [
            "prepare_codex_research",
            "--market-id",
            str(market.id),
            "--output-dir",
            str(tmp_path / "requests"),
            "--packet-dir",
            str(tmp_path / "packets"),
            "--no-packet",
        ],
    )

    prepare_codex_research.main()
    payload = __import__("json").loads(capsys.readouterr().out)

    assert payload["packet_path"] is None
    assert payload["response_path_expected"].endswith(".json")
    assert not (tmp_path / "packets").exists()


def test_prepare_codex_auto_select_picks_valid_candidate(
    db_session: Session,
) -> None:
    weaker_market = _create_market(
        db_session,
        suffix="weaker",
        question="Will the Celtics beat the Knicks?",
    )
    stronger_market = _create_market(
        db_session,
        suffix="stronger",
        question="Will the Lakers beat the Warriors?",
    )
    _add_snapshot(
        db_session,
        market=weaker_market,
        liquidity=Decimal("500.0000"),
        volume=Decimal("700.0000"),
    )
    _add_snapshot(
        db_session,
        market=stronger_market,
        liquidity=Decimal("250000.0000"),
        volume=Decimal("500000.0000"),
    )

    resolved_market, selected_candidate = _resolve_market_for_prepare(
        db_session,
        market_id=None,
        auto_select=True,
        vertical="sports",
        sport="nba",
        market_shape="match_winner",
        limit=2,
    )

    assert resolved_market.id == stronger_market.id
    assert selected_candidate is not None
    assert selected_candidate.market_id == stronger_market.id
    assert selected_candidate.market_shape == "match_winner"


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    question: str,
    event_category: str = "sports",
    sport_type: str | None = "nba",
    market_type: str | None = "winner",
    active: bool = True,
    closed: bool = False,
) -> Market:
    event = Event(
        polymarket_event_id=f"candidate-event-{suffix}",
        title=f"Candidate Event {suffix}",
        category=event_category,
        slug=f"candidate-event-{suffix}",
        active=active,
        closed=closed,
    )
    db_session.add(event)
    db_session.flush()
    market = Market(
        polymarket_market_id=f"candidate-market-{suffix}",
        event_id=event.id,
        question=question,
        slug=f"candidate-market-{suffix}",
        active=active,
        closed=closed,
        sport_type=sport_type,
        market_type=market_type,
        end_date=datetime.now(tz=UTC) + timedelta(days=30),
    )
    db_session.add(market)
    db_session.flush()
    return market


def _add_snapshot(
    db_session: Session,
    *,
    market: Market,
    yes_price: Decimal = Decimal("0.5500"),
    no_price: Decimal = Decimal("0.4500"),
    liquidity: Decimal = Decimal("10000.0000"),
    volume: Decimal = Decimal("20000.0000"),
) -> MarketSnapshot:
    snapshot = MarketSnapshot(
        market_id=market.id,
        captured_at=datetime.now(tz=UTC),
        yes_price=yes_price,
        no_price=no_price,
        midpoint=Decimal("0.5000"),
        last_trade_price=yes_price,
        spread=Decimal("0.0200"),
        liquidity=liquidity,
        volume=volume,
    )
    db_session.add(snapshot)
    db_session.flush()
    return snapshot
