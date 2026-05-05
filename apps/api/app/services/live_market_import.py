from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
import re

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.clients.polymarket import (
    PolymarketEventPayload,
    PolymarketGammaClient,
    PolymarketMarketPayload,
)
from app.models.event import Event
from app.models.market import Market
from app.models.market_snapshot import MarketSnapshot
from app.models.prediction import Prediction
from app.models.research_run import ResearchRun
from app.services.live_upcoming_discovery import (
    DEFAULT_FOCUS,
    _effective_close_time,
    _flatten_remote_markets,
    _remote_prices,
    _unsupported_reason,
)
from app.services.research.classification import (
    classify_market_research_context,
    normalize_sport,
)

ZERO = Decimal("0")


@dataclass(slots=True)
class LiveMarketImportItem:
    action: str
    remote_id: str | None
    title: str
    event_title: str | None = None
    sport: str | None = None
    market_shape: str | None = None
    import_role: str | None = None
    close_time: datetime | None = None
    condition_id: str | None = None
    clob_token_ids: list[str] = field(default_factory=list)
    market_slug: str | None = None
    event_slug: str | None = None
    polymarket_url: str | None = None
    yes_price: Decimal | None = None
    no_price: Decimal | None = None
    liquidity: Decimal | None = None
    volume: Decimal | None = None
    local_market_id: int | None = None
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_payload(self) -> dict[str, object]:
        return {
            "action": self.action,
            "remote_id": self.remote_id,
            "title": self.title,
            "event_title": self.event_title,
            "sport": self.sport,
            "market_shape": self.market_shape,
            "import_role": self.import_role,
            "close_time": self.close_time.isoformat() if self.close_time else None,
            "condition_id": self.condition_id,
            "clob_token_ids": list(self.clob_token_ids),
            "market_slug": self.market_slug,
            "event_slug": self.event_slug,
            "polymarket_url": self.polymarket_url,
            "yes_price": str(self.yes_price) if self.yes_price is not None else None,
            "no_price": str(self.no_price) if self.no_price is not None else None,
            "liquidity": str(self.liquidity) if self.liquidity is not None else None,
            "volume": str(self.volume) if self.volume is not None else None,
            "local_market_id": self.local_market_id,
            "reasons": list(self.reasons),
            "warnings": list(self.warnings),
        }


@dataclass(slots=True)
class LiveMarketImportEventGroup:
    event_slug: str
    event_title: str | None = None
    league: str | None = None
    close_time: datetime | None = None
    teams: list[str] = field(default_factory=list)
    has_draw_market: bool = False
    total_markets: int = 0
    primary_markets: list[LiveMarketImportItem] = field(default_factory=list)
    secondary_markets: list[LiveMarketImportItem] = field(default_factory=list)
    would_import_markets_count: int = 0
    skipped_markets_count: int = 0
    skip_reasons_count: dict[str, int] = field(default_factory=dict)
    liquidity: Decimal | None = None
    volume: Decimal | None = None

    def to_payload(self) -> dict[str, object]:
        return {
            "event_slug": self.event_slug,
            "event_title": self.event_title,
            "league": self.league,
            "close_time": self.close_time.isoformat() if self.close_time else None,
            "teams": list(self.teams),
            "has_draw_market": self.has_draw_market,
            "total_markets": self.total_markets,
            "primary_markets": [item.to_payload() for item in self.primary_markets],
            "secondary_markets": [item.to_payload() for item in self.secondary_markets[:5]],
            "secondary_markets_count": len(self.secondary_markets),
            "would_import_markets_count": self.would_import_markets_count,
            "skipped_markets_count": self.skipped_markets_count,
            "skip_reasons_count": dict(sorted(self.skip_reasons_count.items())),
            "liquidity": str(self.liquidity) if self.liquidity is not None else None,
            "volume": str(self.volume) if self.volume is not None else None,
        }


@dataclass(slots=True)
class _ImportCandidate:
    event_payload: PolymarketEventPayload
    market_payload: PolymarketMarketPayload
    item: LiveMarketImportItem
    order: int


