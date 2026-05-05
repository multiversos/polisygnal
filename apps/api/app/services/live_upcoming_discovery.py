from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
import re

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.clients.polymarket import (
    PolymarketEventPayload,
    PolymarketGammaClient,
    PolymarketMarketPayload,
)
from app.models.market import Market
from app.repositories.market_snapshots import list_latest_market_snapshots_for_markets
from app.schemas.live_upcoming_discovery import (
    LiveUpcomingEventGroup,
    LiveUpcomingEventMarketSummary,
    LiveUpcomingDiscoveryItem,
    LiveUpcomingDiscoveryResponse,
    LiveUpcomingDiscoverySummary,
)
from app.services.research.classification import (
    classify_market_research_context,
    normalize_market_shape,
    normalize_sport,
)
from app.services.research.upcoming_market_selector import PAUSED_FOCUS_TITLE_TERMS


DEFAULT_FOCUS = "match_winner"
SUPPORTED_FOCUS = {"match_winner", "all"}
FUTURE_SHAPES = {"championship", "futures"}
ZERO = Decimal("0")
ESPORTS_TERMS = (
    "counter-strike",
    "cs2",
    "league of legends",
    "lol:",
    "honor of kings",
    "dota",
    "valorant",
    "esports",
)
NON_PRIMARY_DISCOVERY_TERMS = (
    "1h moneyline",
    "first half",
    "second half",
    "map 1",
    "map 2",
    "map 3",
    "map handicap",
    "game handicap",
    "game 1 winner",
    "game 2 winner",
    "game 3 winner",
    "game 4 winner",
    "game 5 winner",
    "game 6 winner",
    "odd/even",
    "total kills",
    "total rounds",
)


