from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
import re

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.repositories.market_snapshots import list_latest_market_snapshots_for_markets
from app.services.research.classification import (
    SUPPORTED_MARKET_SHAPES,
    SUPPORTED_SPORTS,
    ResearchMarketClassification,
    classify_market_research_context,
    normalize_market_shape,
    normalize_sport,
    normalize_vertical,
)

MIN_TRADABLE_PRICE = Decimal("0.0500")
MAX_TRADABLE_PRICE = Decimal("0.9500")
DEFAULT_SCAN_LIMIT = 1000
MAX_CANDIDATE_SCORE = Decimal("100.0000")
ZERO = Decimal("0")


@dataclass(frozen=True, slots=True)
class ResearchCandidate:
    market_id: int
    question: str
    event_title: str | None
    vertical: str
    sport: str
    market_shape: str
    research_template_name: str
    market_yes_price: Decimal | None
    market_no_price: Decimal | None
    liquidity: Decimal | None
    volume: Decimal | None
    close_time: datetime | None
    candidate_score: Decimal
    candidate_reasons: list[str]
    warnings: list[str]

    def to_payload(self) -> dict[str, object]:
        return {
            "market_id": self.market_id,
            "question": self.question,
            "event_title": self.event_title,
            "vertical": self.vertical,
            "sport": self.sport,
            "market_shape": self.market_shape,
            "research_template_name": self.research_template_name,
            "market_yes_price": _decimal_to_string(self.market_yes_price),
            "market_no_price": _decimal_to_string(self.market_no_price),
            "liquidity": _decimal_to_string(self.liquidity),
            "volume": _decimal_to_string(self.volume),
            "close_time": self.close_time.isoformat() if self.close_time else None,
            "candidate_score": _decimal_to_string(self.candidate_score),
            "candidate_reasons": list(self.candidate_reasons),
            "warnings": list(self.warnings),
        }


def list_research_candidates(
    db: Session,
    *,
    limit: int = 10,
    vertical: str | None = None,
    sport: str | None = None,
    market_shape: str | None = None,
    now: datetime | None = None,
    scan_limit: int = DEFAULT_SCAN_LIMIT,
) -> list[ResearchCandidate]:
    normalized_vertical = normalize_vertical(vertical) if vertical else None
    normalized_sport = normalize_sport(sport) if sport else None
    normalized_shape = normalize_market_shape(market_shape) if market_shape else None
    current_time = now or datetime.now(tz=UTC)

    markets = _load_candidate_markets(
        db,
        vertical=normalized_vertical,
        sport=normalized_sport,
        scan_limit=max(scan_limit, limit),
    )
    snapshots = list_latest_market_snapshots_for_markets(
        db,
        [market.id for market in markets],
    )
    question_counts = _question_counts(markets)

    candidates: list[ResearchCandidate] = []
    for market in markets:
        classification = classify_market_research_context(market=market)
        if normalized_vertical is not None and classification.vertical != normalized_vertical:
            continue
        if normalized_sport is not None and classification.sport != normalized_sport:
            continue
        if normalized_shape is not None and classification.market_shape != normalized_shape:
            continue
        candidate = build_research_candidate(
            market=market,
            latest_snapshot=snapshots.get(market.id),
            classification=classification,
            duplicate_question_count=question_counts.get(_question_key(market.question), 0),
            now=current_time,
        )
        candidates.append(candidate)

    candidates.sort(
        key=lambda item: (
            item.candidate_score,
            item.volume or ZERO,
            item.liquidity or ZERO,
            -item.market_id,
        ),
        reverse=True,
    )
    return candidates[: max(limit, 0)]


