from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clients.espn_rss import EspnNewsItem
from app.core.config import get_settings
from app.models.evidence_item import EvidenceItem
from app.models.event import Event
from app.models.market import Market
from app.models.source import Source
from app.services.evidence_pipeline import (
    EvidenceFetchContext,
    capture_market_evidence,
    capture_nba_winner_evidence,
)


def test_capture_market_evidence_persists_and_updates_records(db_session: Session) -> None:
    event = Event(
        polymarket_event_id="event-evidence-1",
        title="Knicks vs Celtics",
        category="sports",
        slug="knicks-vs-celtics",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id="market-evidence-1",
        event_id=event.id,
        question="Will the New York Knicks beat the Boston Celtics tonight?",
        slug="will-the-new-york-knicks-beat-the-boston-celtics-tonight",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    db_session.add(market)
    db_session.commit()

    settings = get_settings().model_copy(update={"evidence_news_summary_max_length": 180})
    context = EvidenceFetchContext(
        fetched_at=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
        odds_events=[
            {
                "id": "odds-event-1",
                "home_team": "Boston Celtics",
                "away_team": "New York Knicks",
                "commence_time": "2026-04-20T23:30:00Z",
                "bookmakers": [
                    {
                        "title": "DraftKings",
                        "markets": [
                            {
                                "key": "h2h",
                                "outcomes": [
                                    {"name": "New York Knicks", "price": -150},
                                    {"name": "Boston Celtics", "price": 130},
                                ],
                            }
                        ],
                    },
                    {
                        "title": "FanDuel",
                        "markets": [
                            {
                                "key": "h2h",
                                "outcomes": [
                                    {"name": "New York Knicks", "price": -145},
                                    {"name": "Boston Celtics", "price": 125},
                                ],
                            }
                        ],
                    },
                    {
                        "title": "BetMGM",
                        "markets": [
                            {
                                "key": "h2h",
                                "outcomes": [
                                    {"name": "New York Knicks", "price": -140},
                                    {"name": "Boston Celtics", "price": 120},
                                ],
                            }
                        ],
                    },
                ],
            }
        ],
        news_items=[
            EspnNewsItem(
                title="Knicks injury report improves before Celtics matchup",
                description="New York expects a deeper rotation before facing Boston.",
                url="https://www.espn.com/nba/story/_/id/1",
                published_at=datetime(2026, 4, 20, 11, 0, tzinfo=UTC),
                raw_text=(
                    "Knicks injury report improves before Celtics matchup\n"
                    "New York expects a deeper rotation before facing Boston."
                ),
                raw_json={
                    "title": "Knicks injury report improves before Celtics matchup",
                    "description": "New York expects a deeper rotation before facing Boston.",
                    "url": "https://www.espn.com/nba/story/_/id/1",
                },
            )
        ],
    )

    first_summary = capture_market_evidence(
        db_session,
        market=market,
        settings=settings,
        context=context,
    )
    db_session.commit()

    assert first_summary.sources_created == 2
    assert first_summary.sources_updated == 0
    assert first_summary.evidence_created == 2
    assert first_summary.evidence_updated == 0
    assert first_summary.odds_matches == 1
    assert first_summary.news_items_matched == 1

    source_count = db_session.scalar(select(func.count()).select_from(Source))
    evidence_count = db_session.scalar(select(func.count()).select_from(EvidenceItem))
    assert source_count == 2
    assert evidence_count == 2

    odds_evidence = db_session.scalar(
        select(EvidenceItem).where(EvidenceItem.evidence_type == "odds")
    )
    assert odds_evidence is not None
    assert odds_evidence.stance == "favor"
    assert odds_evidence.confidence == Decimal("0.75")
    assert odds_evidence.bookmaker_count == 3
    assert odds_evidence.high_contradiction is False
    assert odds_evidence.strength is not None
    assert odds_evidence.strength > Decimal("0.55")

    second_summary = capture_market_evidence(
        db_session,
        market=market,
        settings=settings,
        context=context,
    )
    db_session.commit()

    assert second_summary.sources_created == 0
    assert second_summary.sources_updated == 2
    assert second_summary.evidence_created == 0
    assert second_summary.evidence_updated == 2


def test_capture_market_evidence_skips_non_matchable_futures_market_without_warning(
    db_session: Session,
) -> None:
    event = Event(
        polymarket_event_id="event-evidence-2",
        title="2026 NBA Champion",
        category="sports",
        slug="2026-nba-champion-evidence",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    market = Market(
        polymarket_market_id="market-evidence-2",
        event_id=event.id,
        question="Will the Sacramento Kings win the 2026 NBA Finals?",
        slug="will-the-sacramento-kings-win-the-2026-nba-finals",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    db_session.add(market)
    db_session.commit()

    summary = capture_market_evidence(
        db_session,
        market=market,
        settings=get_settings(),
        context=EvidenceFetchContext(
            fetched_at=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
            odds_events=[],
            news_items=[],
            odds_available=True,
        ),
    )
    db_session.commit()

    assert summary.markets_eligible_for_evidence == 0
    assert summary.markets_processed == 0
    assert summary.markets_futures_shape == 1
    assert summary.markets_skipped_non_matchable == 1
    assert summary.sources_created == 0
    assert summary.evidence_created == 0
    assert summary.partial_errors == []
    assert summary.skipped_markets[0]["market_id"] == market.id
    assert summary.skipped_markets[0]["skip_reason"] == "single_team_market"


def test_capture_nba_winner_evidence_separates_skipped_from_processed(db_session: Session) -> None:
    event = Event(
        polymarket_event_id="event-evidence-3",
        title="Mixed NBA evidence batch",
        category="sports",
        slug="mixed-nba-evidence-batch",
        active=True,
        closed=False,
    )
    db_session.add(event)
    db_session.flush()

    eligible_market = Market(
        polymarket_market_id="market-evidence-3",
        event_id=event.id,
        question="NBA Playoffs: Who Will Win Series? - Knicks vs. Hawks",
        slug="nba-playoffs-who-will-win-series-knicks-vs-hawks",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    skipped_market = Market(
        polymarket_market_id="market-evidence-4",
        event_id=event.id,
        question="Will the Sacramento Kings win the 2026 NBA Finals?",
        slug="will-the-sacramento-kings-win-the-2026-nba-finals-batch",
        active=True,
        closed=False,
        sport_type="nba",
        market_type="winner",
    )
    db_session.add_all([eligible_market, skipped_market])
    db_session.commit()

    summary = capture_nba_winner_evidence(
        db_session,
        settings=get_settings(),
        odds_client=_StubOddsClient(
            [
                {
                    "id": "odds-event-2",
                    "home_team": "Atlanta Hawks",
                    "away_team": "New York Knicks",
                    "commence_time": "2026-04-20T23:30:00Z",
                    "bookmakers": [
                        {
                            "title": "DraftKings",
                            "markets": [
                                {
                                    "key": "h2h",
                                    "outcomes": [
                                        {"name": "New York Knicks", "price": -150},
                                        {"name": "Atlanta Hawks", "price": 130},
                                    ],
                                }
                            ],
                        }
                    ],
                }
            ]
        ),
        news_client=_StubNewsClient(
            [
                EspnNewsItem(
                    title="Knicks prepare for Hawks series",
                    description="New York looks ready for Atlanta.",
                    url="https://www.espn.com/nba/story/_/id/2",
                    published_at=datetime(2026, 4, 20, 11, 0, tzinfo=UTC),
                    raw_text="Knicks prepare for Hawks series. New York looks ready for Atlanta.",
                    raw_json={"id": "news-2"},
                )
            ]
        ),
    )
    db_session.commit()

    assert summary.markets_considered == 2
    assert summary.markets_eligible_for_evidence == 1
    assert summary.markets_processed == 1
    assert summary.markets_matchup_shape == 1
    assert summary.markets_futures_shape == 1
    assert summary.markets_skipped_non_matchable == 1
    assert summary.markets_skipped_unsupported_shape == 0
    assert summary.markets_with_odds_match == 1
    assert summary.markets_with_news_match == 1
    assert summary.partial_errors == []
    assert len(summary.skipped_markets) == 1
    assert summary.skipped_markets[0]["market_id"] == skipped_market.id


class _StubOddsClient:
    def __init__(self, events: list[dict[str, object]]) -> None:
        self._events = events

    def is_configured(self) -> bool:
        return True

    def fetch_nba_odds(self, *, regions: str, markets: str) -> list[dict[str, object]]:
        return self._events


class _StubNewsClient:
    def __init__(self, items: list[EspnNewsItem]) -> None:
        self._items = items

    def fetch_nba_news(self) -> list[EspnNewsItem]:
        return self._items
