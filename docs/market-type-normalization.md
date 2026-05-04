# Market Type Normalization Plan

This is a planning note only. It does not change production data.

## Current Observations

- The active production dataset currently uses `market_type=match_winner` for soccer markets.
- Older code paths still mention `winner`, especially in legacy repository helpers.
- Research and UI code often use the synonym `market_shape`.
- Discovery currently focuses on `match_winner` unless explicitly widened.

## Canonical Values

Use these canonical `market_type` values for new data:

- `match_winner`: binary market for winner of a single match or game.
- `exact_score`: market for exact final score.
- `halftime_leader`: market for leader at halftime or interval.
- `race_winner`: winner of a race, including horse racing.
- `total_points`: over/under total points, goals, games, or runs.
- `spread`: handicap/spread market.

## Compatibility Aliases

Treat these aliases as read-time compatibility only until a data migration is planned:

- `winner` -> `match_winner`
- `game_winner` -> `match_winner`
- `match_result` -> `match_winner`
- `race` -> `race_winner`
- `over_under` -> `total_points`
- `totals` -> `total_points`
- `handicap` -> `spread`

Do not mutate production rows as part of UI-only work.

## Classification Rules

Prefer payload metadata when reliable. If metadata is missing, classify from normalized title text:

- `match_winner`: phrases like `will X beat Y`, `X vs Y`, or binary team winner markets.
- `exact_score`: phrases containing `exact score`, `correct score`, or explicit final-score picks.
- `halftime_leader`: phrases containing `halftime`, `half time`, `first half`, or interval leader wording.
- `race_winner`: race/event winner wording, especially horse racing markets.
- `total_points`: phrases containing `over`, `under`, `total`, `points`, `goals`, `runs`, or `games`.
- `spread`: phrases containing `spread`, `handicap`, or signed line values.

## UI Labels

- `match_winner`: Ganador del partido
- `exact_score`: Marcador exacto
- `halftime_leader`: Lider al descanso
- `race_winner`: Ganador de carrera
- `total_points`: Total de puntos
- `spread`: Spread / handicap

## Safe Implementation Path

1. Add a shared backend normalization helper with canonical values and aliases.
2. Add tests for the six canonical values and compatibility aliases.
3. Use the helper in discovery/import classification.
4. Use the helper in API filters only as read-time alias support.
5. Defer any production data migration until the mapping is fully tested.

## Open Questions

- Whether championship/futures should remain separate from these six values.
- Whether tennis set/game totals need subtypes or can stay under `total_points`.
- Whether horse racing should use `race_winner` immediately or keep current generic handling until data exists.