def discover_live_upcoming_markets(
    db: Session,
    *,
    client: PolymarketGammaClient,
    sport: str | None = None,
    days: int = 7,
    limit: int = 50,
    pages: int = 1,
    include_futures: bool = False,
    focus: str | None = DEFAULT_FOCUS,
    min_hours_to_close: float | None = None,
    source_tag_id: str | None = None,
    include_debug: bool = False,
    now: datetime | None = None,
) -> LiveUpcomingDiscoveryResponse:
    current_time = _normalize_datetime(now or datetime.now(tz=UTC))
    safe_days = max(days, 1)
    safe_limit = max(min(limit, 100), 0)
    safe_pages = max(min(pages, 10), 1)
    normalized_sport = normalize_sport(sport) if sport else None
    normalized_focus = _normalize_focus(focus)
    warnings: list[str] = []
    min_close_time = current_time + timedelta(hours=max(min_hours_to_close or 0, 0))

    window_end = current_time + timedelta(days=safe_days)
    page_limit = min(max(safe_limit * 2, 10), 100)
    remote_events: list[PolymarketEventPayload] = []
    next_offset: int | None = 0
    pages_fetched = 0
    while next_offset is not None and pages_fetched < safe_pages:
        page = client.fetch_active_events_page(
            limit=page_limit,
            offset=next_offset,
            tag_id=source_tag_id,
            order="endDate",
            ascending=True,
            end_date_min=min_close_time,
            end_date_max=window_end,
        )
        pages_fetched += 1
        warnings.extend(page.errors)
        remote_events.extend(page.events)
        next_offset = page.next_offset
    remote_entries = _flatten_remote_markets(remote_events)
    local_markets = _load_matching_local_markets(db, remote_entries)
    snapshots = list_latest_market_snapshots_for_markets(
        db,
        [market.id for market in local_markets.values()],
    )

    items: list[LiveUpcomingDiscoveryItem] = []
    summary = LiveUpcomingDiscoverySummary(total_remote_checked=len(remote_entries))
    for event_payload, market_payload in remote_entries:
        question = _safe_text(market_payload.question) or "Mercado sin pregunta"
        event_title = _safe_text(event_payload.title)
        event_context = _combined_text(event_title, event_payload.slug, market_payload.slug)
        close_time = _effective_close_time(event_payload, market_payload)
        classification = classify_market_research_context(
            question=question,
            event_title=event_context,
            event_category=event_payload.category,
        )
        if normalized_sport is not None and classification.sport != normalized_sport:
            continue
        if close_time is None:
            continue
        close_time = _normalize_datetime(close_time)
        if close_time < min_close_time or close_time > window_end:
            continue

        local_market = _find_local_market(
            local_markets,
            event_payload=event_payload,
            market_payload=market_payload,
        )
        snapshot = snapshots.get(local_market.id) if local_market is not None else None
        has_local_snapshot = snapshot is not None
        has_local_price = bool(
            snapshot is not None and snapshot.yes_price is not None and snapshot.no_price is not None
        )
        remote_prices = _remote_prices(market_payload)
        has_remote_price = len(remote_prices) >= 2
        if has_remote_price:
            summary.remote_with_price_count += 1
        else:
            summary.remote_missing_price_count += 1
        if _safe_text(market_payload.condition_id) is not None:
            summary.remote_with_condition_id_count += 1
        if _clean_string_list(market_payload.clob_token_ids):
            summary.remote_with_clob_token_ids_count += 1
        if local_market is not None:
            summary.already_local_count += 1
            if not has_local_snapshot or not has_local_price:
                summary.local_missing_snapshot_count += 1
        else:
            summary.missing_local_count += 1

        reasons: list[str] = []
        item_warnings: list[str] = []
        unsupported_reason = _unsupported_reason(
            question=question,
            event_title=event_title,
            classification_sport=classification.sport,
            market_shape=classification.market_shape,
            include_futures=include_futures,
            focus=normalized_focus,
        )
        if unsupported_reason is not None:
            status = "unsupported"
            reasons.append(unsupported_reason)
        elif local_market is not None and has_local_snapshot and has_local_price:
            status = "already_local_ready"
            reasons.append("local_snapshot_and_prices_available")
        elif local_market is not None:
            status = "already_local_missing_snapshot"
            reasons.extend(_local_missing_reasons(has_local_snapshot, has_local_price))
        elif not has_remote_price:
            status = "remote_missing_price"
            reasons.append("remote_payload_missing_yes_no_prices")
        else:
            status = "missing_local_market"
            reasons.append("remote_market_not_found_locally")

        if classification.vertical != "sports":
            item_warnings.append("not_classified_as_sports")
        if _safe_text(market_payload.condition_id) is None:
            item_warnings.append("condition_id_missing")
        if not _clean_string_list(market_payload.clob_token_ids):
            item_warnings.append("clob_token_ids_missing")

        items.append(
            LiveUpcomingDiscoveryItem(
                remote_id=_safe_text(market_payload.id),
                local_market_id=local_market.id if local_market is not None else None,
                title=question,
                question=question,
                event_title=event_title,
                sport=classification.sport,
                market_shape=classification.market_shape,
                close_time=close_time,
                active=market_payload.active if market_payload.active is not None else event_payload.active,
                closed=market_payload.closed if market_payload.closed is not None else event_payload.closed,
                has_local_market=local_market is not None,
                has_local_snapshot=has_local_snapshot,
                has_local_price=has_local_price,
                has_remote_price=has_remote_price,
                yes_price=remote_prices[0] if len(remote_prices) >= 1 else None,
                no_price=remote_prices[1] if len(remote_prices) >= 2 else None,
                liquidity=market_payload.liquidity,
                volume=market_payload.volume,
                condition_id=_safe_text(market_payload.condition_id),
                clob_token_ids=_clean_string_list(market_payload.clob_token_ids),
                market_slug=_safe_text(market_payload.slug),
                event_slug=_safe_text(event_payload.slug),
                discovery_status=status,  # type: ignore[arg-type]
                reasons=_dedupe(reasons),
                warnings=_dedupe(item_warnings),
            )
        )

    items.sort(
        key=lambda item: (
            _status_rank(item.discovery_status),
            item.has_remote_price,
            item.condition_id is not None,
            item.clob_token_ids != [],
            item.volume or ZERO,
            item.liquidity or ZERO,
            -_timestamp(item.close_time),
        ),
        reverse=True,
    )
    selected = items[:safe_limit]
    return LiveUpcomingDiscoveryResponse(
        generated_at=current_time,
        summary=summary,
        items=selected,
        event_groups=_build_event_groups(items) if include_debug else [],
        filters_applied={
            "sport": normalized_sport,
            "days": safe_days,
            "limit": safe_limit,
            "pages": safe_pages,
            "remote_page_limit": page_limit,
            "remote_pages_fetched": pages_fetched,
            "include_futures": include_futures,
            "focus": normalized_focus,
            "debug_skips": include_debug,
            "source_tag_id": source_tag_id,
            "min_hours_to_close": min_hours_to_close,
            "window_start": current_time.isoformat(),
            "remote_window_start": min_close_time.isoformat(),
            "window_end": window_end.isoformat(),
            "page_limit": page_limit,
            "remote_order": "endDate",
            "remote_ascending": True,
            "remote_end_date_min": min_close_time.isoformat(),
            "remote_end_date_max": window_end.isoformat(),
        },
        warnings=warnings,
    )


