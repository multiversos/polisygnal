from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from sqlalchemy.orm import Session

from app.repositories.evidence_items import MarketEvidenceSummary, summarize_evidence_for_markets
from app.repositories.markets import list_markets_for_overview
from app.repositories.market_snapshots import list_latest_market_snapshots_for_markets
from app.repositories.predictions import list_latest_predictions_for_markets
from app.schemas.overview import (
    MarketOverviewItem,
    MarketOverviewResponse,
    OverviewEvidenceSummary,
    OverviewFilters,
    OverviewPredictionSummary,
    PriorityBucket,
    OverviewSnapshotSummary,
    ScoringMode,
    OverviewSortBy,
)
from app.schemas.prediction import PredictionMarketSummary

EdgeClass = Literal["no_signal", "moderate", "strong", "review"]


def build_markets_overview(
    db: Session,
    *,
    sport_type: str | None,
    market_type: str | None,
    active: bool | None,
    opportunity_only: bool,
    evidence_eligible_only: bool,
    evidence_only: bool,
    fallback_only: bool,
    bucket: PriorityBucket | None,
    edge_class: EdgeClass | None,
    sort_by: OverviewSortBy,
    limit: int,
    offset: int,
) -> MarketOverviewResponse:
    markets = list_markets_for_overview(
        db,
        sport_type=sport_type,
        market_type=market_type,
        active=active,
    )
    market_ids = [market.id for market in markets]
    latest_predictions = list_latest_predictions_for_markets(db, market_ids)
    latest_snapshots = list_latest_market_snapshots_for_markets(db, market_ids)
    evidence_summaries = summarize_evidence_for_markets(db, market_ids)

    items: list[MarketOverviewItem] = []
    for market in markets:
        latest_prediction = latest_predictions.get(market.id)
        if opportunity_only and not (latest_prediction is not None and latest_prediction.opportunity):
            continue
        if evidence_eligible_only and not market.evidence_eligible:
            continue
        if edge_class is not None and not (
            latest_prediction is not None and latest_prediction.edge_class == edge_class
        ):
            continue

        evidence_summary = evidence_summaries.get(market.id, MarketEvidenceSummary(market_id=market.id))
        if not market.evidence_eligible:
            evidence_summary = MarketEvidenceSummary(market_id=market.id)
        scoring_mode = _resolve_scoring_mode(latest_prediction)
        priority_bucket = _build_priority_bucket(
            evidence_eligible=market.evidence_eligible,
            latest_prediction=latest_prediction,
        )
        if evidence_only and scoring_mode != "evidence_backed":
            continue
        if fallback_only and scoring_mode != "fallback_only":
            continue
        if bucket is not None and priority_bucket != bucket:
            continue
        items.append(
            MarketOverviewItem(
                priority_bucket=priority_bucket,
                scoring_mode=scoring_mode,
                market=PredictionMarketSummary.model_validate(market),
                latest_snapshot=(
                    OverviewSnapshotSummary.model_validate(latest_snapshots[market.id])
                    if market.id in latest_snapshots
                    else None
                ),
                latest_prediction=(
                    _build_prediction_summary(latest_prediction)
                    if latest_prediction is not None
                    else None
                ),
                evidence_summary=OverviewEvidenceSummary(
                    evidence_count=evidence_summary.evidence_count,
                    odds_evidence_count=evidence_summary.odds_evidence_count,
                    news_evidence_count=evidence_summary.news_evidence_count,
                    latest_evidence_at=_normalize_datetime(evidence_summary.latest_evidence_at),
                ),
            )
        )

    items.sort(key=lambda item: _overview_sort_key(item, sort_by))
    ranked_items = [
        item.model_copy(update={"priority_rank": index})
        for index, item in enumerate(items, start=1)
    ]
    total_count = len(ranked_items)
    paginated_items = ranked_items[offset : offset + limit]

    return MarketOverviewResponse(
        filters=OverviewFilters(
            sport_type=sport_type,
            market_type=market_type,
            active=active,
            opportunity_only=opportunity_only,
            evidence_eligible_only=evidence_eligible_only,
            evidence_only=evidence_only,
            fallback_only=fallback_only,
            bucket=bucket,
            edge_class=edge_class,
            sort_by=sort_by,
        ),
        total_count=total_count,
        limit=limit,
        offset=offset,
        items=paginated_items,
    )


def _overview_sort_key(
    item: MarketOverviewItem,
    sort_by: OverviewSortBy,
) -> tuple[int | Decimal | float, ...]:
    prediction = item.latest_prediction
    opportunity_rank = 0 if prediction is not None and prediction.opportunity else 1
    evidence_rank = 0 if item.market.evidence_eligible else 1
    edge_rank = -(prediction.edge_magnitude if prediction is not None else Decimal("0"))
    confidence_rank = -(prediction.confidence_score if prediction is not None else Decimal("0"))
    run_rank = -prediction.run_at.timestamp() if prediction is not None else float("inf")

    if sort_by == "edge_magnitude":
        return (
            edge_rank,
            confidence_rank,
            run_rank,
            opportunity_rank,
            evidence_rank,
            item.market.id,
        )
    if sort_by == "confidence_score":
        return (
            confidence_rank,
            edge_rank,
            run_rank,
            opportunity_rank,
            evidence_rank,
            item.market.id,
        )
    if sort_by == "run_at":
        return (
            run_rank,
            opportunity_rank,
            evidence_rank,
            edge_rank,
            confidence_rank,
            item.market.id,
        )

    return (
        opportunity_rank,
        evidence_rank,
        edge_rank,
        confidence_rank,
        run_rank,
        item.market.id,
    )


def _build_priority_bucket(
    *,
    evidence_eligible: bool,
    latest_prediction: object | None,
) -> PriorityBucket:
    if latest_prediction is None:
        return "no_prediction"
    if bool(getattr(latest_prediction, "opportunity", False)) and evidence_eligible:
        return "priority"
    if bool(getattr(latest_prediction, "opportunity", False)):
        return "review_fallback"
    if evidence_eligible:
        return "watchlist"
    return "fallback_only"


def _resolve_scoring_mode(
    prediction: object | None,
) -> ScoringMode:
    if prediction is None:
        return "no_prediction"
    if bool(getattr(prediction, "used_evidence_in_scoring", False)):
        return "evidence_backed"
    return "fallback_only"


def _build_prediction_summary(prediction: object) -> OverviewPredictionSummary:
    return OverviewPredictionSummary.model_validate(prediction)


def _normalize_datetime(value: object | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None
