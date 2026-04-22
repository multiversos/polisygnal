from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from app.clients.espn_rss import EspnNewsItem, EspnRssClient, EspnRssClientError
from app.clients.the_odds_api import TheOddsApiClient, TheOddsApiClientError, parse_iso_datetime
from app.core.config import Settings
from app.models.market import Market
from app.repositories.evidence_items import upsert_evidence_item
from app.repositories.markets import list_nba_winner_evidence_candidates
from app.repositories.sources import upsert_source
from app.services.nba_team_matching import (
    EvidenceMarketAssessment,
    OddsEventMatch,
    assess_market_for_evidence,
    canonicalize_nba_team_name,
    is_relevant_news_item,
    match_market_to_odds_event,
)

CONFIDENCE_SCALE = Decimal("0.00")
STRENGTH_SCALE = Decimal("0.0001")
ONE = Decimal("1")


@dataclass(slots=True)
class EvidenceFetchContext:
    fetched_at: datetime
    odds_events: list[dict[str, object]]
    news_items: list[EspnNewsItem]
    partial_errors: list[str] = field(default_factory=list)
    odds_available: bool = True
    odds_missing_api_key: bool = False


@dataclass(slots=True)
class EvidencePipelineSummary:
    markets_considered: int = 0
    markets_eligible_for_evidence: int = 0
    markets_processed: int = 0
    markets_matchup_shape: int = 0
    markets_futures_shape: int = 0
    markets_ambiguous_shape: int = 0
    markets_skipped_non_matchable: int = 0
    markets_skipped_unsupported_shape: int = 0
    sources_created: int = 0
    sources_updated: int = 0
    evidence_created: int = 0
    evidence_updated: int = 0
    markets_with_odds_match: int = 0
    markets_with_news_match: int = 0
    odds_matches: int = 0
    odds_missing_api_key: int = 0
    odds_no_match: int = 0
    news_items_matched: int = 0
    skipped_markets: list[dict[str, object]] = field(default_factory=list)
    partial_errors: list[str] = field(default_factory=list)


def fetch_evidence_context(
    *,
    settings: Settings,
    odds_client: TheOddsApiClient,
    news_client: EspnRssClient,
) -> EvidenceFetchContext:
    context = EvidenceFetchContext(
        fetched_at=datetime.now(tz=UTC),
        odds_events=[],
        news_items=[],
    )

    if odds_client.is_configured():
        try:
            context.odds_events = odds_client.fetch_nba_odds(
                regions=settings.odds_api_regions,
                markets=settings.odds_api_markets,
            )
        except TheOddsApiClientError as exc:
            context.odds_available = False
            context.partial_errors.append(str(exc))
    else:
        context.odds_available = False
        context.odds_missing_api_key = True
        context.partial_errors.append("ODDS_API_KEY no esta configurada; odds se omitira en esta corrida.")

    try:
        context.news_items = news_client.fetch_nba_news()
    except EspnRssClientError as exc:
        context.partial_errors.append(str(exc))

    return context


def capture_market_evidence(
    db: Session,
    *,
    market: Market,
    settings: Settings,
    context: EvidenceFetchContext,
) -> EvidencePipelineSummary:
    summary = EvidencePipelineSummary(markets_considered=1)
    assessment = assess_market_for_evidence(market.question)
    _apply_market_shape_metrics(summary, assessment)

    if not assessment.eligible:
        _apply_skip_metrics(summary, market=market, assessment=assessment)
        return summary

    summary.markets_eligible_for_evidence = 1
    summary.markets_processed = 1

    if context.odds_available:
        odds_result = _persist_odds_evidence(
            db,
            market=market,
            settings=settings,
            odds_events=context.odds_events,
            fetched_at=context.fetched_at,
        )
        _merge_summary(summary, odds_result)
    elif context.odds_missing_api_key:
        summary.odds_missing_api_key += 1

    news_result = _persist_news_evidence(
        db,
        market=market,
        settings=settings,
        news_items=context.news_items,
        teams=assessment.teams,
        fetched_at=context.fetched_at,
    )
    _merge_summary(summary, news_result)
    return summary