def _flatten_remote_markets(
    events: list[PolymarketEventPayload],
) -> list[tuple[PolymarketEventPayload, PolymarketMarketPayload]]:
    entries: list[tuple[PolymarketEventPayload, PolymarketMarketPayload]] = []
    for event_payload in events:
        for market_payload in event_payload.markets:
            entries.append((event_payload, market_payload))
    return entries


def _load_matching_local_markets(
    db: Session,
    remote_entries: list[tuple[PolymarketEventPayload, PolymarketMarketPayload]],
) -> dict[str, Market]:
    remote_ids = {
        value
        for _, market_payload in remote_entries
        if (value := _safe_text(market_payload.id)) is not None
    }
    slugs = {
        value
        for _, market_payload in remote_entries
        if (value := _safe_text(market_payload.slug)) is not None
    }
    condition_ids = {
        value
        for _, market_payload in remote_entries
        if (value := _safe_text(market_payload.condition_id)) is not None
    }
    if not remote_ids and not slugs and not condition_ids:
        return {}

    predicates = []
    if remote_ids:
        predicates.append(Market.polymarket_market_id.in_(remote_ids))
    if slugs:
        predicates.append(Market.slug.in_(slugs))
    if condition_ids:
        predicates.append(Market.condition_id.in_(condition_ids))
    stmt = select(Market).options(joinedload(Market.event)).where(or_(*predicates))
    markets = list(db.scalars(stmt).unique().all())
    result: dict[str, Market] = {}
    for market in markets:
        result[f"id:{market.polymarket_market_id}"] = market
        result[f"slug:{market.slug}"] = market
        if market.condition_id:
            result[f"condition:{market.condition_id}"] = market
    return result


def _find_local_market(
    local_markets: dict[str, Market],
    *,
    event_payload: PolymarketEventPayload,
    market_payload: PolymarketMarketPayload,
) -> Market | None:
    del event_payload
    remote_id = _safe_text(market_payload.id)
    if remote_id and (market := local_markets.get(f"id:{remote_id}")) is not None:
        return market
    condition_id = _safe_text(market_payload.condition_id)
    if condition_id and (market := local_markets.get(f"condition:{condition_id}")) is not None:
        return market
    slug = _safe_text(market_payload.slug)
    if slug and (market := local_markets.get(f"slug:{slug}")) is not None:
        return market
    return None