@dataclass(slots=True)
class LiveMarketImportSummary:
    dry_run: bool
    apply: bool
    max_import: int
    max_events: int | None = None
    requested_sport: str | None = None
    normalized_sport: str | None = None
    requested_days: int = 7
    requested_limit: int = 50
    requested_pages: int = 1
    requested_min_hours_to_close: float = 6
    remote_page_limit: int = 50
    remote_pages_fetched: int = 1
    applied_limit_meaning: str = ""
    total_remote_checked: int = 0
    missing_local: int = 0
    would_import: int = 0
    imported: int = 0
    skipped: int = 0
    include_skip_reasons: bool = False
    skip_reasons_count: dict[str, int] = field(default_factory=dict)
    skip_examples: dict[str, list[dict[str, object]]] = field(default_factory=dict)
    detected_sports_count: dict[str, int] = field(default_factory=dict)
    detected_market_types_count: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    items: list[LiveMarketImportItem] = field(default_factory=list)
    events_created: int = 0
    markets_created: int = 0
    snapshots_created: int = 0
    predictions_created: int = 0
    research_runs_created: int = 0
    trading_executed: bool = False
    event_groups: list[LiveMarketImportEventGroup] = field(default_factory=list)

    def to_payload(self) -> dict[str, object]:
        return {
            "dry_run": self.dry_run,
            "apply": self.apply,
            "max_import": self.max_import,
            "max_events": self.max_events,
            "requested_sport": self.requested_sport,
            "normalized_sport": self.normalized_sport,
            "requested_days": self.requested_days,
            "requested_limit": self.requested_limit,
            "requested_pages": self.requested_pages,
            "requested_min_hours_to_close": self.requested_min_hours_to_close,
            "remote_page_limit": self.remote_page_limit,
            "remote_pages_fetched": self.remote_pages_fetched,
            "applied_limit_meaning": self.applied_limit_meaning,
            "total_remote_checked": self.total_remote_checked,
            "missing_local": self.missing_local,
            "would_import": self.would_import,
            "imported": self.imported,
            "skipped": self.skipped,
            "skip_reasons_count": dict(sorted(self.skip_reasons_count.items())),
            "skip_examples": {
                reason: examples
                for reason, examples in sorted(self.skip_examples.items())
                if examples
            },
            "detected_sports_count": dict(sorted(self.detected_sports_count.items())),
            "detected_market_types_count": dict(sorted(self.detected_market_types_count.items())),
            "warnings": list(self.warnings),
            "events_created": self.events_created,
            "markets_created": self.markets_created,
            "snapshots_created": self.snapshots_created,
            "predictions_created": self.predictions_created,
            "research_runs_created": self.research_runs_created,
            "trading_executed": self.trading_executed,
            "event_groups": [group.to_payload() for group in self.event_groups],
            "items": [item.to_payload() for item in self.items],
        }


