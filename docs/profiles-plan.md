# Highlighted Profiles Persistence

Perfiles v2 stores highlighted public Polymarket wallet profiles in a global
backend registry. It does not create user accounts, private saved profiles, or
ownership semantics.

## Model

Table: `highlighted_wallet_profiles`

The table stores only public Wallet Intelligence / Polymarket profile data:

- normalized full wallet address;
- Polymarket public profile URL;
- public pseudonym/name/avatar when the source returns them;
- real win rate, closed markets, wins/losses and PnL when available;
- observed public capital;
- compact market history;
- warnings and limitations.

It must not store secrets, private user identity, service-role credentials, raw
payloads, complete wallet dumps, invented win rate, invented PnL, invented ROI,
or copy-trading recommendations.

## Qualification Rule

A profile can be inserted as highlighted only when:

- `winRate >= 80%`;
- `closedMarkets >= 50`;
- real PnL is available, or `observedCapitalUsd >= 100`;
- the wallet address is a valid public `0x` + 40 hex address.

If an existing profile later falls below the rule, it is marked
`no_longer_qualifies` and kept for auditability. New invalid profiles are
rejected.

## Frontend Behavior

`/profiles` loads the backend registry first, then merges localStorage v1 as a
fallback and migration source. Eligible local profiles are synced to the backend
through the same-origin route `POST /api/profiles/highlighted`.

If the backend is unavailable, `/profiles` falls back to localStorage and says
that profiles are shown only from this browser.

Without auth, removing a persistent profile means hiding it locally in this
browser. Global delete/admin workflows require future authentication and
ownership/admin checks.

The UI labels persistent registry rows as `Persistente`, local-only rows as
`Solo local`, and uses `Ocultar en este navegador` for global registry profiles.
Copy actions use `Copiar direccion` so the page stays framed as verification of
public data rather than copy-trading.

## API

Backend:

- `GET /profiles/highlighted`
- `GET /profiles/highlighted/{wallet}`
- `POST /profiles/highlighted/upsert`

Frontend same-origin proxy:

- `GET /api/profiles/highlighted`
- `POST /api/profiles/highlighted`

The frontend route only calls fixed backend paths and validates wallet shape
before forwarding writes. It does not accept arbitrary URLs.

## Profile Alerts v1

Profile alerts are local, browser-scoped monitoring records built from public
Wallet Intelligence data during `/analyze`.

- Profiles remain persistent in the global backend registry.
- Alerts stay in `localStorage` because PolySignal has no auth or owner_id yet.
- An alert can be created when a highlighted profile is detected in a newly
  analyzed market, appears with relevant public position/capital data, or has a
  high real win rate with enough closed markets.
- Alerts dedupe by type, wallet, market, outcome and a 24 hour window.
- `/alerts` shows profile alerts with mark-read and delete controls.
- `/profiles` shows recent local alerts for each profile when available.

Alerts are not recommendations, copy-trading instructions, or guarantees. A
future multi-device alert system needs auth, owner_id, and notification
preferences before storing user-specific alert state in the backend.
