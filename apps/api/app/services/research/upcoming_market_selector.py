from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.event import Event
from app.models.market import Market
from app.repositories.market_snapshots import list_latest_market_snapshots_for_markets
from app.services.research.candidate_selector import (
    ResearchCandidateParticipant,
    build_research_candidate,
)
from app.services.research.classification import (
    classify_market_research_context,
    normalize_market_shape,
    normalize_sport,
)

ZERO = Decimal("0")
MAX_URGENCY_SCORE = Decimal("100.0000")
FUTURE_SHAPES = {"championship", "futures"}
DEFAULT_UPCOMING_FOCUS = "match_winner"
SUPPORTED_UPCOMING_FOCUS = {"match_winner", "all"}
PAUSED_FOCUS_TITLE_TERMS = (
    "set 1 winner",
    "set 2 winner",
    "set winner",
    "who will win series",
    "win series",
    "win the series",
    "series winner",
    "who wins the toss",
    "toss match",
    "most sixes",
    "team top batter",
    "completed match",
    "both teams to score",
    "end in a draw",
    "nba finals",
    "conference finals",
    "world series",
    "championship",
    "champion",
)


@dataclass(frozen=True, slots=True)
class UpcomingSportsMarket:
    market_id: int
    question: str
    event_title: str | None
    vertical: str
    sport: str
    market_shape: str
    research_template_name: str
    close_time: datetime | None
    event_time: datetime | None
    market_yes_price: Decimal | None
    market_no_price: Decimal | None
    liquidity: Decimal | None
    volume: Decimal | None
    candidate_score: Decimal
    urgency_score: Decimal
    reasons: list[str]
    warnings: list[str]
    participants: list[ResearchCandidateParticipant]

    def to_payload(self) -> dict[str, object]:
        return {
            "market_id": self.market_id,
            "question": self.question,
            "event_title": self.event_title,
            "vertical": self.vertical,
            "sport": self.sport,
            "market_shape": self.market_shape,
            "research_template_name": self.research_template_name,
            "close_time": self.close_time.isoformat() if self.close_time else None,
            "event_time": self.event_time.isoformat() if self.event_time else None,
            "market_yes_price": _decimal_to_string(self.market_yes_price),
            "market_no_price": _decimal_to_string(self.market_no_price),
            "liquidity": _decimal_to_string(self.liquidity),
            "volume": _decimal_to_string(self.volume),
            "candidate_score": _decimal_to_string(self.candidate_score),
            "urgency_score": _decimal_to_string(self.urgency_score),
            "reasons": list(self.reasons),
            "warnings": list(self.warnings),
            "participants": [participant.to_payload() for participant in self.participants],
        }


@dataclass(frozen=True, slots=True)
class UpcomingSportsSelection:
    items: list[UpcomingSportsMarket]
    counts: dict[str, int]
    filters_applied: dict[str, object]


