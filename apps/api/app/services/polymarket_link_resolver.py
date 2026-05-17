from __future__ import annotations

from dataclasses import dataclass
import ipaddress
import re
from urllib.parse import urlsplit, urlunsplit

from app.clients.polymarket import (
    PolymarketClientError,
    PolymarketEventPayload,
    PolymarketGammaClient,
    PolymarketMarketDetailsPayload,
)

ALLOWED_HOSTS = {"polymarket.com", "www.polymarket.com"}
BLOCKED_HOSTS = {"0.0.0.0", "127.0.0.1", "::1", "169.254.169.254", "localhost"}
KNOWN_POLYMARKET_CATEGORIES = {"crypto", "event", "market", "markets", "politics", "sports"}
LOCALE_SEGMENT_PATTERN = re.compile(r"^[a-z]{2}(?:-[a-z]{2})?$", re.IGNORECASE)
MAX_POLYMARKET_URL_LENGTH = 2048


class PolymarketLinkResolverError(Exception):
    pass


@dataclass(slots=True)
class ParsedPolymarketLink:
    category: str | None
    event_slug: str | None
    market_slug: str | None
    normalized_url: str
    raw_slug: str | None
    sport_or_league: str | None


@dataclass(slots=True)
class ResolvedPolymarketOutcome:
    label: str
    side: str
    token_id: str | None = None


@dataclass(slots=True)
class ResolvedPolymarketMarket:
    condition_id: str | None
    event_slug: str | None
    market_slug: str | None
    normalized_url: str
    outcomes: list[ResolvedPolymarketOutcome]
    raw_source: str
    sport_or_league: str | None
    token_ids: list[str]
    warnings: list[str]
    question: str


def normalize_polymarket_url(input_url: str) -> str | None:
    if len(input_url) > MAX_POLYMARKET_URL_LENGTH:
        return None
    candidate = input_url.strip()
    if not candidate:
        return None
    if not candidate.lower().startswith(("http://", "https://")) and candidate.lower().startswith(
        ("polymarket.com", "www.polymarket.com")
    ):
        candidate = f"https://{candidate}"
    try:
        parsed = urlsplit(candidate)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"}:
        return None
    if parsed.username or parsed.password or parsed.port:
        return None
    hostname = (parsed.hostname or "").lower()
    if not hostname or hostname not in ALLOWED_HOSTS or _is_blocked_host(hostname):
        return None
    return urlunsplit(("https", hostname, parsed.path or "/", parsed.query, ""))


def parse_polymarket_link(input_url: str) -> ParsedPolymarketLink | None:
    normalized_url = normalize_polymarket_url(input_url)
    if not normalized_url:
        return None
    parsed = urlsplit(normalized_url)
    path_segments = [_normalize_segment(segment) for segment in parsed.path.split("/") if segment.strip()]
    path_segments = [segment for segment in path_segments if segment]
    locale = path_segments[0] if path_segments and LOCALE_SEGMENT_PATTERN.match(path_segments[0]) else None
    category_index = next(
        (index for index, segment in enumerate(path_segments) if segment in KNOWN_POLYMARKET_CATEGORIES),
        -1,
    )
    category = path_segments[category_index] if category_index >= 0 else None
    after_category = path_segments[category_index + 1 :] if category_index >= 0 else path_segments[(1 if locale else 0) :]
    sport_or_league = after_category[0] if category == "sports" and after_category else None
    if category == "sports":
        raw_slug = after_category[1] if len(after_category) > 1 else (after_category[0] if after_category else None)
    elif category in {"event", "market", "markets"}:
        raw_slug = after_category[0] if after_category else None
    else:
        raw_slug = after_category[-1] if after_category else None
    event_slug = raw_slug if category in {"event", "sports"} else None
    market_slug = raw_slug if category in {"market", "markets"} else None
    return ParsedPolymarketLink(
        category=category,
        event_slug=event_slug,
        market_slug=market_slug,
        normalized_url=normalized_url,
        raw_slug=raw_slug,
        sport_or_league=sport_or_league,
    )


