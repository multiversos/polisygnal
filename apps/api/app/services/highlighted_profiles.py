from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
import re

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.highlighted_wallet_profile import HighlightedWalletProfile
from app.schemas.highlighted_profile import (
    HighlightedProfileSourceMarket,
    HighlightedWalletProfileList,
    HighlightedWalletProfileRead,
    HighlightedWalletProfileUpsert,
)

HIGHLIGHTED_PROFILE_MIN_WIN_RATE = Decimal("0.8")
HIGHLIGHTED_PROFILE_MIN_CLOSED_MARKETS = 50
HIGHLIGHTED_PROFILE_MIN_OBSERVED_CAPITAL_USD = Decimal("100")
WALLET_PATTERN = re.compile(r"^0x[a-f0-9]{40}$")
MAX_HISTORY_ITEMS = 25
MAX_TEXT_ITEMS = 20


class HighlightedProfileValidationError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def list_highlighted_profiles(
    db: Session,
    *,
    min_win_rate: Decimal | None = None,
    min_closed_markets: int | None = None,
    has_pnl: bool | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
    sort: str = "last_seen",
) -> HighlightedWalletProfileList:
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    stmt = select(HighlightedWalletProfile)
    count_stmt = select(func.count()).select_from(HighlightedWalletProfile)

    filters = []
    if min_win_rate is not None:
        filters.append(HighlightedWalletProfile.win_rate >= _normalize_win_rate(min_win_rate))
    if min_closed_markets is not None:
        filters.append(HighlightedWalletProfile.closed_markets >= min_closed_markets)
    if has_pnl is True:
        filters.append(
            or_(
                HighlightedWalletProfile.realized_pnl.is_not(None),
                HighlightedWalletProfile.unrealized_pnl.is_not(None),
            )
        )
    if q:
        cleaned = q.strip().lower()[:120]
        if cleaned:
            pattern = f"%{cleaned}%"
            filters.append(
                or_(
                    func.lower(HighlightedWalletProfile.wallet_address).like(pattern),
                    func.lower(HighlightedWalletProfile.short_address).like(pattern),
                    func.lower(HighlightedWalletProfile.pseudonym).like(pattern),
                    func.lower(HighlightedWalletProfile.public_name).like(pattern),
                    func.lower(HighlightedWalletProfile.x_username).like(pattern),
                    func.lower(HighlightedWalletProfile.source_market_title).like(pattern),
                    func.lower(HighlightedWalletProfile.source_market_slug).like(pattern),
                )
            )

    for where_clause in filters:
        stmt = stmt.where(where_clause)
        count_stmt = count_stmt.where(where_clause)

    if sort == "win_rate":
        stmt = stmt.order_by(
            HighlightedWalletProfile.win_rate.desc().nullslast(),
            HighlightedWalletProfile.closed_markets.desc().nullslast(),
        )
    elif sort == "capital":
        stmt = stmt.order_by(
            HighlightedWalletProfile.observed_capital_usd.desc().nullslast(),
            HighlightedWalletProfile.last_seen_at.desc(),
        )
    else:
        stmt = stmt.order_by(
            HighlightedWalletProfile.last_seen_at.desc(),
            HighlightedWalletProfile.updated_at.desc(),
        )

    items = list(db.scalars(stmt.offset(safe_offset).limit(safe_limit)).all())
    total = int(db.scalar(count_stmt) or 0)
    return HighlightedWalletProfileList(
        items=[serialize_highlighted_profile(item) for item in items],
        total=total,
    )


def get_highlighted_profile(db: Session, wallet_address: str) -> HighlightedWalletProfile | None:
    wallet = normalize_wallet_address(wallet_address)
    if wallet is None:
        return None
    return db.scalar(
        select(HighlightedWalletProfile)
        .where(HighlightedWalletProfile.wallet_address == wallet)
        .limit(1)
    )


