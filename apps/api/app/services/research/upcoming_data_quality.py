from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.external_market_signal import ExternalMarketSignal
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.repositories.market_snapshots import list_latest_market_snapshots_for_markets
from app.schemas.market_freshness import MarketFreshnessRead
from app.services.market_freshness import build_market_freshness
from app.services.research.upcoming_market_selector import (
    DEFAULT_UPCOMING_FOCUS,
    list_upcoming_sports_markets,
)


COMPLETE_LABEL = "Completo"
PARTIAL_LABEL = "Parcial"
INSUFFICIENT_LABEL = "Insuficiente"
UNCERTAIN_SHAPES = {"other", "yes_no_generic"}


@dataclass(frozen=True, slots=True)
class UpcomingDataQualityItem:
    market_id: int
    question: str
    sport: str
    market_shape: str
    close_time: datetime | None
    has_snapshot: bool
    has_yes_price: bool
    has_no_price: bool
    has_liquidity: bool
    has_volume: bool
    has_external_signal: bool
    has_prediction: bool
    has_research: bool
    has_polysignal_score: bool
    missing_fields: list[str]
    quality_score: int
    quality_label: str
    warnings: list[str]
    freshness: MarketFreshnessRead | None = None

    def to_payload(self) -> dict[str, object]:
        return {
            "market_id": self.market_id,
            "question": self.question,
            "sport": self.sport,
            "market_shape": self.market_shape,
            "close_time": self.close_time.isoformat() if self.close_time else None,
            "has_snapshot": self.has_snapshot,
            "has_yes_price": self.has_yes_price,
            "has_no_price": self.has_no_price,
            "has_liquidity": self.has_liquidity,
            "has_volume": self.has_volume,
            "has_external_signal": self.has_external_signal,
            "has_prediction": self.has_prediction,
            "has_research": self.has_research,
            "has_polysignal_score": self.has_polysignal_score,
            "missing_fields": list(self.missing_fields),
            "quality_score": self.quality_score,
            "quality_label": self.quality_label,
            "warnings": list(self.warnings),
            "freshness": (
                self.freshness.model_dump()
                if self.freshness is not None
                else None
            ),
        }


@dataclass(frozen=True, slots=True)
class UpcomingDataQualitySelection:
    summary: dict[str, int]
    items: list[UpcomingDataQualityItem]
    filters_applied: dict[str, object]


def list_upcoming_data_quality(
    db: Session,
    *,
    sport: str | None = None,
    days: int = 7,
    limit: int = 50,
    focus: str | None = DEFAULT_UPCOMING_FOCUS,
    now: datetime | None = None,
) -> UpcomingDataQualitySelection:
    current_time = _normalize_datetime(now or datetime.now(tz=UTC))
    safe_limit = max(limit, 0)
    selection = list_upcoming_sports_markets(
        db,
        sport=sport,
        limit=safe_limit,
        days=days,
        include_futures=False,
        focus=focus,
        now=current_time,
    )
    market_ids = [item.market_id for item in selection.items]
    snapshots = list_latest_market_snapshots_for_markets(db, market_ids)
    external_market_ids = _existing_market_ids(
        db,
        select(ExternalMarketSignal.polymarket_market_id).where(
            ExternalMarketSignal.polymarket_market_id.in_(market_ids)
        ),
    )
    prediction_market_ids = _existing_market_ids(
        db,
        select(Prediction.market_id).where(Prediction.market_id.in_(market_ids)),
    )
    research_market_ids = _existing_market_ids(
        db,
        select(ResearchRun.market_id).where(ResearchRun.market_id.in_(market_ids)),
    )

    items = [
        build_market_data_quality(
            market_id=item.market_id,
            question=item.question,
            sport=item.sport,
            market_shape=item.market_shape,
            close_time=item.close_time,
            market_yes_price=item.market_yes_price,
            market_no_price=item.market_no_price,
            liquidity=item.liquidity,
            volume=item.volume,
            polysignal_score=item.polysignal_score,
            has_snapshot=item.market_id in snapshots,
            has_external_signal=item.market_id in external_market_ids,
            has_prediction=item.market_id in prediction_market_ids,
            has_research=item.market_id in research_market_ids,
            latest_snapshot=snapshots.get(item.market_id),
            now=current_time,
        )
        for item in selection.items
    ]
    return UpcomingDataQualitySelection(
        summary=_build_summary(items),
        items=items,
        filters_applied={
            "sport": selection.filters_applied.get("sport"),
            "days": selection.filters_applied.get("days"),
            "limit": safe_limit,
            "include_futures": False,
            "focus": selection.filters_applied.get("focus"),
            "window_start": selection.filters_applied.get("window_start"),
            "window_end": selection.filters_applied.get("window_end"),
        },
    )


