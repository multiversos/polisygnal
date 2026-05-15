import { assert, loadTsModule } from "./lib/test-loader.mjs";

const {
  buildSportsContextParticipants,
} = loadTsModule("app/lib/sportsContext.ts");

const spursContext = buildSportsContextParticipants({
  league: "nba",
  marketSlug: "nba-sas-min-2026-05-15",
  marketTitle: "Spurs vs. Timberwolves",
  outcomePrices: [
    { label: "Spurs", price: 0.66, side: "UNKNOWN" },
    { label: "Timberwolves", price: 0.34, side: "UNKNOWN" },
  ],
  sport: "nba",
});

assert(
  JSON.stringify(spursContext.participants) === JSON.stringify(["Spurs", "Timberwolves"]),
  `expected Spurs/Timberwolves participants, got ${JSON.stringify(spursContext.participants)}`,
);
assert(spursContext.eventDate === "2026-05-15", `expected 2026-05-15, got ${spursContext.eventDate}`);
assert(spursContext.reliableHomeAway === false, "home/away must stay unconfirmed without external source");

const pistonsContext = buildSportsContextParticipants({
  league: "nba",
  marketSlug: "nba-det-cle-2026-05-15",
  sport: "nba",
});
assert(
  JSON.stringify(pistonsContext.participants) === JSON.stringify(["Pistons", "Cavaliers"]),
  `expected Pistons/Cavaliers participants, got ${JSON.stringify(pistonsContext.participants)}`,
);

const thunderContext = buildSportsContextParticipants({
  league: "nba",
  marketSlug: "nba-okc-lal-2026-05-16",
  sport: "basketball",
});
assert(
  JSON.stringify(thunderContext.participants) === JSON.stringify(["Thunder", "Lakers"]),
  `expected Thunder/Lakers participants, got ${JSON.stringify(thunderContext.participants)}`,
);

console.log(
  JSON.stringify(
    {
      participants_ok: true,
      status: "ok",
    },
    null,
    2,
  ),
);
