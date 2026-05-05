from __future__ import annotations

from dataclasses import dataclass, field
import re
import unicodedata

from app.models.market import Market
from app.services.nba_team_matching import extract_nba_teams

SUPPORTED_VERTICALS = {"sports", "other"}
SUPPORTED_SPORTS = {
    "basketball",
    "nfl",
    "soccer",
    "nhl",
    "horse_racing",
    "mlb",
    "tennis",
    "cricket",
    "mma",
    "other",
}
SUPPORTED_MARKET_SHAPES = {
    "match_winner",
    "championship",
    "futures",
    "exact_score",
    "halftime_leader",
    "player_prop",
    "team_prop",
    "race_winner",
    "total_points",
    "spread",
    "yes_no_generic",
    "other",
}

SOCCER_CLUB_TERMS = (
    "vissel kobe",
    "cerezo osaka",
    "yokohama f. marinos",
    "yokohama marinos",
    "urawa reds",
    "kawasaki frontale",
    "kashima antlers",
    "gamba osaka",
    "fc tokyo",
    "sanfrecce hiroshima",
    "sagan tosu",
    "nagoya grampus",
    "avispa fukuoka",
    "albirex niigata",
    "shonan bellmare",
    "machida zelvia",
    "tokyo verdy",
    "kyoto sanga",
    "kashiwa reysol",
    "jubilo iwata",
    "vegalta sendai",
    "real madrid",
    "barcelona",
    "atletico",
    "atletico madrid",
    "athletic bilbao",
    "real sociedad",
    "sevilla",
    "valencia",
    "manchester city",
    "manchester united",
    "arsenal",
    "liverpool",
    "chelsea",
    "tottenham",
    "psg",
    "paris saint germain",
    "bayern",
    "borussia dortmund",
    "dortmund",
    "benfica",
    "porto",
    "ajax",
    "sporting cp",
    "inter miami",
    "inter milan",
    "ac milan",
    "juventus",
    "napoli",
    "roma",
    "lazio",
    "atalanta",
    "lafc",
    "boca juniors",
    "river plate",
    "flamengo",
    "palmeiras",
    "corinthians",
    "club america",
    "chivas",
    "tigres",
    "cruz azul",
    "monterrey",
    "fathunionsport",
    "cod meknes",
    "al nassr saudi club",
    "al ahli saudi club",
    "al riyadh saudi club",
    "al qadisiyah saudi club",
    "al taawoun saudi club",
    "al ittihad saudi club",
)
SOCCER_COMPETITION_TERMS = (
    "j league",
    "j1 league",
    "j2 league",
    "mls",
    "premier league",
    "champions league",
    "europa league",
    "la liga",
    "serie a",
    "bundesliga",
    "copa libertadores",
    "copa sudamericana",
    "copa",
    "club world cup",
    "world cup qualifier",
    "world cup qualifying",
)
FOOTBALL_CONTEXT_TERMS = (
    "football club",
    "fc ",
    "cf ",
    "fk ",
    "afc ",
    "sc ",
)