def capture_nba_winner_evidence(
    db: Session,
    *,
    settings: Settings,
    odds_client: TheOddsApiClient,
    news_client: EspnRssClient,
    limit: int | None = None,
) -> EvidencePipelineSummary:
    markets = list_nba_winner_evidence_candidates(db, limit=limit)
    summary = EvidencePipelineSummary(markets_considered=len(markets))
    context = fetch_evidence_context(
        settings=settings,
        odds_client=odds_client,
        news_client=news_client,
    )
    summary.partial_errors.extend(context.partial_errors)

    for market in markets:
        try:
            with db.begin_nested():
                market_summary = capture_market_evidence(
                    db,
                    market=market,
                    settings=settings,
                    context=context,
                )
            _merge_summary(summary, market_summary, include_considered=False)
        except Exception as exc:
            summary.partial_errors.append(
                f"Market {market.id}: error procesando pipeline de evidencia: {exc}"
            )

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        summary.partial_errors.append(f"Error confirmando evidencia en base: {exc}")

    return summary


def _persist_odds_evidence(
    db: Session,
    *,
    market: Market,
    settings: Settings,
    odds_events: list[dict[str, object]],
    fetched_at: datetime,
) -> EvidencePipelineSummary:
    summary = EvidencePipelineSummary()
    match = match_market_to_odds_event(market.question, odds_events)
    if match is None:
        summary.odds_no_match = 1
        return summary

    bookmaker_entries = _extract_bookmaker_probabilities(match)
    if not bookmaker_entries:
        summary.odds_no_match = 1
        return summary

    raw_event = match.matched_event
    external_id = _as_text(raw_event.get("id"))
    if not external_id:
        summary.partial_errors.append(
            f"Market {market.id}: el evento de The Odds API no trae id usable."
        )
        return summary

    published_at = _latest_odds_update(raw_event)
    source, source_created = upsert_source(
        db,
        market_id=market.id,
        provider="the_odds_api",
        source_type="odds",
        external_id=external_id,
        title=_format_odds_event_title(raw_event),
        url=None,
        published_at=published_at,
        fetched_at=fetched_at,
        raw_json=raw_event,
        raw_text=None,
    )
    if source_created:
        summary.sources_created += 1
    else:
        summary.sources_updated += 1

    implied_probabilities = [entry["implied_prob"] for entry in bookmaker_entries]
    bookmaker_count = len(implied_probabilities)
    mean_implied_prob = _mean_decimal(implied_probabilities)
    confidence = _confidence_from_bookmaker_count(bookmaker_count)
    stance = _stance_from_probability(mean_implied_prob)
    contradiction_delta = Decimal(str(settings.odds_high_contradiction_delta))
    high_contradiction = (
        bookmaker_count >= 2 and (max(implied_probabilities) - min(implied_probabilities)) >= contradiction_delta
    )
    summary_text = (
        f"The Odds API h2h para {match.target_team} desde {bookmaker_count} bookmaker(s) "
        f"implica {mean_implied_prob.quantize(STRENGTH_SCALE, rounding=ROUND_HALF_UP)} "
        f"en el evento {_format_odds_event_title(raw_event)}."
    )
    metadata = {
        "target_team": match.target_team,
        "mentioned_teams": match.mentioned_teams,
        "matched_event_id": external_id,
        "match_reason": match.match_reason,
        "home_team": _as_text(raw_event.get("home_team")),
        "away_team": _as_text(raw_event.get("away_team")),
        "commence_time": _serialize_datetime(parse_iso_datetime(raw_event.get("commence_time"))),
        "bookmakers": [
            {
                "bookmaker": entry["bookmaker"],
                "american_price": str(entry["american_price"]),
                "implied_prob": str(
                    entry["implied_prob"].quantize(STRENGTH_SCALE, rounding=ROUND_HALF_UP)
                ),
            }
            for entry in bookmaker_entries
        ],
        "mean_implied_prob": str(mean_implied_prob.quantize(STRENGTH_SCALE, rounding=ROUND_HALF_UP)),
        "max_implied_prob": str(max(implied_probabilities).quantize(STRENGTH_SCALE, rounding=ROUND_HALF_UP)),
        "min_implied_prob": str(min(implied_probabilities).quantize(STRENGTH_SCALE, rounding=ROUND_HALF_UP)),
    }
    _, evidence_created = upsert_evidence_item(
        db,
        market_id=market.id,
        source_id=source.id,
        provider="the_odds_api",
        evidence_type="odds",
        stance=stance,
        strength=mean_implied_prob.quantize(STRENGTH_SCALE, rounding=ROUND_HALF_UP),
        confidence=confidence,
        summary=summary_text,
        high_contradiction=high_contradiction,
        bookmaker_count=bookmaker_count,
        metadata_json=metadata,
    )
    if evidence_created:
        summary.evidence_created += 1
    else:
        summary.evidence_updated += 1
    summary.odds_matches = 1
    summary.markets_with_odds_match = 1
    return summary