def build_research_candidate(
    *,
    market: Market,
    latest_snapshot: MarketSnapshot | None,
    classification: ResearchMarketClassification | None = None,
    duplicate_question_count: int = 1,
    now: datetime | None = None,
) -> ResearchCandidate:
    current_time = now or datetime.now(tz=UTC)
    resolved_classification = classification or classify_market_research_context(market=market)
    reasons: list[str] = []
    warnings: list[str] = []
    score = ZERO

    if market.active and not market.closed:
        score += Decimal("25.0000")
        reasons.append("market_active_open:+25")
    else:
        warnings.append("market_inactive_or_closed")

    if latest_snapshot is None:
        warnings.append("missing_latest_snapshot")
        yes_price = None
        no_price = None
        liquidity = None
        volume = None
    else:
        yes_price = latest_snapshot.yes_price
        no_price = latest_snapshot.no_price
        liquidity = latest_snapshot.liquidity
        volume = latest_snapshot.volume
        if yes_price is not None and no_price is not None:
            score += Decimal("20.0000")
            reasons.append("valid_latest_snapshot:+20")
        else:
            warnings.append("snapshot_missing_prices")

    if yes_price is not None and MIN_TRADABLE_PRICE <= yes_price <= MAX_TRADABLE_PRICE:
        score += Decimal("10.0000")
        reasons.append("yes_price_in_research_band:+10")
    elif yes_price is None:
        warnings.append("missing_yes_price")
    else:
        warnings.append("yes_price_outside_research_band")

    score += _score_market_depth(
        value=liquidity,
        label="liquidity",
        reasons=reasons,
        warnings=warnings,
    )
    score += _score_market_depth(
        value=volume,
        label="volume",
        reasons=reasons,
        warnings=warnings,
    )
    score += _score_classification(
        market=market,
        classification=resolved_classification,
        reasons=reasons,
        warnings=warnings,
    )
    score += _score_close_time(
        close_time=market.end_date,
        now=current_time,
        reasons=reasons,
        warnings=warnings,
    )

    if duplicate_question_count > 1:
        score -= Decimal("8.0000")
        warnings.append("duplicate_question_detected")

    score = max(ZERO, min(score, MAX_CANDIDATE_SCORE))
    return ResearchCandidate(
        market_id=market.id,
        question=market.question,
        event_title=market.event.title if market.event is not None else None,
        vertical=resolved_classification.vertical,
        sport=resolved_classification.sport,
        market_shape=resolved_classification.market_shape,
        research_template_name=resolved_classification.research_template_name,
        market_yes_price=yes_price,
        market_no_price=no_price,
        liquidity=liquidity,
        volume=volume,
        close_time=market.end_date,
        candidate_score=score.quantize(Decimal("0.0001")),
        candidate_reasons=reasons,
        warnings=warnings,
    )


def _load_candidate_markets(
    db: Session,
    *,
    vertical: str | None,
    sport: str | None,
    scan_limit: int,
) -> list[Market]:
    snapshot_market_ids = _load_snapshot_backed_market_ids(
        db,
        vertical=vertical,
        sport=sport,
        scan_limit=scan_limit,
    )
    missing_count = max(scan_limit - len(snapshot_market_ids), 0)
    fallback_ids = (
        _load_fallback_market_ids(
            db,
            vertical=vertical,
            sport=sport,
            excluded_market_ids=set(snapshot_market_ids),
            limit=missing_count,
        )
        if missing_count
        else []
    )
    ordered_ids = [*snapshot_market_ids, *fallback_ids]
    if not ordered_ids:
        return []

    stmt = select(Market).options(joinedload(Market.event)).where(Market.id.in_(ordered_ids))
    markets_by_id = {market.id: market for market in db.scalars(stmt).unique().all()}
    return [markets_by_id[market_id] for market_id in ordered_ids if market_id in markets_by_id]


def _load_snapshot_backed_market_ids(
    db: Session,
    *,
    vertical: str | None,
    sport: str | None,
    scan_limit: int,
) -> list[int]:
    stmt = (
        select(Market.id)
        .join(MarketSnapshot, MarketSnapshot.market_id == Market.id)
        .where(Market.active.is_(True), Market.closed.is_(False))
        .group_by(Market.id)
        .order_by(func.max(MarketSnapshot.captured_at).desc(), Market.id.asc())
        .limit(scan_limit)
    )
    stmt = _apply_metadata_prefilters(stmt, vertical=vertical, sport=sport)
    return list(db.scalars(stmt).all())


def _load_fallback_market_ids(
    db: Session,
    *,
    vertical: str | None,
    sport: str | None,
    excluded_market_ids: set[int],
    limit: int,
) -> list[int]:
    if limit <= 0:
        return []
    stmt = (
        select(Market.id)
        .where(Market.active.is_(True), Market.closed.is_(False))
        .order_by(Market.updated_at.desc(), Market.id.asc())
        .limit(limit)
    )
    if excluded_market_ids:
        stmt = stmt.where(Market.id.not_in(excluded_market_ids))
    stmt = _apply_metadata_prefilters(stmt, vertical=vertical, sport=sport)
    return list(db.scalars(stmt).all())


