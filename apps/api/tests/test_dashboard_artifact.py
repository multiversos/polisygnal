from __future__ import annotations

import json
import sys
from contextlib import AbstractContextManager
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy.orm import Session

from app.commands import generate_dashboard
from app.models.event import Event
from app.models.market import Market
from app.models.market_outcome import MarketOutcome
from app.models.prediction import Prediction
from app.schemas.evaluation import EvaluationSummaryResponse
from app.services.dashboard import DashboardArtifact, DashboardTableRow, render_dashboard_html


def test_generate_dashboard_writes_html_with_real_sections(
    db_session: Session,
    tmp_path,
    monkeypatch,
    capsys,
) -> None:
    base_time = datetime(2026, 4, 22, 10, 0, tzinfo=UTC)

    top_market = _create_market(
        db_session,
        suffix="dashboard-top",
        question="NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
        start_at=datetime(2026, 4, 22, 19, 30),
    )
    watchlist_market = _create_market(
        db_session,
        suffix="dashboard-watchlist",
        question="NBA Playoffs: Who Will Win Series? - Lakers vs. Rockets",
    )
    cancelled_market = _create_market(
        db_session,
        suffix="dashboard-cancelled",
        question="Will the Boston Celtics win the 2026 NBA Finals?",
    )
    pending_market = _create_market(
        db_session,
        suffix="dashboard-pending",
        question="Will the Milwaukee Bucks win the 2026 NBA Finals?",
    )

    _add_prediction(
        db_session,
        market=top_market,
        run_at=base_time,
        yes_probability=Decimal("0.7000"),
        no_probability=Decimal("0.3000"),
        confidence_score=Decimal("0.8600"),
        edge_signed=Decimal("0.1800"),
        edge_magnitude=Decimal("0.1800"),
        edge_class="strong",
        opportunity=True,
        action_score=Decimal("0.8400"),
        used_odds_count=1,
    )
    _add_prediction(
        db_session,
        market=watchlist_market,
        run_at=base_time,
        yes_probability=Decimal("0.5400"),
        no_probability=Decimal("0.4600"),
        confidence_score=Decimal("0.6700"),
        edge_signed=Decimal("0.0300"),
        edge_magnitude=Decimal("0.0300"),
        edge_class="moderate",
        opportunity=False,
        action_score=Decimal("0.4100"),
        used_odds_count=0,
    )
    _add_prediction(
        db_session,
        market=cancelled_market,
        run_at=base_time,
        yes_probability=Decimal("0.4200"),
        no_probability=Decimal("0.5800"),
        confidence_score=Decimal("0.5100"),
        edge_signed=Decimal("0.0200"),
        edge_magnitude=Decimal("0.0200"),
        edge_class="no_signal",
        opportunity=False,
        used_odds_count=0,
    )
    _add_prediction(
        db_session,
        market=pending_market,
        run_at=base_time,
        yes_probability=Decimal("0.6100"),
        no_probability=Decimal("0.3900"),
        confidence_score=Decimal("0.5900"),
        edge_signed=Decimal("0.0400"),
        edge_magnitude=Decimal("0.0400"),
        edge_class="moderate",
        opportunity=False,
        used_odds_count=0,
    )

    db_session.add(
        MarketOutcome(
            market_id=top_market.id,
            resolved_outcome="yes",
            resolved_at=base_time,
        )
    )
    db_session.add(
        MarketOutcome(
            market_id=cancelled_market.id,
            resolved_outcome="cancelled",
            resolved_at=base_time,
        )
    )
    db_session.commit()

    output_dir = tmp_path / "logs" / "dashboard"
    monkeypatch.setattr(generate_dashboard, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(generate_dashboard, "SessionLocal", _SessionFactory(db_session))
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "generate_dashboard",
            "--output-dir",
            str(output_dir),
            "--top-limit",
            "5",
            "--watchlist-limit",
            "5",
        ],
    )

    generate_dashboard.main()

    stdout = capsys.readouterr().out
    payload = json.loads(stdout)

    latest_html_path = output_dir / "latest-dashboard.html"
    html_output_path = output_dir / Path(payload["html_output_path"]).name

    assert payload["status"] == "ok"
    assert payload["total_top_opportunities"] == 1
    assert payload["total_watchlist"] == 1
    assert payload["evaluation"] == {
        "accuracy": 1.0,
        "opportunity_accuracy": 1.0,
        "brier_score": 0.09,
        "evaluable": 1,
        "pending": 2,
    }

    assert latest_html_path.exists()
    assert html_output_path.exists()

    html = latest_html_path.read_text(encoding="utf-8")
    assert "Panel de PolySignal" in html
    assert "estado general" in html
    assert "Mejores oportunidades" in html
    assert "En observación" in html
    assert "Evaluación" in html
    assert "mercado" in html
    assert "sí 0.7000" in html
    assert "confianza" in html
    assert "score de accion 0.84" in html
    assert "score de accion 0.41" in html
    assert "diferencia" in html
    assert "prioridad" in html
    assert "Knicks vs. Hawks" in html
    assert "Lakers vs. Rockets" in html
    assert "0.7000" in html
    assert "0.8600" in html
    assert "0.1800" in html
    assert "dashboard-shell" in html
    assert "summary-grid" in html
    assert "metric-grid" in html
    assert "market-cards-grid" in html
    assert "market-card" in html
    assert "market-matchup" in html
    assert "team-badge" in html
    assert "vs-pill" in html
    assert "chip-positive" in html
    assert "chip-info" in html
    assert "chip-caution" in html
    assert "action-link action-primary" in html
    assert ">activo<" in html
    assert "con evidencia" in html
    assert "solo mercado" in html
    assert "empieza: 22 abr 7:30 PM" in html
    assert "inicio no disponible" in html
    assert "observación" in html
    assert f'href="/markets/{top_market.id}"' in html
    assert f'href="/markets/{top_market.id}/references"' in html
    assert f'href="/evaluation/history/{top_market.id}"' in html
    assert f'href="/markets/{watchlist_market.id}"' in html
    assert f'href="/markets/{watchlist_market.id}/references"' in html
    assert f'href="/evaluation/history/{watchlist_market.id}"' not in html
    assert ">mercado</a>" in html
    assert ">referencias</a>" in html
    assert ">evaluación</a>" in html
    assert "evaluación no disponible" in html
    assert "<table" not in html
    assert "1.0000" in html
    assert "0.0900" in html
    assert ">1<" in html
    assert ">2<" in html