def _unsupported_reason(
    *,
    question: str,
    event_title: str | None,
    classification_sport: str,
    market_shape: str,
    include_futures: bool,
    focus: str,
) -> str | None:
    if classification_sport == "other":
        return "sport_unsupported_or_unclear"
    if market_shape in FUTURE_SHAPES and not include_futures:
        return "future_or_championship_excluded"
    if focus == "match_winner" and market_shape != "match_winner":
        return "not_match_winner_focus"
    normalized_text = f"{question} {event_title or ''}".lower()
    if any(term in normalized_text for term in ESPORTS_TERMS):
        return "esports_not_supported"
    if any(term in normalized_text for term in NON_PRIMARY_DISCOVERY_TERMS):
        return "non_primary_market"
    if any(term in normalized_text for term in PAUSED_FOCUS_TITLE_TERMS):
        return "paused_non_primary_market"
    return None


def _effective_close_time(
    event_payload: PolymarketEventPayload,
    market_payload: PolymarketMarketPayload,
) -> datetime | None:
    return market_payload.end_date or event_payload.end_date or event_payload.start_date


def _remote_prices(market_payload: PolymarketMarketPayload) -> list[Decimal]:
    if market_payload.outcome_prices:
        return list(market_payload.outcome_prices)
    prices: list[Decimal] = []
    for token in market_payload.outcome_tokens:
        raw_price = token.get("price")
        if raw_price is None:
            continue
        try:
            prices.append(Decimal(str(raw_price)))
        except Exception:
            continue
    return prices


def _build_event_groups(items: list[LiveUpcomingDiscoveryItem]) -> list[LiveUpcomingEventGroup]:
    grouped: dict[str, list[LiveUpcomingDiscoveryItem]] = {}
    for item in items:
        key = item.event_slug or item.market_slug or f"remote:{item.remote_id or item.title}"
        grouped.setdefault(key, []).append(item)

    groups = [_event_group(slug, event_items) for slug, event_items in grouped.items()]
    groups.sort(
        key=lambda group: (
            group.close_time is None,
            _timestamp(group.close_time),
            -(group.volume or ZERO),
            group.event_slug,
        )
    )
    return groups


def _event_group(
    event_slug: str,
    items: list[LiveUpcomingDiscoveryItem],
) -> LiveUpcomingEventGroup:
    close_time = min((item.close_time for item in items if item.close_time), default=None)
    teams = _detect_event_teams(items)
    main_markets = [item for item in items if _is_primary_soccer_market(item, teams)]
    draw_markets = [item for item in items if _is_draw_market(item)]
    market_shape_counts = _count_by(items, lambda item: item.market_shape)
    status_counts = _count_by(items, lambda item: item.discovery_status)
    skip_reasons_count: dict[str, int] = {}
    for item in items:
        for reason in item.reasons:
            if item.discovery_status in {"missing_local_market", "already_local_ready"}:
                continue
            skip_reasons_count[reason] = skip_reasons_count.get(reason, 0) + 1
    main_summaries = [_market_summary(item) for item in [*main_markets, *draw_markets]]
    main_ids = {item.remote_id for item in [*main_markets, *draw_markets]}
    return LiveUpcomingEventGroup(
        event_slug=event_slug,
        event_title=next((item.event_title for item in items if item.event_title), None),
        league=_league_from_event_slug(event_slug),
        close_time=close_time,
        teams=teams,
        has_draw_market=bool(draw_markets),
        total_markets=len(items),
        main_markets=main_summaries,
        secondary_markets_count=len([item for item in items if item.remote_id not in main_ids]),
        market_shape_counts=market_shape_counts,
        status_counts=status_counts,
        skip_reasons_count=dict(sorted(skip_reasons_count.items())),
        liquidity=_sum_decimal(item.liquidity for item in items),
        volume=_sum_decimal(item.volume for item in items),
    )


def _market_summary(item: LiveUpcomingDiscoveryItem) -> LiveUpcomingEventMarketSummary:
    prices = _price_pair_from_item(item)
    return LiveUpcomingEventMarketSummary(
        remote_id=item.remote_id,
        title=item.title,
        market_shape=item.market_shape,
        discovery_status=item.discovery_status,
        has_remote_price=item.has_remote_price,
        yes_price=prices[0],
        no_price=prices[1],
        liquidity=item.liquidity,
        volume=item.volume,
        market_slug=item.market_slug,
        reasons=item.reasons,
    )