def _persist_news_evidence(
    db: Session,
    *,
    market: Market,
    settings: Settings,
    news_items: list[EspnNewsItem],
    teams: list[str],
    fetched_at: datetime,
) -> EvidencePipelineSummary:
    summary = EvidencePipelineSummary()
    matched_items = [
        item for item in news_items if is_relevant_news_item(item.raw_text, teams)
    ]
    summary.news_items_matched = len(matched_items)
    if matched_items:
        summary.markets_with_news_match = 1

    for item in matched_items:
        raw_text = item.raw_text.strip()
        if not raw_text:
            continue

        source, source_created = upsert_source(
            db,
            market_id=market.id,
            provider="espn_rss",
            source_type="news",
            external_id=item.url,
            title=item.title,
            url=item.url,
            published_at=item.published_at,
            fetched_at=fetched_at,
            raw_json=item.raw_json,
            raw_text=raw_text,
        )
        if source_created:
            summary.sources_created += 1
        else:
            summary.sources_updated += 1

        summary_text = _truncate_summary(raw_text, settings.evidence_news_summary_max_length)
        metadata = {
            "matched_teams": teams,
            "url": item.url,
            "published_at": _serialize_datetime(item.published_at),
        }
        _, evidence_created = upsert_evidence_item(
            db,
            market_id=market.id,
            source_id=source.id,
            provider="espn_rss",
            evidence_type="news",
            stance="unknown",
            strength=None,
            confidence=None,
            summary=summary_text,
            high_contradiction=False,
            bookmaker_count=None,
            metadata_json=metadata,
        )
        if evidence_created:
            summary.evidence_created += 1
        else:
            summary.evidence_updated += 1

    return summary


def _extract_bookmaker_probabilities(match: OddsEventMatch) -> list[dict[str, object]]:
    raw_event = match.matched_event
    bookmakers = raw_event.get("bookmakers")
    if not isinstance(bookmakers, list):
        return []

    bookmaker_entries: list[dict[str, object]] = []
    for bookmaker in bookmakers:
        if not isinstance(bookmaker, dict):
            continue
        bookmaker_title = _as_text(bookmaker.get("title")) or _as_text(bookmaker.get("key"))
        markets = bookmaker.get("markets")
        if not isinstance(markets, list):
            continue

        implied_prob = None
        american_price_value = None
        for market_entry in markets:
            if not isinstance(market_entry, dict):
                continue
            if _as_text(market_entry.get("key")) != "h2h":
                continue
            outcomes = market_entry.get("outcomes")
            if not isinstance(outcomes, list):
                continue
            for outcome in outcomes:
                if not isinstance(outcome, dict):
                    continue
                outcome_name = _as_text(outcome.get("name"))
                if canonicalize_nba_team_name(outcome_name) != match.target_team:
                    continue
                american_price_value = _parse_american_odds(outcome.get("price"))
                if american_price_value is None:
                    continue
                implied_prob = american_odds_to_probability(american_price_value)
                break
            if implied_prob is not None:
                break

        if implied_prob is None or american_price_value is None or not bookmaker_title:
            continue
        bookmaker_entries.append(
            {
                "bookmaker": bookmaker_title,
                "american_price": american_price_value,
                "implied_prob": implied_prob,
            }
        )

    return bookmaker_entries


def american_odds_to_probability(american_odds: Decimal) -> Decimal:
    if american_odds > 0:
        return Decimal("100") / (american_odds + Decimal("100"))
    return abs(american_odds) / (abs(american_odds) + Decimal("100"))