def test_render_dashboard_html_shows_closed_market_status_chip() -> None:
    html = render_dashboard_html(
        DashboardArtifact(
            generated_at=datetime(2026, 4, 22, 10, 0, tzinfo=UTC),
            overall_status="ok",
            total_top_opportunities=1,
            total_watchlist=0,
            top_opportunities=[
                DashboardTableRow(
                    market_id=99,
                    question="NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
                    yes_probability=Decimal("0.6100"),
                    confidence_score=Decimal("0.8200"),
                    action_score=Decimal("0.7600"),
                    edge_magnitude=Decimal("0.1200"),
                    priority_bucket="priority",
                    evaluation_available=False,
                    market_time_label="cierre: 22 abr 7:30 PM",
                    market_status_label="cerrado",
                    market_status_tone="negative",
                    scoring_mode_label="modo no disponible",
                    scoring_mode_tone="neutral",
                )
            ],
            watchlist=[],
            evaluation=EvaluationSummaryResponse(),
        )
    )

    assert ">cerrado<" in html
    assert "cierre: 22 abr 7:30 PM" in html
    assert 'href="/markets/99/references"' in html
    assert "modo no disponible" in html
    assert 'href="/markets/99"' in html


class _SessionFactory(AbstractContextManager[Session]):
    def __init__(self, db_session: Session) -> None:
        self._db_session = db_session

    def __call__(self) -> _SessionFactory:
        return self

    def __enter__(self) -> Session:
        return self._db_session

    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        return False


def _create_market(
    db_session: Session,
    *,
    suffix: str,
    question: str,
    start_at: datetime | None = None,
    end_date: datetime | None = None,
    active: bool = True,
    closed: bool = False,
) -> Market:
    event = Event(
        polymarket_event_id=f"event-{suffix}",
        title=f"Event {suffix}",
        category="sports",
        slug=f"event-{suffix}",
        active=active,
        closed=closed,
        start_at=start_at,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id=f"market-{suffix}",
        event_id=event.id,
        question=question,
        slug=f"market-{suffix}",
        sport_type="nba",
        market_type="winner",
        active=active,
        closed=closed,
        end_date=end_date,
    )
    db_session.add(market)
    db_session.flush()
    return market


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
    used_odds_count: int,
    action_score: Decimal | None = None,
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
            review_confidence=False,
            review_edge=False,
            explanation_json={
                "summary": f"Prediction for market {market.id}",
                "computed": computed,
                "counts": {
                    "odds_count": used_odds_count,
                    "news_count": 0,
                },
            },
        )
    )
