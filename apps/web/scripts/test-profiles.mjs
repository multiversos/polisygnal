import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { appRoot, assert, loadTsModule } from "./lib/test-loader.mjs";

const {
  HIGHLIGHTED_PROFILE_MIN_CLOSED_MARKETS,
  HIGHLIGHTED_PROFILE_MIN_OBSERVED_CAPITAL_USD,
  HIGHLIGHTED_PROFILE_MIN_WIN_RATE,
  buildHighlightedProfileFromActivity,
  isHighlightedWalletActivityCandidate,
} = loadTsModule("app/lib/highlightedProfiles.ts");

const profilesSource = readFileSync(resolve(appRoot, "app/profiles/page.tsx"), "utf8");
const appShellSource = readFileSync(resolve(appRoot, "app/components/AppShell.tsx"), "utf8");
const walletDetailsSource = readFileSync(resolve(appRoot, "app/components/WalletIntelligenceDetails.tsx"), "utf8");
const analyzePageSource = readFileSync(resolve(appRoot, "app/analyze/page.tsx"), "utf8");

const walletAddress = "0xe1e7036279433715711a65fc3254a8af558c5fb6";
const eligibleActivity = {
  action: "position",
  activityType: "position",
  amountUsd: 150,
  closedMarkets: 50,
  id: "eligible",
  limitations: [],
  profile: {
    profileUrl: `https://polymarket.com/profile/${walletAddress}`,
    pseudonym: "public-wallet",
  },
  shortAddress: "0xe1e7...5fb6",
  side: "UNKNOWN",
  source: "polymarket_data_api",
  walletAddress,
  warnings: [],
  winRate: 0.8,
  wins: 40,
  losses: 10,
};

assert(HIGHLIGHTED_PROFILE_MIN_WIN_RATE === 0.8, "highlighted profile win-rate gate must stay at 80%");
assert(HIGHLIGHTED_PROFILE_MIN_CLOSED_MARKETS === 50, "highlighted profile closed-market gate must stay at 50");
assert(HIGHLIGHTED_PROFILE_MIN_OBSERVED_CAPITAL_USD === 100, "highlighted profile capital gate must stay at $100");
assert(isHighlightedWalletActivityCandidate(eligibleActivity), "eligible profile should pass strict gates");
assert(
  buildHighlightedProfileFromActivity(eligibleActivity)?.profileUrl === `https://polymarket.com/profile/${walletAddress}`,
  "highlighted profile must keep the verified Polymarket profile URL",
);
assert(
  !isHighlightedWalletActivityCandidate({ ...eligibleActivity, closedMarkets: 2 }),
  "high win rate with too few closed markets must not be saved",
);
assert(
  !isHighlightedWalletActivityCandidate({ ...eligibleActivity, winRate: null }),
  "missing win rate must not be saved",
);
assert(
  !isHighlightedWalletActivityCandidate({ ...eligibleActivity, amountUsd: null, realizedPnl: null, unrealizedPnl: null }),
  "profile without real PnL or relevant capital must not be saved",
);

assert(appShellSource.includes('label: "Perfiles"'), "sidebar must include Perfiles");
assert(profilesSource.includes("Billeteras publicas detectadas con historial fuerte en Polymarket."), "/profiles must explain the section");
assert(profilesSource.includes("localStorage v1"), "/profiles must document local persistence");
assert(profilesSource.includes("Historial pasado no garantiza resultados futuros."), "/profiles must warn about historical performance");
assert(profilesSource.includes("No es recomendacion de copy-trading."), "/profiles must avoid copy-trading framing");
assert(profilesSource.includes("removeHighlightedProfile"), "/profiles must allow removing saved profiles");
assert(walletDetailsSource.includes("Guardar perfil"), "wallet drawer must expose explicit profile save action");
assert(walletDetailsSource.includes("Guardado en Perfiles"), "wallet drawer must show saved state");
assert(analyzePageSource.includes("saveHighlightedProfilesFromWalletSummary"), "/analyze must auto-save eligible highlighted profiles");
assert(analyzePageSource.includes("wallet_profiles"), "progress should include profile enrichment when applicable");
assert(analyzePageSource.includes("wallet_history"), "progress should include wallet history when applicable");
assert(analyzePageSource.includes("wallet_consistency"), "progress should include consistency validation for large markets");
assert(!profilesSource.includes("sigue esta wallet"), "/profiles must not recommend following wallets");
assert(!profilesSource.includes("copia esta operacion"), "/profiles must not recommend copying operations");
assert(!profilesSource.includes("ROI 100%"), "/profiles must not invent ROI copy");
assert(!profilesSource.includes("win rate 100%"), "/profiles must not invent win-rate copy");

console.log("Highlighted profiles tests passed");