def upsert_highlighted_profile(
    db: Session,
    payload: HighlightedWalletProfileUpsert,
) -> HighlightedWalletProfile:
    wallet = normalize_wallet_address(payload.wallet_address)
    if wallet is None:
        raise HighlightedProfileValidationError("invalid_wallet_address")

    existing = get_highlighted_profile(db, wallet)
    qualifies, reason = evaluate_profile_qualification(payload)
    if existing is None and not qualifies:
        raise HighlightedProfileValidationError(reason)

    now = datetime.now(tz=UTC)
    profile = existing or HighlightedWalletProfile(wallet_address=wallet)
    if existing is None:
        profile.first_detected_at = payload.detected_at or now

    profile.wallet_address = wallet
    profile.short_address = payload.short_address or _short_address(wallet)
    profile.profile_url = payload.profile_url or f"https://polymarket.com/profile/{wallet}"
    profile.pseudonym = _clean_optional(payload.pseudonym)
    profile.public_name = _clean_optional(payload.name)
    profile.profile_image_url = _clean_optional(payload.avatar_url, max_length=1024)
    profile.x_username = _clean_optional(payload.x_username)
    profile.verified_badge = payload.verified_badge
    profile.win_rate = _normalize_win_rate(payload.win_rate) if payload.win_rate is not None else profile.win_rate
    profile.closed_markets = payload.closed_markets if payload.closed_markets is not None else profile.closed_markets
    profile.wins = payload.wins if payload.wins is not None else profile.wins
    profile.losses = payload.losses if payload.losses is not None else profile.losses
    profile.realized_pnl = payload.realized_pnl if payload.realized_pnl is not None else profile.realized_pnl
    profile.unrealized_pnl = payload.unrealized_pnl if payload.unrealized_pnl is not None else profile.unrealized_pnl
    profile.observed_capital_usd = _merge_observed_capital(
        profile.observed_capital_usd,
        payload.observed_capital_usd,
    )
    profile.qualifies = qualifies
    profile.qualification_reason = reason
    profile.no_longer_qualifies = bool((existing is not None and not qualifies) or payload.no_longer_qualifies)
    profile.source = _clean_optional(payload.source, max_length=120) or "wallet_intelligence"

    source_market = _resolve_source_market(payload)
    profile.source_market_title = (
        payload.source_market_title
        or source_market.source_market_title if source_market is not None else payload.source_market_title
    )
    profile.source_market_slug = (
        payload.source_market_slug
        or source_market.source_market_slug if source_market is not None else payload.source_market_slug
    )
    profile.source_market_url = (
        payload.source_market_url
        or source_market.source_market_url if source_market is not None else payload.source_market_url
    )
    profile.source_sport = _clean_optional(payload.source_sport, max_length=64)
    profile.market_history = _compact_history(payload)
    profile.warnings = _clean_text_list(payload.source_warnings)
    profile.limitations = _clean_text_list(payload.source_limitations)
    profile.last_seen_at = payload.last_seen_at or source_market.detected_at if source_market and source_market.detected_at else payload.last_seen_at or now
    profile.last_refreshed_at = payload.last_updated_at or now
    profile.updated_at = now

    db.add(profile)
    db.flush()
    db.refresh(profile)
    return profile


def serialize_highlighted_profile(profile: HighlightedWalletProfile) -> HighlightedWalletProfileRead:
    return HighlightedWalletProfileRead.model_validate(
        {
            "id": profile.id,
            "wallet_address": profile.wallet_address,
            "short_address": profile.short_address,
            "profile_url": profile.profile_url,
            "pseudonym": profile.pseudonym,
            "public_name": profile.public_name,
            "profile_image_url": profile.profile_image_url,
            "x_username": profile.x_username,
            "verified_badge": profile.verified_badge,
            "win_rate": profile.win_rate,
            "closed_markets": profile.closed_markets,
            "wins": profile.wins,
            "losses": profile.losses,
            "realized_pnl": profile.realized_pnl,
            "unrealized_pnl": profile.unrealized_pnl,
            "observed_capital_usd": profile.observed_capital_usd,
            "qualifies": profile.qualifies,
            "qualification_reason": profile.qualification_reason,
            "no_longer_qualifies": profile.no_longer_qualifies,
            "source": profile.source,
            "source_market_title": profile.source_market_title,
            "source_market_slug": profile.source_market_slug,
            "source_market_url": profile.source_market_url,
            "source_sport": profile.source_sport,
            "market_history": profile.market_history or [],
            "warnings": profile.warnings or [],
            "limitations": profile.limitations or [],
            "first_detected_at": profile.first_detected_at,
            "last_seen_at": profile.last_seen_at,
            "last_refreshed_at": profile.last_refreshed_at,
            "created_at": profile.created_at,
            "updated_at": profile.updated_at,
        }
    )