SPORT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "basketball": (
        "nba",
        "basketball",
        "euroleague",
        "euro league",
        "lakers",
        "warriors",
        "celtics",
        "nuggets",
        "knicks",
        "hawks",
        "thunder",
        "mavericks",
        "timberwolves",
        "bucks",
        "heat",
        "suns",
        "clippers",
        "lebron",
        "nikola jokic",
    ),
    "nfl": (
        "nfl",
        "super bowl",
        "chiefs",
        "bills",
        "philadelphia eagles",
        "cowboys",
        "ravens",
        "49ers",
        "bengals",
        "packers",
        "pittsburgh steelers",
        "detroit lions",
        "minnesota vikings",
        "patriots",
    ),
    "soccer": (
        "soccer",
        *SOCCER_CLUB_TERMS,
        *SOCCER_COMPETITION_TERMS,
        *FOOTBALL_CONTEXT_TERMS,
    ),
    "nhl": (
        "nhl",
        "hockey",
        "stanley cup",
        "new york rangers",
        "boston bruins",
        "maple leafs",
        "edmonton oilers",
        "florida panthers",
        "avalanche",
        "dallas stars",
        "montreal canadiens",
        "tampa bay lightning",
        "carolina hurricanes",
        "golden knights",
    ),
    "horse_racing": (
        "horse racing",
        "kentucky derby",
        "derby",
        "preakness",
        "belmont stakes",
        "secretariat",
    ),
    "mlb": (
        "mlb",
        "baseball",
        "world series",
        "dodgers",
        "yankees",
        "mets",
        "red sox",
        "cubs",
        "phillies",
        "padres",
        "braves",
        "giants",
        "twins",
        "nationals",
        "rockies",
        "kbo",
        "lotte giants",
        "doosan bears",
    ),
    "tennis": (
        "tennis",
        "wimbledon",
        "us open",
        "australian open",
        "french open",
        "roland garros",
        "atp",
        "wta",
        "alcaraz",
        "djokovic",
        "sinner",
        "nadal",
        "swiatek",
        "sabalenka",
        "gauff",
        "set handicap",
    ),
    "cricket": (
        "cricket",
        "indian premier league",
        "ipl",
        "t20",
        "odi",
        "test match",
        "test series",
        "wicket",
        "innings",
        "toss",
        "runs",
        "sixes",
        "boundary",
        "pakistan super league",
        "psl",
        "bifa cup",
    ),
    "mma": (
        "mma",
        "ufc",
        "mixed martial arts",
        "fight night",
        "main event",
        "bout",
        "win by ko",
        "knockout",
        "submission",
        "decision",
        "lightweight",
        "welterweight",
        "middleweight",
        "heavyweight",
    ),
}

PLAYER_PROP_HINTS = (
    "score over",
    "score under",
    "points",
    "rebounds",
    "assists",
    "touchdowns",
    "passing yards",
    "rushing yards",
    "receiving yards",
    "goals",
    "strikeouts",
)
TEAM_PROP_HINTS = (
    "team total",
    "win total",
    "regular season wins",
    "score first",
)
EXACT_SCORE_HINTS = (
    "exact score",
    "correct score",
    "final score",
)
HALFTIME_LEADER_HINTS = (
    "leading at halftime",
    "lead at halftime",
    "halftime leader",
    "halftime lead",
    "at halftime",
    "at half time",
    "first half leader",
    "leading at the half",
)
TOTAL_POINTS_HINTS = (
    "total games",
    "total points",
    "total goals",
    "total runs",
    "total score",
    "over under",
    "o/u",
)
SPREAD_HINTS = (
    "spread",
    "handicap",
    "set handicap",
    "run line",
    "puck line",
)
MATCH_WINNER_HINTS = (
    " beat ",
    " beats ",
    " defeat ",
    " defeats ",
    " to beat ",
    " win against ",
    " wins against ",
    " v ",
    " v. ",
    " vs ",
    " vs. ",
    " versus ",
    " who will win series",
    " win series",
)
NON_WINNER_YES_NO_HINTS = (
    "both teams to score",
    "end in a draw",
    "draw at halftime",
    "draw at half time",
    "draw at full time",
    "completed match",
    "will there be a run scored",
    "go the distance",
    "fight to go the distance",
)
NON_WINNER_PROP_HINTS = (
    "who wins the toss",
    "toss match",
    "most sixes",
    "team top batter",
    "set handicap",
    "spread",
    " o/u ",
    "win by ko",
    "ko or tko",
    "win by submission",
    "fight be won",
)
SPORT_INFERENCE_ORDER = (
    "cricket",
    "mma",
    "mlb",
    "nhl",
    "nfl",
    "basketball",
    "soccer",
    "tennis",
    "horse_racing",
)
CHAMPIONSHIP_HINTS = (
    "nba finals",
    "nba championship",
    "championship",
    "champion",
    "title",
    "super bowl",
    "world series",
    "stanley cup",
)
FUTURES_HINTS = (
    "make the playoffs",
    "conference winner",
    "division winner",
    "regular season",
    "season winner",
    "mvp",
    "rookie of the year",
    "coach of the year",
    "most improved",
)
RACE_WINNER_HINTS = (
    "kentucky derby",
    "derby",
    "preakness",
    "belmont stakes",
    "race winner",
)