def import_live_discovered_markets(
    db: Session,
    *,
    client: PolymarketGammaClient,
    sport: str | None = None,
    days: int = 7,
    limit: int = 50,
    pages: int = 1,
    dry_run: bool = True,
    max_import: int = 10,
    max_events: int | None = None,
    min_hours_to_close: float = 6,
    source_tag_id: str | None = None,
    include_skip_reasons: bool = False,
    now: datetime | None = None,
) -> LiveMarketImportSummary:
    current_time = _normalize_datetime(now or datetime.now(tz=UTC))
    safe_days = max(days, 1)
    safe_limit = max(min(limit, 100), 0)
    safe_pages = max(min(pages, 10), 1)
    safe_max_import = max(min(max_import, 25), 0)
    safe_max_events = None if max_events is None else max(min(max_events, 25), 0)
    min_close_time = current_time + timedelta(hours=max(min_hours_to_close, 0))
    window_end = current_time + timedelta(days=safe_days)
    normalized_sport = normalize_sport(sport) if sport else None
    page_limit = min(max(safe_limit * 2, 10), 100)

    before_events_count = db.scalar(select(func.count()).select_from(Event)) or 0
    before_markets_count = db.scalar(select(func.count()).select_from(Market)) or 0
    before_snapshots_count = db.scalar(select(func.count()).select_from(MarketSnapshot)) or 0
    before_predictions_count = db.scalar(select(func.count()).select_from(Prediction)) or 0
    before_research_runs_count = db.scalar(select(func.count()).select_from(ResearchRun)) or 0

    remote_events: list[PolymarketEventPayload] = []
    warnings: list[str] = []
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
    entries = _flatten_remote_markets(remote_events)
    local_markets = _load_local_markets(db, entries)
    summary = LiveMarketImportSummary(
        dry_run=dry_run,
        apply=not dry_run,
        max_import=safe_max_import,
        max_events=safe_max_events,
        requested_sport=sport,
        normalized_sport=normalized_sport,
        requested_days=days,
        requested_limit=limit,
        requested_pages=pages,
        requested_min_hours_to_close=min_hours_to_close,
        remote_page_limit=page_limit,
        remote_pages_fetched=pages_fetched,
        applied_limit_meaning=(
            "--limit clamps the remote events page size, not the flattened market count; "
            "total_remote_checked can be higher because each event can contain many markets. "
            "--pages controls how many remote /events pages are read. --max-events limits "
            "eligible event/game groups before --max-import limits individual markets."
        ),
        total_remote_checked=len(entries),
        include_skip_reasons=include_skip_reasons,
        warnings=warnings,
    )

    all_candidates: list[_ImportCandidate] = []
    eligible_candidates: list[_ImportCandidate] = []
    allow_soccer_draws = normalized_sport == "soccer" and safe_max_events is not None
    for order, (event_payload, market_payload) in enumerate(entries):
        item = _build_import_item(
            event_payload=event_payload,
            market_payload=market_payload,
            local_markets=local_markets,
            normalized_sport=normalized_sport,
            current_time=current_time,
            min_close_time=min_close_time,
            window_end=window_end,
            allow_soccer_draws=allow_soccer_draws,
        )
        candidate = _ImportCandidate(
            event_payload=event_payload,
            market_payload=market_payload,
            item=item,
            order=order,
        )
        all_candidates.append(candidate)
        _record_detected(summary, item)
        if item.action == "skipped":
            summary.skipped += 1
            _record_skip(summary, item)
            if _include_skipped_item(item):
                summary.items.append(item)
            continue
        summary.missing_local += 1
        eligible_candidates.append(candidate)

    selected_candidates = _limit_candidates_by_events(
        eligible_candidates,
        max_events=safe_max_events,
        normalized_sport=normalized_sport,
    )
    selected_ids = {id(candidate) for candidate in selected_candidates}
    for candidate in eligible_candidates:
        if safe_max_events is None or id(candidate) in selected_ids:
            continue
        item = candidate.item
        item.action = "skipped"
        item.reasons.append("max_events_reached")
        item.warnings.append("max_events_reached")
        summary.skipped += 1
        _record_skip(summary, item)
        if include_skip_reasons:
            summary.items.append(item)

    imports_remaining = safe_max_import
    for candidate in selected_candidates:
        event_payload = candidate.event_payload
        market_payload = candidate.market_payload
        item = candidate.item
        if imports_remaining <= 0:
            item.action = "skipped"
            item.reasons.append("max_import_reached")
            item.warnings.append("max_import_reached")
            summary.skipped += 1
            _record_skip(summary, item)
            summary.items.append(item)
            continue
        if dry_run:
            summary.would_import += 1
            summary.items.append(item)
            imports_remaining -= 1
            continue

        created_market = _apply_import(db, event_payload, market_payload, item)
        item.action = "imported"
        item.local_market_id = created_market.id
        summary.imported += 1
        summary.items.append(item)
        imports_remaining -= 1
        db.flush()
        local_markets[f"id:{created_market.polymarket_market_id}"] = created_market
        local_markets[f"slug:{created_market.slug}"] = created_market
        if created_market.condition_id:
            local_markets[f"condition:{created_market.condition_id}"] = created_market

    if selected_candidates and (safe_max_events is not None or include_skip_reasons):
        summary.event_groups = _build_import_event_groups(all_candidates, selected_candidates)

    after_events_count = db.scalar(select(func.count()).select_from(Event)) or 0
    after_markets_count = db.scalar(select(func.count()).select_from(Market)) or 0
    after_snapshots_count = db.scalar(select(func.count()).select_from(MarketSnapshot)) or 0
    after_predictions_count = db.scalar(select(func.count()).select_from(Prediction)) or 0
    after_research_runs_count = db.scalar(select(func.count()).select_from(ResearchRun)) or 0
    summary.events_created = after_events_count - before_events_count
    summary.markets_created = after_markets_count - before_markets_count
    summary.snapshots_created = after_snapshots_count - before_snapshots_count
    summary.predictions_created = after_predictions_count - before_predictions_count
    summary.research_runs_created = after_research_runs_count - before_research_runs_count
    return summary