def build_market_data_quality(
    *,
    market_id: int,
    question: str,
    sport: str,
    market_shape: str,
    close_time: datetime | None,
    market_yes_price,
    market_no_price,
    liquidity,
    volume,
    polysignal_score,
    has_snapshot: bool,
    has_external_signal: bool,
    has_prediction: bool,
    has_research: bool,
    latest_snapshot=None,
    active: bool | None = None,
    closed: bool | None = None,
    now: datetime | None = None,
) -> UpcomingDataQualityItem:
    missing_fields: list[str] = []
    warnings: list[str] = []

    has_yes_price = market_yes_price is not None
    has_no_price = market_no_price is not None
    has_liquidity = liquidity is not None
    has_volume = volume is not None
    has_polysignal_score = (
        polysignal_score is not None
        and polysignal_score.score_probability is not None
    )

    if close_time is None:
        missing_fields.append("close_time")
        warnings.append("missing_close_time")
    if not has_snapshot:
        missing_fields.append("snapshot")
        warnings.append("missing_snapshot")
    if not has_yes_price:
        missing_fields.append("yes_price")
    if not has_no_price:
        missing_fields.append("no_price")
    if not has_yes_price or not has_no_price:
        warnings.append("missing_price")
    if not has_liquidity:
        missing_fields.append("liquidity")
        warnings.append("missing_liquidity")
    if not has_volume:
        missing_fields.append("volume")
        warnings.append("missing_volume")
    if sport == "other":
        missing_fields.append("sport")
        warnings.append("sport_uncertain")
    if market_shape in UNCERTAIN_SHAPES:
        missing_fields.append("market_shape")
        warnings.append("market_shape_uncertain")
    if not has_polysignal_score:
        missing_fields.append("polysignal_score")
        warnings.append("polysignal_score_pending")

    quality_score = _quality_score(
        has_snapshot=has_snapshot,
        has_yes_price=has_yes_price,
        has_no_price=has_no_price,
        has_liquidity=has_liquidity,
        has_volume=has_volume,
        has_close_time=close_time is not None,
        has_known_sport=sport != "other",
        has_clear_shape=market_shape not in UNCERTAIN_SHAPES,
        has_polysignal_score=has_polysignal_score,
    )
    quality_label = _quality_label(
        score=quality_score,
        has_snapshot=has_snapshot,
        has_yes_price=has_yes_price,
        has_no_price=has_no_price,
        has_close_time=close_time is not None,
        has_known_sport=sport != "other",
        has_clear_shape=market_shape not in UNCERTAIN_SHAPES,
        has_polysignal_score=has_polysignal_score,
    )
    freshness = build_market_freshness(
        close_time=close_time,
        latest_snapshot=latest_snapshot,
        yes_price=market_yes_price,
        no_price=market_no_price,
        active=active,
        closed=closed,
        data_quality_label=quality_label,
        now=now,
    )

    return UpcomingDataQualityItem(
        market_id=market_id,
        question=question,
        sport=sport,
        market_shape=market_shape,
        close_time=close_time,
        has_snapshot=has_snapshot,
        has_yes_price=has_yes_price,
        has_no_price=has_no_price,
        has_liquidity=has_liquidity,
        has_volume=has_volume,
        has_external_signal=has_external_signal,
        has_prediction=has_prediction,
        has_research=has_research,
        has_polysignal_score=has_polysignal_score,
        missing_fields=missing_fields,
        quality_score=quality_score,
        quality_label=quality_label,
        warnings=_dedupe(warnings),
        freshness=freshness,
    )


def _quality_score(
    *,
    has_snapshot: bool,
    has_yes_price: bool,
    has_no_price: bool,
    has_liquidity: bool,
    has_volume: bool,
    has_close_time: bool,
    has_known_sport: bool,
    has_clear_shape: bool,
    has_polysignal_score: bool,
) -> int:
    score = 100
    if not has_snapshot:
        score -= 25
    if not has_yes_price:
        score -= 15
    if not has_no_price:
        score -= 15
    if not has_close_time:
        score -= 10
    if not has_known_sport:
        score -= 10
    if not has_clear_shape:
        score -= 10
    if not has_polysignal_score:
        score -= 10
    if not has_liquidity:
        score -= 5
    if not has_volume:
        score -= 5
    return max(0, min(100, score))


def _quality_label(
    *,
    score: int,
    has_snapshot: bool,
    has_yes_price: bool,
    has_no_price: bool,
    has_close_time: bool,
    has_known_sport: bool,
    has_clear_shape: bool,
    has_polysignal_score: bool,
) -> str:
    key_fields_complete = all(
        [
            has_snapshot,
            has_yes_price,
            has_no_price,
            has_close_time,
            has_known_sport,
            has_clear_shape,
            has_polysignal_score,
        ]
    )
    if score >= 80 and key_fields_complete:
        return COMPLETE_LABEL
    if score >= 45:
        return PARTIAL_LABEL
    return INSUFFICIENT_LABEL


def _build_summary(items: list[UpcomingDataQualityItem]) -> dict[str, int]:
    return {
        "total": len(items),
        "complete_count": sum(1 for item in items if item.quality_label == COMPLETE_LABEL),
        "partial_count": sum(1 for item in items if item.quality_label == PARTIAL_LABEL),
        "insufficient_count": sum(1 for item in items if item.quality_label == INSUFFICIENT_LABEL),
        "missing_price_count": sum(
            1 for item in items if not item.has_yes_price or not item.has_no_price
        ),
        "missing_snapshot_count": sum(1 for item in items if not item.has_snapshot),
        "missing_close_time_count": sum(1 for item in items if item.close_time is None),
        "sport_other_count": sum(1 for item in items if item.sport == "other"),
    }


def _existing_market_ids(db: Session, stmt) -> set[int]:
    return {market_id for market_id in db.scalars(stmt).all() if market_id is not None}


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result