def _price_pair_from_item(item: LiveUpcomingDiscoveryItem) -> tuple[Decimal | None, Decimal | None]:
    return item.yes_price, item.no_price


def _detect_event_teams(items: list[LiveUpcomingDiscoveryItem]) -> list[str]:
    for item in items:
        teams = _teams_from_draw_title(item.title)
        if len(teams) == 2:
            return teams
    exact_teams: list[str] = []
    for item in items:
        teams = _teams_from_exact_score_title(item.title)
        for team in teams:
            if team not in exact_teams:
                exact_teams.append(team)
        if len(exact_teams) >= 2:
            return exact_teams[:2]
    win_teams: list[str] = []
    for item in items:
        team = _team_from_win_title(item.title)
        if team and team not in win_teams:
            win_teams.append(team)
        if len(win_teams) >= 2:
            return win_teams[:2]
    return win_teams


def _is_primary_soccer_market(item: LiveUpcomingDiscoveryItem, teams: list[str]) -> bool:
    if item.market_shape != "match_winner":
        return False
    team = _team_from_win_title(item.title)
    return bool(team and (not teams or team in teams))


def _is_draw_market(item: LiveUpcomingDiscoveryItem) -> bool:
    return bool(_teams_from_draw_title(item.title))


def _team_from_win_title(title: str) -> str | None:
    match = re.match(
        r"^Will\s+(.+?)\s+win(?:\s+on\s+\d{4}-\d{2}-\d{2})?\?$",
        title,
        flags=re.IGNORECASE,
    )
    return match.group(1).strip() if match else None


def _teams_from_draw_title(title: str) -> list[str]:
    match = re.match(
        r"^Will\s+(.+?)\s+vs\.?\s+(.+?)\s+end in a draw\?$",
        title,
        flags=re.IGNORECASE,
    )
    return [match.group(1).strip(), match.group(2).strip()] if match else []


def _teams_from_exact_score_title(title: str) -> list[str]:
    match = re.match(
        r"^Exact Score:\s*(.+?)\s+\d+\s*-\s*\d+\s+(.+?)\?$",
        title,
        flags=re.IGNORECASE,
    )
    return [match.group(1).strip(), match.group(2).strip()] if match else []


def _league_from_event_slug(event_slug: str) -> str | None:
    prefix = event_slug.split("-", 1)[0].upper()
    if not prefix or prefix == event_slug.upper():
        return None
    return prefix


def _count_by(items: list[LiveUpcomingDiscoveryItem], getter) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        value = str(getter(item))
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items()))


def _sum_decimal(values) -> Decimal | None:
    total = ZERO
    for value in values:
        if value is not None:
            total += value
    return total if total > ZERO else None


def _local_missing_reasons(has_snapshot: bool, has_price: bool) -> list[str]:
    reasons: list[str] = []
    if not has_snapshot:
        reasons.append("local_missing_snapshot")
    if not has_price:
        reasons.append("local_missing_yes_no_prices")
    return reasons


def _normalize_focus(value: str | None) -> str:
    normalized = (value or DEFAULT_FOCUS).strip().lower()
    if normalized in SUPPORTED_FOCUS:
        return normalized
    return DEFAULT_FOCUS


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _safe_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _combined_text(*values: str | None) -> str:
    return " ".join(value.strip() for value in values if value and value.strip())


def _clean_string_list(values: list[str]) -> list[str]:
    return [value for value in (_safe_text(item) for item in values) if value is not None]


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def _status_rank(value: str) -> int:
    if value == "already_local_ready":
        return 5
    if value == "missing_local_market":
        return 4
    if value == "already_local_missing_snapshot":
        return 3
    if value == "remote_missing_price":
        return 2
    return 1


def _timestamp(value: datetime | None) -> float:
    if value is None:
        return 0
    return _normalize_datetime(value).timestamp()