def _limit_candidates_by_events(
    candidates: list[_ImportCandidate],
    *,
    max_events: int | None,
    normalized_sport: str | None,
) -> list[_ImportCandidate]:
    if max_events is None:
        return candidates
    if max_events <= 0:
        return []

    groups = _group_import_candidates(candidates)
    ranked_groups = sorted(
        groups.values(),
        key=lambda group: _event_selection_key(group, normalized_sport=normalized_sport),
    )
    selected_groups = ranked_groups[:max_events]
    selected: list[_ImportCandidate] = []
    for group in selected_groups:
        teams = _detect_candidate_teams(group)
        selected.extend(sorted(group, key=lambda candidate: _candidate_market_order(candidate, teams)))
    return selected


def _build_import_event_groups(
    all_candidates: list[_ImportCandidate],
    selected_candidates: list[_ImportCandidate],
) -> list[LiveMarketImportEventGroup]:
    selected_slugs = {_event_key(candidate) for candidate in selected_candidates}
    groups = _group_import_candidates(all_candidates)
    event_groups: list[LiveMarketImportEventGroup] = []
    for event_slug, candidates in groups.items():
        if selected_slugs and event_slug not in selected_slugs:
            continue
        teams = _detect_candidate_teams(candidates)
        primary_markets = [
            candidate.item for candidate in candidates if _is_primary_soccer_market(candidate.item, teams)
        ]
        secondary_markets = [
            candidate.item for candidate in candidates if candidate.item not in primary_markets
        ]
        _assign_roles(primary_markets, teams)
        skip_reasons_count: dict[str, int] = {}
        for candidate in candidates:
            if candidate.item.action != "skipped":
                continue
            for reason in candidate.item.reasons or ["unknown"]:
                skip_reasons_count[reason] = skip_reasons_count.get(reason, 0) + 1
        event_groups.append(
            LiveMarketImportEventGroup(
                event_slug=event_slug,
                event_title=next(
                    (candidate.item.event_title for candidate in candidates if candidate.item.event_title),
                    None,
                ),
                league=_league_from_event_slug(event_slug),
                close_time=min(
                    (candidate.item.close_time for candidate in candidates if candidate.item.close_time),
                    default=None,
                ),
                teams=teams,
                has_draw_market=any(_is_draw_market(candidate.item) for candidate in candidates),
                total_markets=len(candidates),
                primary_markets=sorted(
                    primary_markets,
                    key=lambda item: _primary_item_order(item, teams),
                ),
                secondary_markets=sorted(
                    secondary_markets,
                    key=lambda item: (
                        item.action == "skipped",
                        item.market_shape or "",
                        item.title,
                    ),
                ),
                would_import_markets_count=sum(
                    1 for candidate in candidates if candidate.item.action in {"would_import", "imported"}
                ),
                skipped_markets_count=sum(
                    1 for candidate in candidates if candidate.item.action == "skipped"
                ),
                skip_reasons_count=skip_reasons_count,
                liquidity=_sum_decimal(candidate.item.liquidity for candidate in candidates),
                volume=_sum_decimal(candidate.item.volume for candidate in candidates),
            )
        )
    event_groups.sort(
        key=lambda group: (
            group.event_slug not in selected_slugs,
            -float(group.volume or ZERO),
            group.close_time is None,
            _timestamp(group.close_time),
            group.event_slug,
        )
    )
    return event_groups