def _apply_metadata_prefilters(stmt, *, vertical: str | None, sport: str | None):
    if sport and sport != "other":
        stmt = stmt.where(
            or_(
                Market.sport_type == sport,
                Market.question.ilike(f"%{sport}%"),
            )
        )
    elif vertical == "sports":
        stmt = stmt.outerjoin(Market.event).where(
            or_(
                Market.sport_type.is_not(None),
                Event.category == "sports",
            )
        )
    return stmt


def _score_market_depth(
    *,
    value: Decimal | None,
    label: str,
    reasons: list[str],
    warnings: list[str],
) -> Decimal:
    if value is None:
        warnings.append(f"{label}_unknown")
        return ZERO
    if value >= Decimal("100000"):
        reasons.append(f"high_{label}:+10")
        return Decimal("10.0000")
    if value >= Decimal("10000"):
        reasons.append(f"medium_{label}:+8")
        return Decimal("8.0000")
    if value >= Decimal("1000"):
        reasons.append(f"usable_{label}:+5")
        return Decimal("5.0000")
    if value > ZERO:
        warnings.append(f"low_{label}")
        return Decimal("2.0000")
    warnings.append(f"zero_{label}")
    return ZERO


def _score_classification(
    *,
    market: Market,
    classification: ResearchMarketClassification,
    reasons: list[str],
    warnings: list[str],
) -> Decimal:
    score = ZERO
    event_category = (
        market.event.category.strip().lower()
        if market.event is not None and market.event.category
        else None
    )
    has_sports_metadata = bool(market.sport_type) or event_category == "sports"
    if classification.vertical == "sports":
        if has_sports_metadata:
            score += Decimal("8.0000")
            reasons.append("sports_metadata_present:+8")
        else:
            score -= Decimal("20.0000")
            warnings.append("sports_inferred_from_text_only")
    elif classification.vertical == "other":
        warnings.append("non_sports_vertical")

    if classification.sport in SUPPORTED_SPORTS and classification.sport != "other":
        score += Decimal("5.0000")
        reasons.append("supported_sport:+5")
    else:
        score -= Decimal("5.0000")
        warnings.append("unclear_or_other_sport")

    if (
        classification.market_shape in SUPPORTED_MARKET_SHAPES
        and classification.market_shape not in {"other", "yes_no_generic"}
    ):
        score += Decimal("5.0000")
        reasons.append("supported_market_shape:+5")
    else:
        score -= Decimal("5.0000")
        warnings.append("unclear_or_generic_market_shape")

    if classification.research_template_name not in {"generic_market", "sports_generic"}:
        score += Decimal("5.0000")
        reasons.append("specific_research_template:+5")
    else:
        warnings.append("generic_research_template")

    if market.market_type:
        score += Decimal("4.0000")
        reasons.append("market_type_present:+4")
    else:
        warnings.append("missing_market_type")

    if not has_sports_metadata and _looks_political_or_non_sports(market.question):
        score -= Decimal("15.0000")
        warnings.append("possible_non_sports_market")

    return score


def _score_close_time(
    *,
    close_time: datetime | None,
    now: datetime,
    reasons: list[str],
    warnings: list[str],
) -> Decimal:
    if close_time is None:
        warnings.append("close_time_unknown")
        return Decimal("2.0000")
    normalized_close_time = close_time
    if normalized_close_time.tzinfo is None:
        normalized_close_time = normalized_close_time.replace(tzinfo=UTC)
    if normalized_close_time > now:
        reasons.append("future_close_time:+5")
        return Decimal("5.0000")
    warnings.append("past_close_time")
    return Decimal("-10.0000")


def _question_counts(markets: list[Market]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for market in markets:
        key = _question_key(market.question)
        counts[key] = counts.get(key, 0) + 1
    return counts


def _question_key(question: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", " ", question.lower())
    return " ".join(normalized.split())


def _looks_political_or_non_sports(question: str) -> bool:
    normalized = f" {_question_key(question)} "
    hints = (
        " election ",
        " presidential ",
        " primary ",
        " mayoral ",
        " gubernatorial ",
        " senate ",
        " chamber of deputies ",
    )
    return any(hint in normalized for hint in hints)


def _decimal_to_string(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None
