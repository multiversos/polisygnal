import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { appRoot, assert, loadTsModule } from "./lib/test-loader.mjs";

const {
  PROFILE_ALERT_DEDUPE_WINDOW_MS,
  PROFILE_ALERTS_STORAGE_EVENT,
  buildProfileAlertsFromWalletSummary,
  dedupeProfileAlerts,
  profileAlertReason,
} = loadTsModule("app/lib/profileAlerts.ts");

const analyzePageSource = readFileSync(resolve(appRoot, "app/analyze/page.tsx"), "utf8");
const alertsPageSource = readFileSync(resolve(appRoot, "app/alerts/page.tsx"), "utf8");
const appShellSource = readFileSync(resolve(appRoot, "app/components/AppShell.tsx"), "utf8");
const profilesPageSource = readFileSync(resolve(appRoot, "app/profiles/page.tsx"), "utf8");
const profileAlertsSource = readFileSync(resolve(appRoot, "app/lib/profileAlerts.ts"), "utf8");

const walletAddress = "0xe1e7036279433715711a65fc3254a8af558c5fb6";
const summary = {
  analyzedCapitalUsd: 793393.94,
  available: true,
  confidence: "medium",
  publicActivities: [
    {
      action: "position",
      activityType: "position",
      amountUsd: 2500,
      closedMarkets: 80,
      id: "detected",
      limitations: [],
      outcome: "Spurs",
      positionSize: 2500,
      price: 0.66,
      profile: {
        profileUrl: `https://polymarket.com/profile/${walletAddress}`,
        pseudonym: "public-profile",
      },
      shortAddress: "0xe1e7...5fb6",
      side: "UNKNOWN",
      source: "wallet_intelligence",
      walletAddress,
      warnings: [],
      winRate: 0.91,
    },
    {
      action: "position",
      activityType: "position",
      amountUsd: 3000,
      closedMarkets: 10,
      id: "not-highlighted",
      limitations: [],
      outcome: "Timberwolves",
      side: "UNKNOWN",
      source: "wallet_intelligence",
      walletAddress: "0x2222222222222222222222222222222222222222",
      warnings: [],
      winRate: 0.75,
    },
  ],
  reason: "Fixture wallet data.",
  relevantWalletsCount: 2,
  signalDirection: "UNKNOWN",
  thresholdUsd: 100,
  warnings: [],
};

const alerts = buildProfileAlertsFromWalletSummary(summary, {
  marketSlug: "nba-sas-min-2026-05-15",
  marketTitle: "Spurs vs. Timberwolves",
  marketUrl: "https://polymarket.com/event/nba-sas-min-2026-05-15",
  source: "analyze",
});

assert(PROFILE_ALERT_DEDUPE_WINDOW_MS === 24 * 60 * 60 * 1000, "profile alert dedupe window must be 24h");
assert(PROFILE_ALERTS_STORAGE_EVENT === "polysignal:profile-alerts-updated", "profile alerts must dispatch a storage event");
assert(alerts.length === 1, `expected one highlighted profile alert, got ${alerts.length}`);
assert(alerts[0].walletAddress === walletAddress, "profile alert must keep the public wallet address");
assert(alerts[0].marketTitle === "Spurs vs. Timberwolves", "profile alert must include the source market");
assert(alerts[0].outcome === "Spurs", "profile alert must keep the real outcome");
assert(alerts[0].severity === "important", "winRate >= 90 with 50+ closed markets should be important");
assert(alerts[0].type === "high_winrate_profile_seen", "high win-rate profiles should use the strongest alert type");
assert(profileAlertReason("large_position_detected").includes("Actividad publica"), "large position reason must stay descriptive");
assert(!JSON.stringify(alerts).includes("Timberwolves") || alerts.length === 1, "non-highlighted wallets must not create alerts");

const firstSave = dedupeProfileAlerts([], alerts);
const secondSave = dedupeProfileAlerts(firstSave.alerts, alerts);
assert(firstSave.created.length === 1, "first save should create one profile alert");
assert(secondSave.created.length === 0, "second save within 24h should dedupe profile alert");

assert(analyzePageSource.includes("Alertas de perfiles"), "/analyze must show profile alerts");
assert(analyzePageSource.includes("saveProfileAlertsFromWalletSummary"), "/analyze must generate profile alerts from wallet data");
assert(analyzePageSource.includes("fetchPersistentHighlightedProfiles"), "/analyze should compare against persistent profiles when available");
assert(alertsPageSource.includes("Alertas de perfiles"), "/alerts must include a profile alert section");
assert(alertsPageSource.includes("Marcar como leída") || alertsPageSource.includes("Marcar como leida"), "/alerts must support marking profile alerts as read");
assert(alertsPageSource.includes("Eliminar alerta"), "/alerts must support deleting profile alerts");
assert(alertsPageSource.includes("No hay alertas todavía.") || alertsPageSource.includes("No hay alertas todavia."), "/alerts must have an empty state");
assert(appShellSource.includes("getUnreadProfileAlertCount"), "sidebar must load unread profile alert counts");
assert(appShellSource.includes("app-nav-alert-count"), "sidebar must render an alert counter");
assert(profilesPageSource.includes("Alertas recientes"), "/profiles must show recent alerts in profile detail");
assert(profileAlertsSource.includes("safePolymarketUrl"), "profile alerts must avoid arbitrary market/profile links");
assert(!profileAlertsSource.includes("copia esta wallet"), "profile alerts must not use copy-trading language");
assert(!alertsPageSource.includes("sigue esta wallet"), "/alerts must not recommend following wallets");
assert(!alertsPageSource.includes("copia esta operacion"), "/alerts must not recommend copying operations");
assert(!alertsPageSource.includes("<pre"), "/alerts must not render raw JSON");
assert(!analyzePageSource.includes("wallet.walletAddress"), "/analyze profile alerts must not introduce raw wallet rendering patterns in report cards");

console.log("Profile alerts tests passed");