def _group_import_candidates(
    candidates: list[_ImportCandidate],
) -> dict[str, list[_ImportCandidate]]:
    groups: dict[str, list[_ImportCandidate]] = {}
    for candidate in candidates:
        groups.setdefault(_event_key(candidate), []).append(candidate)
    return groups


def _event_selection_key(
    candidates: list[_ImportCandidate],
    *,
    normalized_sport: str | None,
) -> tuple[object, ...]:
    teams = _detect_candidate_teams(candidates)
    has_two_teams = len(teams) >= 2
    has_draw = any(_is_draw_market(candidate.item) for candidate in candidates)
    primary_count = sum(
        1 for candidate in candidates if _is_primary_soccer_market(candidate.item, teams)
    )
    volume = _sum_decimal(candidate.item.volume for candidate in candidates) or ZERO
    liquidity = _sum_decimal(candidate.item.liquidity for candidate in candidates) or ZERO
    close_time = min(
        (candidate.item.close_time for candidate in candidates if candidate.item.close_time),
        default=None,
    )
    if normalized_sport == "soccer":
        return (
            not has_two_teams,
            primary_count < 2,
            not has_draw,
            -volume,
            -liquidity,
            close_time is None,
            _timestamp(close_time),
            _event_key(candidates[0]),
        )
    return (
        close_time is None,
        _timestamp(close_time),
        -volume,
        -liquidity,
        _event_key(candidates[0]),
    )


def _candidate_market_order(candidate: _ImportCandidate, teams: list[str]) -> tuple[object, ...]:
    return _primary_item_order(candidate.item, teams), candidate.order


def _primary_item_order(item: LiveMarketImportItem, teams: list[str]) -> tuple[object, ...]:
    if _is_draw_market(item):
        return (1, item.title)
    team = _team_from_win_title(item.title)
    if team and teams:
        if _same_team(team, teams[0]):
            return (0, item.title)
        if len(teams) > 1 and _same_team(team, teams[1]):
            return (2, item.title)
    if item.market_shape == "match_winner":
        return (0, item.title)
    return (3, item.title)


def _assign_roles(items: list[LiveMarketImportItem], teams: list[str]) -> None:
    for item in items:
        if _is_draw_market(item):
            item.import_role = "draw"
            continue
        team = _team_from_win_title(item.title)
        if team and teams:
            if _same_team(team, teams[0]):
                item.import_role = "team_a_win"
                continue
            if len(teams) > 1 and _same_team(team, teams[1]):
                item.import_role = "team_b_win"
                continue
        item.import_role = item.import_role or "primary"


def _event_key(candidate: _ImportCandidate) -> str:
    raw_slug = candidate.item.event_slug or candidate.item.market_slug
    return _canonical_event_slug(raw_slug) or candidate.item.remote_id or candidate.item.title


def _canonical_event_slug(value: str | None) -> str | None:
    slug = _safe_text(value)
    if slug is None:
        return None
    secondary_suffixes = (
        "-more-markets",
        "-exact-score",
        "-halftime-result",
        "-player-props",
        "-total-corners",
    )
    for suffix in secondary_suffixes:
        if slug.endswith(suffix):
            return slug[: -len(suffix)]
    return slug