@dataclass(frozen=True, slots=True)
class ResearchMarketClassification:
    vertical: str
    sport: str
    market_shape: str
    research_template_name: str
    classification_reason: str
    metadata: dict[str, str] = field(default_factory=dict)


def classify_market_research_context(
    *,
    market: Market | None = None,
    question: str | None = None,
    event_title: str | None = None,
    event_category: str | None = None,
    sport_type: str | None = None,
    market_type: str | None = None,
    sport_override: str | None = None,
    market_shape_override: str | None = None,
) -> ResearchMarketClassification:
    market_question = question if question is not None else getattr(market, "question", None)
    market_event = getattr(market, "event", None)
    resolved_event_title = (
        event_title if event_title is not None else getattr(market_event, "title", None)
    )
    resolved_event_category = (
        event_category
        if event_category is not None
        else getattr(market_event, "category", None)
    )
    resolved_sport_type = sport_type if sport_type is not None else getattr(market, "sport_type", None)
    resolved_market_type = (
        market_type if market_type is not None else getattr(market, "market_type", None)
    )
    market_slug = getattr(market, "slug", None)
    event_slug = getattr(market_event, "slug", None)
    text = _combined_text(market_question, resolved_event_title, market_slug, event_slug)

    sport, sport_reason = _infer_sport_with_reason(
        text=text,
        sport_type=resolved_sport_type,
        sport_override=sport_override,
    )
    vertical, vertical_reason = _infer_vertical_with_reason(
        event_category=resolved_event_category,
        sport_type=resolved_sport_type,
        sport=sport,
        text=text,
    )
    market_shape, shape_reason = _infer_market_shape_with_reason(
        text=text,
        sport=sport,
        market_type=resolved_market_type,
        market_shape_override=market_shape_override,
    )
    template_name = select_research_template(
        vertical=vertical,
        sport=sport,
        market_shape=market_shape,
    )
    classification_reason = (
        f"{vertical_reason}; {sport_reason}; {shape_reason}; "
        f"template={template_name}."
    )
    return ResearchMarketClassification(
        vertical=vertical,
        sport=sport,
        market_shape=market_shape,
        research_template_name=template_name,
        classification_reason=classification_reason,
        metadata={
            "vertical_reason": vertical_reason,
            "sport_reason": sport_reason,
            "market_shape_reason": shape_reason,
        },
    )


def classification_from_screening(screening: object) -> ResearchMarketClassification:
    vertical = normalize_vertical(getattr(screening, "vertical", None))
    sport = normalize_sport(getattr(screening, "subvertical", None))
    market_shape = normalize_market_shape(getattr(screening, "market_shape", None))
    template_name = select_research_template(
        vertical=vertical,
        sport=sport,
        market_shape=market_shape,
    )
    reason = (
        "classification derived from existing screening; "
        f"vertical={vertical}; sport={sport}; market_shape={market_shape}; "
        f"template={template_name}."
    )
    return ResearchMarketClassification(
        vertical=vertical,
        sport=sport,
        market_shape=market_shape,
        research_template_name=template_name,
        classification_reason=reason,
        metadata={
            "vertical_reason": "from screening.vertical",
            "sport_reason": "from screening.subvertical",
            "market_shape_reason": "from screening.market_shape",
        },
    )


def infer_sport(
    *,
    question: str | None = None,
    event_title: str | None = None,
    sport_type: str | None = None,
    sport_override: str | None = None,
) -> str:
    sport, _ = _infer_sport_with_reason(
        text=_combined_text(question, event_title),
        sport_type=sport_type,
        sport_override=sport_override,
    )
    return sport


def infer_market_shape(
    *,
    question: str | None = None,
    event_title: str | None = None,
    sport: str | None = None,
    market_type: str | None = None,
    market_shape_override: str | None = None,
) -> str:
    market_shape, _ = _infer_market_shape_with_reason(
        text=_combined_text(question, event_title),
        sport=normalize_sport(sport),
        market_type=market_type,
        market_shape_override=market_shape_override,
    )
    return market_shape


