import { assert, loadTsModule } from "./lib/test-loader.mjs";

const {
  compareExternalOdds,
  buildOddsBlazeRequestUrl,
} = loadTsModule("app/lib/externalOddsProvider.ts");
const {
  americanOddsToProbability,
  decimalOddsToProbability,
  normalizeProbabilityValue,
} = loadTsModule("app/lib/oddsProviders/oddsBlaze.ts");

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("ODDS_PROVIDER_")) {
      delete process.env[key];
    }
  }
}

function restore() {
  process.env = ORIGINAL_ENV;
  globalThis.fetch = ORIGINAL_FETCH;
}

const fixtureInput = {
  eventDate: "2026-05-15",
  eventSlug: "nba-sas-min-2026-05-15",
  league: "nba",
  marketSlug: "nba-sas-min-2026-05-15",
  marketTitle: "Spurs vs. Timberwolves",
  outcomePrices: [
    { label: "Spurs", price: 0.66, side: "UNKNOWN" },
    { label: "Timberwolves", price: 0.34, side: "UNKNOWN" },
  ],
  sport: "nba",
};

try {
  resetEnv();

  process.env.ODDS_PROVIDER_ENABLED = "false";
  let result = await compareExternalOdds(fixtureInput);
  assert(result.status === "disabled", `expected disabled provider status, got ${result.status}`);

  process.env.ODDS_PROVIDER_ENABLED = "true";
  process.env.ODDS_PROVIDER_NAME = "OddsBlaze";
  process.env.ODDS_PROVIDER_BASE_URL = "https://odds.oddsblaze.com/";
  process.env.ODDS_PROVIDER_SPORTSBOOK = "draftkings";
  process.env.ODDS_PROVIDER_LEAGUE = "nba";
  process.env.ODDS_PROVIDER_TIMEOUT_MS = "10000";
  process.env.ODDS_PROVIDER_TRIAL_MODE = "true";

  result = await compareExternalOdds(fixtureInput);
  assert(
    result.status === "unavailable" || result.status === "disabled",
    `expected unavailable provider status without key, got ${result.status}`,
  );

  process.env.ODDS_PROVIDER_API_KEY = "fixture-secret";
  globalThis.fetch = async () => {
    const error = new Error("timeout");
    error.name = "AbortError";
    throw error;
  };
  result = await compareExternalOdds(fixtureInput);
  assert(result.status === "timeout", `expected timeout status, got ${result.status}`);

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        events: [
          {
            date: "2026-05-15T19:00:00.000Z",
            live: false,
            odds: [],
            teams: {
              away: { abbreviation: "BOS", name: "Boston Celtics" },
              home: { abbreviation: "NYK", name: "New York Knicks" },
            },
          },
        ],
        league: { id: "nba", name: "NBA" },
        sportsbook: { id: "draftkings", name: "DraftKings" },
        updated: "2026-05-15T14:00:00.000Z",
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );
  result = await compareExternalOdds(fixtureInput);
  assert(result.status === "no_match", `expected no_match, got ${result.status}`);

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        events: [
          {
            date: "2026-05-15T19:00:00.000Z",
            live: false,
            odds: [
              {
                links: { desktop: "https://sportsbook.draftkings.com/event/fixture" },
                main: true,
                market: "Moneyline",
                name: "Spurs",
                price: "0.61",
              },
              {
                links: { desktop: "https://sportsbook.draftkings.com/event/fixture" },
                main: true,
                market: "Moneyline",
                name: "Timberwolves",
                price: "0.39",
              },
            ],
            teams: {
              away: { abbreviation: "SAS", name: "Spurs" },
              home: { abbreviation: "MIN", name: "Timberwolves" },
            },
          },
        ],
        league: { id: "nba", name: "NBA" },
        sportsbook: { id: "draftkings", name: "DraftKings" },
        updated: "2026-05-15T14:00:00.000Z",
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );
  result = await compareExternalOdds(fixtureInput);
  assert(result.status === "available", `expected available, got ${result.status}`);
  assert(result.matchedMarket === true, "matched NBA odds should mark matchedMarket=true");
  assert(result.outcomes.length === 2, `expected 2 outcomes, got ${result.outcomes.length}`);
  assert(!JSON.stringify(result).includes("fixture-secret"), "API key must not appear in the sanitized result");

  const requestUrl = buildOddsBlazeRequestUrl(fixtureInput);
  assert(requestUrl.searchParams.get("price") === "probability", "provider should prefer probability format");
  assert(requestUrl.searchParams.get("market") === "moneyline", "provider should request moneyline first");

  assert(Math.abs(americanOddsToProbability(-110) - 0.5238095238) < 0.000001, "american odds conversion is incorrect");
  assert(Math.abs(decimalOddsToProbability(2.5) - 0.4) < 0.000001, "decimal odds conversion is incorrect");
  assert(Math.abs(normalizeProbabilityValue("61%") - 0.61) < 0.000001, "probability normalization is incorrect");

  console.log("External odds tests passed");
} finally {
  restore();
}