def _detect_candidate_teams(candidates: list[_ImportCandidate]) -> list[str]:
    for candidate in candidates:
        teams = _teams_from_draw_title(candidate.item.title)
        if len(teams) == 2:
            return teams
    win_teams: list[str] = []
    for candidate in candidates:
        team = _team_from_win_title(candidate.item.title)
        if team and not any(_same_team(team, existing) for existing in win_teams):
            win_teams.append(team)
        if len(win_teams) >= 2:
            return win_teams[:2]
    return win_teams


def _is_primary_soccer_market(item: LiveMarketImportItem, teams: list[str]) -> bool:
    if _is_draw_market(item):
        return True
    if item.market_shape != "match_winner":
        return False
    team = _team_from_win_title(item.title)
    return bool(team and (not teams or any(_same_team(team, existing) for existing in teams)))


def _is_allowed_soccer_draw(item: LiveMarketImportItem, allow_soccer_draws: bool) -> bool:
    return bool(
        allow_soccer_draws
        and item.sport == "soccer"
        and item.market_shape == "yes_no_generic"
        and _is_draw_market(item)
    )


def _is_draw_market(item: LiveMarketImportItem) -> bool:
    return bool(_teams_from_draw_title(item.title))


def _import_role(title: str) -> str | None:
    if _teams_from_draw_title(title):
        return "draw"
    if _team_from_win_title(title):
        return "team_win"
    return None


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


def _league_from_event_slug(event_slug: str) -> str | None:
    prefix = event_slug.split("-", 1)[0].upper()
    if not prefix or prefix == event_slug.upper():
        return None
    return prefix


def _same_team(left: str, right: str) -> bool:
    return _normalize_team(left) == _normalize_team(right)