def normalize_wallet_address(value: str | None) -> str | None:
    if not value:
        return None
    wallet = value.strip().lower()
    return wallet if WALLET_PATTERN.match(wallet) else None


def evaluate_profile_qualification(payload: HighlightedWalletProfileUpsert) -> tuple[bool, str]:
    wallet = normalize_wallet_address(payload.wallet_address)
    if wallet is None:
        return False, "invalid_wallet_address"
    win_rate = _normalize_win_rate(payload.win_rate) if payload.win_rate is not None else None
    if win_rate is None:
        return False, "win_rate_unavailable"
    if win_rate < HIGHLIGHTED_PROFILE_MIN_WIN_RATE:
        return False, "win_rate_below_threshold"
    if payload.closed_markets is None:
        return False, "closed_markets_unavailable"
    if payload.closed_markets < HIGHLIGHTED_PROFILE_MIN_CLOSED_MARKETS:
        return False, "closed_markets_below_threshold"
    has_real_pnl = payload.realized_pnl is not None or payload.unrealized_pnl is not None
    observed_capital = payload.observed_capital_usd or Decimal("0")
    if not has_real_pnl and observed_capital < HIGHLIGHTED_PROFILE_MIN_OBSERVED_CAPITAL_USD:
        return False, "missing_real_pnl_or_relevant_capital"
    return True, "meets_highlighted_profile_thresholds"


def _normalize_win_rate(value: Decimal | float | int | str | None) -> Decimal | None:
    if value is None:
        return None
    parsed = value if isinstance(value, Decimal) else Decimal(str(value))
    if Decimal("0") <= parsed <= Decimal("1"):
        return parsed
    if Decimal("1") < parsed <= Decimal("100"):
        return parsed / Decimal("100")
    return None


def _short_address(wallet: str) -> str:
    return f"{wallet[:6]}...{wallet[-4:]}"


def _clean_optional(value: str | None, *, max_length: int = 120) -> str | None:
    if not value:
        return None
    cleaned = " ".join(value.replace("\x00", " ").split()).strip()
    if not cleaned:
        return None
    return cleaned[:max_length]


def _clean_text_list(values: list[str]) -> list[str]:
    cleaned: list[str] = []
    for value in values[:MAX_TEXT_ITEMS]:
        item = _clean_optional(value, max_length=240)
        if item and item not in cleaned:
            cleaned.append(item)
    return cleaned


def _merge_observed_capital(
    existing: Decimal | None,
    incoming: Decimal | None,
) -> Decimal | None:
    values = [value for value in (existing, incoming) if value is not None]
    if not values:
        return None
    return max(values)


def _compact_history(payload: HighlightedWalletProfileUpsert) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for item in payload.history[:MAX_HISTORY_ITEMS]:
        dumped = item.model_dump(by_alias=True, exclude_none=True)
        if len(str(dumped)) > 4000:
            continue
        items.append(dumped)
    return items


def _resolve_source_market(payload: HighlightedWalletProfileUpsert) -> HighlightedProfileSourceMarket | None:
    if payload.source_markets:
        return payload.source_markets[-1]
    if payload.source_market_slug or payload.source_market_title or payload.source_market_url:
        return HighlightedProfileSourceMarket(
            detected_at=payload.detected_at,
            source_market_slug=payload.source_market_slug,
            source_market_title=payload.source_market_title,
            source_market_url=payload.source_market_url,
        )
    return None