def resolve_polymarket_market_from_link(
    *,
    gamma_client: PolymarketGammaClient,
    polymarket_url: str,
) -> ResolvedPolymarketMarket:
    parsed = parse_polymarket_link(polymarket_url)
    if parsed is None or not parsed.raw_slug:
        raise PolymarketLinkResolverError("invalid_polymarket_url")

    warnings: list[str] = []
    market_payload: PolymarketMarketDetailsPayload | None = None
    event_slug: str | None = parsed.event_slug

    try:
        if parsed.market_slug:
            market_payload = gamma_client.fetch_market_by_slug(parsed.market_slug)
        elif parsed.event_slug:
            event_payload = gamma_client.fetch_event_by_slug(parsed.event_slug)
            market_payload, warnings = _select_market_from_event(event_payload)
            event_slug = _normalize_slug(event_payload.slug) if event_payload is not None else parsed.event_slug
        else:
            raise PolymarketLinkResolverError("unsupported_polymarket_url")
    except PolymarketClientError as exc:
        raise PolymarketLinkResolverError("polymarket_resolver_unavailable") from exc

    if market_payload is None:
        raise PolymarketLinkResolverError("market_not_found")

    resolved_event_slug = _normalize_slug(
        getattr(market_payload, "event_slug", None) or event_slug
    )
    token_ids = _normalize_token_ids(market_payload.clob_token_ids, market_payload.outcome_tokens)
    outcomes = _normalize_outcomes(market_payload, token_ids)
    return ResolvedPolymarketMarket(
        condition_id=_clean_identifier(market_payload.condition_id),
        event_slug=resolved_event_slug,
        market_slug=_normalize_slug(market_payload.slug),
        normalized_url=parsed.normalized_url,
        outcomes=outcomes,
        raw_source="gamma",
        sport_or_league=parsed.sport_or_league,
        token_ids=token_ids,
        warnings=warnings,
        question=(market_payload.question or "").strip(),
    )


def _select_market_from_event(
    event_payload: PolymarketEventPayload | None,
) -> tuple[PolymarketMarketDetailsPayload | None, list[str]]:
    if event_payload is None:
        return None, []
    candidates = [
        PolymarketMarketDetailsPayload.model_validate(market.model_dump(mode="python"))
        for market in event_payload.markets
        if market.question
    ]
    if not candidates:
        return None, ["event_has_no_markets"]
    active_candidate = next((candidate for candidate in candidates if candidate.active and not candidate.closed), None)
    chosen = active_candidate or candidates[0]
    warnings: list[str] = []
    if len(candidates) > 1:
        warnings.append("multiple_event_markets_resolved_to_primary_market")
    return chosen, warnings


def _normalize_outcomes(
    market_payload: PolymarketMarketDetailsPayload,
    token_ids: list[str],
) -> list[ResolvedPolymarketOutcome]:
    labels = [label.strip() for label in market_payload.outcomes if isinstance(label, str) and label.strip()]
    if labels:
        return [
            ResolvedPolymarketOutcome(
                label=label,
                side=_outcome_side(label),
                token_id=token_ids[index] if index < len(token_ids) else None,
            )
            for index, label in enumerate(labels)
        ]

    normalized: list[ResolvedPolymarketOutcome] = []
    for index, token in enumerate(market_payload.outcome_tokens):
        label = str(token.get("outcome") or token.get("name") or token.get("label") or "").strip()
        if not label:
            continue
        normalized.append(
            ResolvedPolymarketOutcome(
                label=label,
                side=_outcome_side(label),
                token_id=_clean_identifier(token.get("token_id") or token.get("tokenId") or token.get("id"))
                or (token_ids[index] if index < len(token_ids) else None),
            )
        )
    return normalized


def _normalize_token_ids(clob_token_ids: list[str], outcome_tokens: list[dict[str, object]]) -> list[str]:
    identifiers = [_clean_identifier(token_id) for token_id in clob_token_ids]
    cleaned = [identifier for identifier in identifiers if identifier]
    if cleaned:
        return cleaned
    derived: list[str] = []
    for token in outcome_tokens:
        identifier = _clean_identifier(token.get("token_id") or token.get("tokenId") or token.get("id"))
        if identifier:
            derived.append(identifier)
    return derived


def _outcome_side(label: str) -> str:
    normalized = label.strip().lower()
    if normalized == "yes":
        return "YES"
    if normalized == "no":
        return "NO"
    if normalized in {"draw", "empate"}:
        return "DRAW"
    return label.strip()[:160] or "UNKNOWN"


def _normalize_slug(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = _normalize_segment(value)
    return cleaned or None


def _normalize_segment(value: str) -> str:
    normalized = value.strip().lower()
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^a-z0-9-]+", "-", normalized)
    normalized = re.sub(r"-{2,}", "-", normalized)
    return normalized.strip("-")


def _clean_identifier(value: object) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    if not cleaned or len(cleaned) > 180 or re.search(r"[^a-zA-Z0-9_.:-]", cleaned):
        return None
    return cleaned


def _is_blocked_host(hostname: str) -> bool:
    normalized = hostname.lower().strip("[]")
    if normalized in BLOCKED_HOSTS:
        return True
    try:
        ip = ipaddress.ip_address(normalized)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback or ip.is_link_local