def select_research_template(
    *,
    vertical: str,
    sport: str | None,
    market_shape: str,
) -> str:
    normalized_vertical = normalize_vertical(vertical)
    normalized_sport = normalize_sport(sport)
    normalized_shape = normalize_market_shape(market_shape)
    if normalized_vertical == "sports":
        if normalized_sport == "basketball" and normalized_shape == "match_winner":
            return "sports_nba_match_winner"
        if normalized_sport == "basketball" and normalized_shape in {"championship", "futures"}:
            return "sports_nba_futures"
        return "sports_generic"
    return "generic_market"


def normalize_vertical(value: str | None) -> str:
    parsed = _normalize_key(value)
    if parsed in {"sports", "sport"}:
        return "sports"
    return "other"


def normalize_sport(value: str | None) -> str:
    parsed = _normalize_key(value)
    aliases = {
        "football": "soccer",
        "ufc": "mma",
        "mixed_martial_arts": "mma",
        "hockey": "nhl",
        "ice_hockey": "nhl",
        "horse": "horse_racing",
        "horse_race": "horse_racing",
        "horse_racing": "horse_racing",
        "horses": "horse_racing",
        "nba": "basketball",
        "basketball": "basketball",
        "baseball": "mlb",
    }
    parsed = aliases.get(parsed, parsed)
    if parsed in SUPPORTED_SPORTS:
        return parsed
    return "other"


def normalize_market_shape(value: str | None) -> str:
    parsed = _normalize_key(value)
    aliases = {
        "matchup": "match_winner",
        "match": "match_winner",
        "winner": "match_winner",
        "game_winner": "match_winner",
        "match_result": "match_winner",
        "champion": "championship",
        "championship_winner": "championship",
        "future": "futures",
        "race": "race_winner",
        "correct_score": "exact_score",
        "final_score": "exact_score",
        "halftime": "halftime_leader",
        "first_half": "halftime_leader",
        "over_under": "total_points",
        "totals": "total_points",
        "total": "total_points",
        "handicap": "spread",
        "generic_yes_no": "yes_no_generic",
        "yes_no": "yes_no_generic",
    }
    parsed = aliases.get(parsed, parsed)
    if parsed in SUPPORTED_MARKET_SHAPES:
        return parsed
    return "other"


def _infer_vertical_with_reason(
    *,
    event_category: str | None,
    sport_type: str | None,
    sport: str,
    text: str,
) -> tuple[str, str]:
    category = _normalize_key(event_category)
    if category in {"sports", "sport"}:
        return "sports", "vertical=sports from event category"
    if sport_type:
        return "sports", "vertical=sports from market sport_type"
    if sport != "other":
        return "sports", f"vertical=sports from inferred sport {sport}"
    if _contains_any(text, tuple(keyword for values in SPORT_KEYWORDS.values() for keyword in values)):
        return "sports", "vertical=sports from sports keywords"
    return "other", "vertical=other because no sports context was detected"


def _infer_sport_with_reason(
    *,
    text: str,
    sport_type: str | None,
    sport_override: str | None,
) -> tuple[str, str]:
    if sport_override:
        sport = normalize_sport(sport_override)
        return sport, f"sport={sport} from explicit override"

    normalized_text = f" {_normalize_text(text)} "
    text_sport, text_reason = _infer_sport_from_text(text=text, normalized_text=normalized_text)
    if sport_type:
        sport = normalize_sport(sport_type)
        if text_sport != "other" and text_sport != sport:
            return text_sport, f"{text_reason} overriding market sport_type={sport}"
        return sport, f"sport={sport} from market sport_type"

    if text_sport != "other":
        return text_sport, text_reason

    return "other", "sport=other because no sport-specific keywords matched"


def _infer_sport_from_text(*, text: str, normalized_text: str) -> tuple[str, str]:
    for sport in SPORT_INFERENCE_ORDER:
        keywords = SPORT_KEYWORDS[sport]
        if _contains_any(normalized_text, keywords):
            return sport, f"sport={sport} from keyword match"

    nba_teams = extract_nba_teams(text)
    if nba_teams:
        return "basketball", "sport=basketball from NBA team names"

    if _contains_any(normalized_text, SPORT_KEYWORDS["basketball"]):
        return "basketball", "sport=basketball from keyword match"
    return "other", "sport=other because no sport-specific keywords matched"


