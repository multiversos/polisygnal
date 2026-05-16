import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const analyzePath = path.resolve("app/analyze/page.tsx");
const source = fs.readFileSync(analyzePath, "utf8");

assert(
  source.includes("const inferredSportsContext = buildSportsContextParticipants({"),
  "analyze flow must infer sports context before deciding whether to query external odds",
);
assert(
  source.includes('const marketSport = inferredSportsContext.sport;'),
  "analyze flow must use inferred sports context as the gate for external odds",
);
assert(
  source.includes('league: sportsContext.league ? sportsContext.league.toLowerCase() : input.item.market?.sport_type ?? null'),
  "external odds request must send inferred league when available",
);
assert(
  source.includes('sport: sportsContext.sport !== "unknown" ? sportsContext.sport : input.item.market?.sport_type ?? null'),
  "external odds request must send inferred sport when available",
);

console.log("Analyze external odds flow tests passed");