def _normalize_team(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _sum_decimal(values) -> Decimal | None:
    total = ZERO
    for value in values:
        if value is not None:
            total += value
    return total if total > ZERO else None


def _timestamp(value: datetime | None) -> float:
    return value.timestamp() if value is not None else float("inf")


def _record_detected(summary: LiveMarketImportSummary, item: LiveMarketImportItem) -> None:
    sport = item.sport or "unknown"
    market_shape = item.market_shape or "unknown"
    summary.detected_sports_count[sport] = summary.detected_sports_count.get(sport, 0) + 1
    summary.detected_market_types_count[market_shape] = (
        summary.detected_market_types_count.get(market_shape, 0) + 1
    )


def _record_skip(summary: LiveMarketImportSummary, item: LiveMarketImportItem) -> None:
    reasons = item.reasons or ["unknown"]
    for reason in reasons:
        summary.skip_reasons_count[reason] = summary.skip_reasons_count.get(reason, 0) + 1
        if not summary.include_skip_reasons:
            continue
        examples = summary.skip_examples.setdefault(reason, [])
        if len(examples) >= 3:
            continue
        examples.append(_skip_example(item))


def _skip_example(item: LiveMarketImportItem) -> dict[str, object]:
    return {
        "remote_id": item.remote_id,
        "title": _truncate(item.title, 120),
        "sport": item.sport,
        "market_shape": item.market_shape,
        "close_time": item.close_time.isoformat() if item.close_time else None,
        "market_slug": _truncate(item.market_slug, 80),
        "event_slug": _truncate(item.event_slug, 80),
        "warnings": list(item.warnings[:5]),
    }


def _build_import_item(
    *,
    event_payload: PolymarketEventPayload,
    market_payload: PolymarketMarketPayload,
    local_markets: dict[str, Market],
    normalized_sport: str | None,
    current_time: datetime,
    min_close_time: datetime,
    window_end: datetime,
    allow_soccer_draws: bool = False,
) -> LiveMarketImportItem:
    question = _safe_text(market_payload.question) or "Mercado sin pregunta"
    event_title = _safe_text(event_payload.title)
    event_context = _combined_text(event_title, event_payload.slug, market_payload.slug)
    close_time = _effective_close_time(event_payload, market_payload)
    close_time = _normalize_datetime(close_time) if close_time else None
    classification = classify_market_research_context(
        question=question,
        event_title=event_context,
        event_category=event_payload.category,
    )
    remote_prices = _remote_prices(market_payload)
    item = LiveMarketImportItem(
        action="would_import",
        remote_id=_safe_text(market_payload.id),
        title=question,
        event_title=event_title,
        sport=classification.sport,
        market_shape=classification.market_shape,
        import_role=_import_role(question),
        close_time=close_time,
        condition_id=_safe_text(market_payload.condition_id),
        clob_token_ids=_clean_string_list(market_payload.clob_token_ids),
        market_slug=_safe_text(market_payload.slug),
        event_slug=_safe_text(event_payload.slug),
        polymarket_url=_polymarket_event_url(event_payload.slug),
        yes_price=remote_prices[0] if len(remote_prices) >= 1 else None,
        no_price=remote_prices[1] if len(remote_prices) >= 2 else None,
        liquidity=market_payload.liquidity,
        volume=market_payload.volume,
    )

    if _find_local_market(local_markets, market_payload) is not None:
        return _skip(item, "already_exists_locally")
    if normalized_sport is not None and classification.sport != normalized_sport:
        return _skip(item, "sport_filter_mismatch")
    if close_time is None:
        return _skip(item, "missing_close_time")
    if close_time < current_time:
        return _skip(item, "close_time_past")
    if close_time < min_close_time:
        return _skip(item, "close_time_before_min_window")
    if close_time > window_end:
        return _skip(item, "close_time_outside_window")

    unsupported_reason = _unsupported_reason(
        question=question,
        event_title=event_title,
        classification_sport=classification.sport,
        market_shape=classification.market_shape,
        include_futures=False,
        focus=DEFAULT_FOCUS,
    )
    if unsupported_reason is not None and not _is_allowed_soccer_draw(item, allow_soccer_draws):
        return _skip(item, unsupported_reason)

    missing_required = [
        field
        for field, value in (
            ("event_id", _safe_text(event_payload.id)),
            ("event_slug", _safe_text(event_payload.slug)),
            ("event_title", event_title),
            ("market_id", _safe_text(market_payload.id)),
            ("market_slug", _safe_text(market_payload.slug)),
            ("question", _safe_text(market_payload.question)),
        )
        if value is None
    ]
    if missing_required:
        return _skip(item, "missing_required_metadata", missing_required)

    if not item.condition_id and not item.clob_token_ids:
        return _skip(item, "missing_public_identifiers")

    if len(remote_prices) < 2:
        item.warnings.append("remote_payload_missing_yes_no_prices")
    item.reasons.append("remote_market_missing_locally")
    item.reasons.append("safe_metadata_available")
    return item


def _apply_import(
    db: Session,
    event_payload: PolymarketEventPayload,
    market_payload: PolymarketMarketPayload,
    item: LiveMarketImportItem,
) -> Market:
    event = _find_or_create_event(db, event_payload)
    _update_event(event, event_payload)
    db.flush()

    yes_token_id, no_token_id = _extract_binary_token_ids(item.clob_token_ids)
    market = Market(
        polymarket_market_id=_required_text(market_payload.id),
        event_id=event.id,
        question=_required_text(market_payload.question),
        slug=_required_text(market_payload.slug),
        condition_id=item.condition_id,
        question_id=_safe_text(market_payload.question_id),
        clob_token_ids=item.clob_token_ids or None,
        outcome_tokens=_build_outcome_tokens(market_payload, item.clob_token_ids) or None,
        polymarket_url=item.polymarket_url,
        yes_token_id=yes_token_id,
        no_token_id=no_token_id,
        sport_type=item.sport,
        market_type=item.market_shape,
        image_url=_safe_text(market_payload.image_url),
        icon_url=_safe_text(market_payload.icon_url),
        active=bool(market_payload.active if market_payload.active is not None else event_payload.active),
        closed=bool(market_payload.closed if market_payload.closed is not None else event_payload.closed),
        end_date=item.close_time,
        rules_text=_safe_text(market_payload.description),
    )
    db.add(market)
    db.flush()
    return market


def _find_or_create_event(db: Session, event_payload: PolymarketEventPayload) -> Event:
    event_id = _required_text(event_payload.id)
    event_slug = _required_text(event_payload.slug)
    stmt = select(Event).where(
        or_(Event.polymarket_event_id == event_id, Event.slug == event_slug)
    )
    event = db.scalar(stmt)
    if event is not None:
        return event
    event = Event(
        polymarket_event_id=event_id,
        title=_required_text(event_payload.title),
        slug=event_slug,
        active=bool(event_payload.active),
        closed=bool(event_payload.closed),
    )
    db.add(event)
    return event


def _update_event(event: Event, event_payload: PolymarketEventPayload) -> None:
    updates: dict[str, object | None] = {
        "title": _safe_text(event_payload.title) or event.title,
        "category": _safe_text(event_payload.category) or event.category,
        "active": bool(event_payload.active),
        "closed": bool(event_payload.closed),
        "start_at": event_payload.start_date or event.start_at,
        "end_at": event_payload.end_date or event.end_at,
        "image_url": _safe_text(event_payload.image_url) or event.image_url,
        "icon_url": _safe_text(event_payload.icon_url) or event.icon_url,
    }
    for field_name, value in updates.items():
        if value is not None and getattr(event, field_name) != value:
            setattr(event, field_name, value)


def _load_local_markets(
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
    markets = list(db.scalars(select(Market).where(or_(*predicates))).unique().all())
    result: dict[str, Market] = {}
    for market in markets:
        result[f"id:{market.polymarket_market_id}"] = market
        result[f"slug:{market.slug}"] = market
        if market.condition_id:
            result[f"condition:{market.condition_id}"] = market
    return result


def _find_local_market(
    local_markets: dict[str, Market],
    market_payload: PolymarketMarketPayload,
) -> Market | None:
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


def _skip(
    item: LiveMarketImportItem,
    reason: str,
    missing_fields: list[str] | None = None,
) -> LiveMarketImportItem:
    item.action = "skipped"
    item.reasons.append(reason)
    if missing_fields:
        item.warnings.extend(f"missing_{field}" for field in missing_fields)
    return item


def _include_skipped_item(item: LiveMarketImportItem) -> bool:
    return any(
        reason in item.reasons
        for reason in (
            "missing_required_metadata",
            "missing_public_identifiers",
        )
    )


def _clean_string_list(values: list[str]) -> list[str]:
    return [value for value in (_safe_text(item) for item in values) if value is not None]


def _build_outcome_tokens(
    market_payload: PolymarketMarketPayload,
    clob_token_ids: list[str],
) -> list[dict[str, object]]:
    if market_payload.outcome_tokens:
        return market_payload.outcome_tokens
    outcomes = _clean_string_list(market_payload.outcomes)
    tokens: list[dict[str, object]] = []
    for index, token_id in enumerate(clob_token_ids):
        item: dict[str, object] = {"token_id": token_id, "outcome_index": index}
        if index < len(outcomes):
            item["outcome"] = outcomes[index]
        tokens.append(item)
    return tokens


def _extract_binary_token_ids(token_ids: list[str]) -> tuple[str | None, str | None]:
    if len(token_ids) >= 2:
        return token_ids[0], token_ids[1]
    if len(token_ids) == 1:
        return token_ids[0], None
    return None, None


def _polymarket_event_url(event_slug: str | None) -> str | None:
    slug = _safe_text(event_slug)
    if slug is None:
        return None
    return f"https://polymarket.com/event/{slug}"


def _required_text(value: str | None) -> str:
    text = _safe_text(value)
    if text is None:
        raise ValueError("Remote payload lacks required text field.")
    return text


def _safe_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _truncate(value: str | None, limit: int) -> str | None:
    text = _safe_text(value)
    if text is None or len(text) <= limit:
        return text
    return f"{text[: max(limit - 3, 0)]}..."


def _combined_text(*values: str | None) -> str:
    return " ".join(value.strip() for value in values if value and value.strip())


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