def _infer_market_shape_with_reason(
    *,
    text: str,
    sport: str,
    market_type: str | None,
    market_shape_override: str | None,
) -> tuple[str, str]:
    if market_shape_override:
        market_shape = normalize_market_shape(market_shape_override)
        return market_shape, f"market_shape={market_shape} from explicit override"

    normalized_text = f" {_normalize_text(text)} "
    if sport == "horse_racing" or _contains_any(normalized_text, RACE_WINNER_HINTS):
        return "race_winner", "market_shape=race_winner from horse racing/race hints"

    if _contains_any(normalized_text, EXACT_SCORE_HINTS):
        return "exact_score", "market_shape=exact_score from exact/correct score wording"

    if _contains_any(normalized_text, HALFTIME_LEADER_HINTS):
        return "halftime_leader", "market_shape=halftime_leader from halftime leader wording"

    if _contains_any(normalized_text, SPREAD_HINTS):
        return "spread", "market_shape=spread from spread/handicap wording"

    if _contains_any(normalized_text, TOTAL_POINTS_HINTS):
        return "total_points", "market_shape=total_points from total/over-under wording"

    if _looks_like_player_prop(normalized_text):
        return "player_prop", "market_shape=player_prop from player-stat prop hints"

    if _contains_any(normalized_text, TEAM_PROP_HINTS):
        return "team_prop", "market_shape=team_prop from team prop hints"

    if _contains_any(normalized_text, NON_WINNER_PROP_HINTS):
        return "team_prop", "market_shape=team_prop from non-winner sports prop hints"

    if _contains_any(normalized_text, NON_WINNER_YES_NO_HINTS):
        return "yes_no_generic", "market_shape=yes_no_generic from non-winner yes/no sports hints"

    nba_teams = extract_nba_teams(text)
    if _contains_any(normalized_text, MATCH_WINNER_HINTS) or _looks_like_head_to_head(text) or len(nba_teams) >= 2:
        return "match_winner", "market_shape=match_winner from head-to-head wording"

    if sport != "other" and _looks_like_dated_sports_winner(text):
        return "match_winner", "market_shape=match_winner from dated sports winner wording"

    if _contains_any(normalized_text, CHAMPIONSHIP_HINTS):
        return "championship", "market_shape=championship from title/championship wording"

    if _contains_any(normalized_text, FUTURES_HINTS):
        return "futures", "market_shape=futures from season/futures wording"

    normalized_market_type = normalize_market_shape(market_type)
    if normalized_market_type != "other":
        return normalized_market_type, f"market_shape={normalized_market_type} from market_type"

    if text.strip().lower().startswith("will "):
        return "yes_no_generic", "market_shape=yes_no_generic from unresolved yes/no question"
    return "other", "market_shape=other because no shape-specific keywords matched"


def _looks_like_player_prop(normalized_text: str) -> bool:
    if re.search(r"\b(over|under)\s+\d+(?:\.\d+)?\b", normalized_text):
        return True
    return _contains_any(normalized_text, PLAYER_PROP_HINTS)


def _looks_like_head_to_head(text: str) -> bool:
    return bool(re.search(r"\b(?:v|vs|versus)\.?\b", text, flags=re.IGNORECASE))


def _looks_like_dated_sports_winner(text: str) -> bool:
    return bool(
        re.search(
            r"\bwill\s+.+?\s+win\s+on\s+\d{4}-\d{2}-\d{2}\b",
            text,
            flags=re.IGNORECASE,
        )
    )


def _combined_text(*values: str | None) -> str:
    return " ".join(value.strip() for value in values if value and value.strip())


def _normalize_key(value: str | None) -> str:
    return _normalize_text(value or "").replace(" ", "_")


def _normalize_text(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    lowered = ascii_value.lower()
    normalized = re.sub(r"[^a-z0-9.]+", " ", lowered)
    return " ".join(normalized.split())


def _contains_any(normalized_text: str, hints: tuple[str, ...]) -> bool:
    return any(f" {_normalize_text(hint)} " in normalized_text for hint in hints)