def list_upcoming_sports_markets(
    db: Session,
    *,
    sport: str | None = None,
    limit: int = 10,
    days: int = 7,
    include_futures: bool = False,
    market_shape: str | None = None,
    focus: str | None = DEFAULT_UPCOMING_FOCUS,
    now: datetime | None = None,
) -> UpcomingSportsSelection:
    current_time = _normalize_datetime(now or datetime.now(tz=UTC))
    safe_days = max(days, 1)
    window_end = current_time + timedelta(days=safe_days)
    normalized_sport = normalize_sport(sport) if sport else None
    normalized_shape = normalize_market_shape(market_shape) if market_shape else None
    normalized_focus = _normalize_focus(focus)

    markets = _load_time_window_markets(
        db,
        now=current_time,
        window_end=window_end,
        sport=normalized_sport,
    )
    snapshots = list_latest_market_snapshots_for_markets(db, [market.id for market in markets])
    counts = {
        "total_considered": len(markets),
        "matched_filters": 0,
        "returned": 0,
        "without_close_time": 0,
        "past_close_time": 0,
        "match_winner": 0,
        "championship_futures": 0,
        "focus_skipped": 0,
    }

    upcoming: list[UpcomingSportsMarket] = []
    for market in markets:
        classification = classify_market_research_context(market=market)
        if classification.vertical != "sports":
            continue
        if normalized_sport is not None and classification.sport != normalized_sport:
            continue
        if normalized_shape is not None and classification.market_shape != normalized_shape:
            continue
        if classification.market_shape == "match_winner":
            counts["match_winner"] += 1
        if classification.market_shape in FUTURE_SHAPES:
            counts["championship_futures"] += 1
        if (
            normalized_shape is None
            and normalized_focus == "match_winner"
            and classification.market_shape != "match_winner"
        ):
            if classification.market_shape not in FUTURE_SHAPES or not include_futures:
                counts["focus_skipped"] += 1
                continue
        if (
            normalized_shape is None
            and normalized_focus == "match_winner"
            and not include_futures
            and _looks_like_paused_future_title(market)
        ):
            counts["focus_skipped"] += 1
            continue
        if classification.market_shape in FUTURE_SHAPES:
            if not include_futures:
                continue

        effective_time = _effective_time(market)
        if effective_time is None:
            counts["without_close_time"] += 1
            continue
        if effective_time < current_time:
            counts["past_close_time"] += 1
            continue
        if effective_time > window_end:
            continue

        candidate = build_research_candidate(
            market=market,
            latest_snapshot=snapshots.get(market.id),
            classification=classification,
            now=current_time,
        )
        urgency_score, urgency_reasons, urgency_warnings = _score_urgency(
            candidate=candidate,
            effective_time=effective_time,
            now=current_time,
            include_futures=include_futures,
        )
        counts["matched_filters"] += 1
        upcoming.append(
            UpcomingSportsMarket(
                market_id=candidate.market_id,
                question=candidate.question,
                event_title=candidate.event_title,
                vertical=candidate.vertical,
                sport=candidate.sport,
                market_shape=candidate.market_shape,
                research_template_name=candidate.research_template_name,
                close_time=candidate.close_time,
                event_time=(
                    _normalize_datetime(market.event.start_at)
                    if market.event is not None and market.event.start_at is not None
                    else None
                ),
                market_yes_price=candidate.market_yes_price,
                market_no_price=candidate.market_no_price,
                liquidity=candidate.liquidity,
                volume=candidate.volume,
                candidate_score=candidate.candidate_score,
                urgency_score=urgency_score,
                reasons=[*urgency_reasons, *candidate.candidate_reasons],
                warnings=[*urgency_warnings, *candidate.warnings],
                participants=candidate.participants,
            )
        )

    upcoming.sort(
        key=lambda item: (
            item.urgency_score,
            item.candidate_score,
            item.volume or ZERO,
            item.liquidity or ZERO,
            -_timestamp(item.close_time or item.event_time),
        ),
        reverse=True,
    )
    selected = upcoming[: max(limit, 0)]
    counts["returned"] = len(selected)
    return UpcomingSportsSelection(
        items=selected,
        counts=counts,
        filters_applied={
            "sport": normalized_sport,
            "limit": limit,
            "days": safe_days,
            "include_futures": include_futures,
            "market_shape": normalized_shape,
            "focus": normalized_focus,
            "window_start": current_time.isoformat(),
            "window_end": window_end.isoformat(),
        },
    )


def _normalize_focus(value: str | None) -> str:
    if not value:
        return DEFAULT_UPCOMING_FOCUS
    normalized = value.strip().lower().replace("-", "_")
    if normalized in SUPPORTED_UPCOMING_FOCUS:
        return normalized
    return DEFAULT_UPCOMING_FOCUS


def _looks_like_paused_future_title(market: Market) -> bool:
    event_title = market.event.title if market.event is not None else ""
    text = f"{market.question} {event_title}".lower()
    return any(term in text for term in PAUSED_FOCUS_TITLE_TERMS)