def _confidence_from_bookmaker_count(bookmaker_count: int) -> Decimal | None:
    if bookmaker_count <= 0:
        return None
    if bookmaker_count == 1:
        return Decimal("0.25")
    if bookmaker_count == 2:
        return Decimal("0.50")
    if 3 <= bookmaker_count <= 4:
        return Decimal("0.75")
    return Decimal("1.00")


def _stance_from_probability(implied_prob: Decimal) -> str:
    if implied_prob >= Decimal("0.55"):
        return "favor"
    if implied_prob <= Decimal("0.45"):
        return "against"
    return "neutral"


def _latest_odds_update(raw_event: dict[str, object]) -> datetime | None:
    bookmakers = raw_event.get("bookmakers")
    latest: datetime | None = None
    if not isinstance(bookmakers, list):
        return None
    for bookmaker in bookmakers:
        if not isinstance(bookmaker, dict):
            continue
        candidates = [parse_iso_datetime(bookmaker.get("last_update"))]
        markets = bookmaker.get("markets")
        if isinstance(markets, list):
            candidates.extend(
                parse_iso_datetime(market_entry.get("last_update"))
                for market_entry in markets
                if isinstance(market_entry, dict)
            )
        for candidate in candidates:
            if candidate is not None and (latest is None or candidate > latest):
                latest = candidate
    return latest


def _format_odds_event_title(raw_event: dict[str, object]) -> str:
    home_team = _as_text(raw_event.get("home_team")) or "Unknown home team"
    away_team = _as_text(raw_event.get("away_team")) or "Unknown away team"
    return f"{away_team} at {home_team}"


def _truncate_summary(value: str, max_length: int) -> str:
    collapsed = " ".join(value.split())
    if len(collapsed) <= max_length:
        return collapsed
    return collapsed[: max(max_length - 3, 1)].rstrip() + "..."


def _parse_american_odds(value: object) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int | float):
        return Decimal(str(value))
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return Decimal(stripped)
        except Exception:
            return None
    return None


def _mean_decimal(probabilities: list[Decimal]) -> Decimal:
    return sum(probabilities) / Decimal(len(probabilities))


def _serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _merge_summary(
    target: EvidencePipelineSummary,
    source: EvidencePipelineSummary,
    *,
    include_considered: bool = True,
) -> None:
    if include_considered:
        target.markets_considered += source.markets_considered
    target.markets_eligible_for_evidence += source.markets_eligible_for_evidence
    target.markets_processed += source.markets_processed
    target.markets_matchup_shape += source.markets_matchup_shape
    target.markets_futures_shape += source.markets_futures_shape
    target.markets_ambiguous_shape += source.markets_ambiguous_shape
    target.markets_skipped_non_matchable += source.markets_skipped_non_matchable
    target.markets_skipped_unsupported_shape += source.markets_skipped_unsupported_shape
    target.sources_created += source.sources_created
    target.sources_updated += source.sources_updated
    target.evidence_created += source.evidence_created
    target.evidence_updated += source.evidence_updated
    target.markets_with_odds_match += source.markets_with_odds_match
    target.markets_with_news_match += source.markets_with_news_match
    target.odds_matches += source.odds_matches
    target.odds_missing_api_key += source.odds_missing_api_key
    target.odds_no_match += source.odds_no_match
    target.news_items_matched += source.news_items_matched
    target.skipped_markets.extend(source.skipped_markets)
    target.partial_errors.extend(source.partial_errors)


def _as_text(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)


def _apply_market_shape_metrics(
    summary: EvidencePipelineSummary,
    assessment: EvidenceMarketAssessment,
) -> None:
    if assessment.shape == "matchup":
        summary.markets_matchup_shape += 1
    elif assessment.shape == "futures":
        summary.markets_futures_shape += 1
    else:
        summary.markets_ambiguous_shape += 1


def _apply_skip_metrics(
    summary: EvidencePipelineSummary,
    *,
    market: Market,
    assessment: EvidenceMarketAssessment,
) -> None:
    if assessment.shape == "futures":
        summary.markets_skipped_non_matchable += 1
    else:
        summary.markets_skipped_unsupported_shape += 1

    summary.skipped_markets.append(
        {
            "market_id": market.id,
            "question": market.question,
            "shape": assessment.shape,
            "skip_reason": assessment.skip_reason,
            "teams": assessment.teams,
        }
    )