def _load_time_window_markets(
    db: Session,
    *,
    now: datetime,
    window_end: datetime,
    sport: str | None,
) -> list[Market]:
    stmt = (
        select(Market)
        .outerjoin(Market.event)
        .options(joinedload(Market.event))
        .where(Market.active.is_(True), Market.closed.is_(False))
        .where(
            or_(
                and_(Market.end_date.is_not(None), Market.end_date >= now, Market.end_date <= window_end),
                and_(Market.end_date.is_(None), Event.start_at >= now, Event.start_at <= window_end),
            )
        )
        .order_by(Market.end_date.asc().nulls_last(), Event.start_at.asc().nulls_last(), Market.id.asc())
    )
    if sport and sport != "other":
        stmt = stmt.where(
            or_(
                Market.sport_type == sport,
                Market.question.ilike(f"%{sport}%"),
            )
        )
    else:
        stmt = stmt.where(
            or_(
                Market.sport_type.is_not(None),
                Event.category == "sports",
            )
        )
    return list(db.scalars(stmt).unique().all())


def _score_urgency(
    *,
    candidate,
    effective_time: datetime,
    now: datetime,
    include_futures: bool,
) -> tuple[Decimal, list[str], list[str]]:
    reasons: list[str] = []
    warnings: list[str] = []
    score = ZERO
    hours_until_close = (effective_time - now).total_seconds() / 3600

    if 0 <= hours_until_close <= 24:
        score += Decimal("30.0000")
        reasons.append("closes_within_24h:+30")
    elif hours_until_close <= 72:
        score += Decimal("22.0000")
        reasons.append("closes_within_72h:+22")
    elif hours_until_close <= 24 * 7:
        score += Decimal("14.0000")
        reasons.append("closes_within_7d:+14")
    else:
        warnings.append("outside_upcoming_window")

    if candidate.market_shape == "match_winner":
        score += Decimal("25.0000")
        reasons.append("match_winner_market:+25")
    elif candidate.market_shape in {"team_prop", "player_prop"}:
        score += Decimal("8.0000")
        reasons.append("sports_prop_market:+8")
    elif candidate.market_shape in FUTURE_SHAPES:
        warnings.append("future_or_championship_market")
        if include_futures:
            score -= Decimal("15.0000")
    elif candidate.market_shape in {"yes_no_generic", "other"}:
        score -= Decimal("8.0000")
        warnings.append("ambiguous_or_generic_market")

    if candidate.market_yes_price is not None and candidate.market_no_price is not None:
        score += Decimal("10.0000")
        reasons.append("valid_price_data:+10")
    else:
        score -= Decimal("5.0000")
        warnings.append("missing_price_data")

    score += _score_depth(candidate.liquidity, label="liquidity", reasons=reasons, warnings=warnings)
    score += _score_depth(candidate.volume, label="volume", reasons=reasons, warnings=warnings)

    if candidate.sport != "other":
        score += Decimal("5.0000")
        reasons.append("known_sport:+5")
    else:
        warnings.append("unknown_sport")

    if candidate.participants:
        score += Decimal("8.0000") if len(candidate.participants) >= 2 else Decimal("3.0000")
        reasons.append("participants_detected:+8" if len(candidate.participants) >= 2 else "participant_detected:+3")
    else:
        warnings.append("participants_not_detected")

    return max(ZERO, min(score, MAX_URGENCY_SCORE)).quantize(Decimal("0.0001")), reasons, warnings


def _score_depth(
    value: Decimal | None,
    *,
    label: str,
    reasons: list[str],
    warnings: list[str],
) -> Decimal:
    if value is None:
        warnings.append(f"{label}_unknown")
        return ZERO
    if value >= Decimal("100000"):
        reasons.append(f"high_{label}:+8")
        return Decimal("8.0000")
    if value >= Decimal("10000"):
        reasons.append(f"medium_{label}:+6")
        return Decimal("6.0000")
    if value > ZERO:
        reasons.append(f"some_{label}:+3")
        return Decimal("3.0000")
    warnings.append(f"zero_{label}")
    return ZERO


def _effective_time(market: Market) -> datetime | None:
    if market.end_date is not None:
        return _normalize_datetime(market.end_date)
    if market.event is not None and market.event.start_at is not None:
        return _normalize_datetime(market.event.start_at)
    return None


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _timestamp(value: datetime | None) -> float:
    if value is None:
        return 0
    return value.timestamp()


def _decimal_to_string(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None
