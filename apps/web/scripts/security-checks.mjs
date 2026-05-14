import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const moduleCache = new Map();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertTextExcludes(text, blocked, label) {
  const lowerText = String(text).toLowerCase();
  const found = blocked.filter((value) => lowerText.includes(String(value).toLowerCase()));
  assert(found.length === 0, `${label} rendered blocked text: ${found.join(", ")}`);
}

function loadTsModule(relativePath) {
  const absolutePath = resolve(appRoot, relativePath);
  if (moduleCache.has(absolutePath)) {
    return moduleCache.get(absolutePath).exports;
  }
  const source = readFileSync(absolutePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (specifier) => {
    if (specifier.startsWith(".")) {
      const resolvedBase = resolve(dirname(absolutePath), specifier);
      const candidates = [
        resolvedBase,
        `${resolvedBase}.ts`,
        `${resolvedBase}.tsx`,
        `${resolvedBase}.js`,
        `${resolvedBase}.mjs`,
      ];
      const found = candidates.find((candidate) => existsSync(candidate));
      if (found?.endsWith(".ts") || found?.endsWith(".tsx")) {
        return loadTsModule(found);
      }
      if (found) {
        return require(found);
      }
    }
    return require(specifier);
  };
  const context = vm.createContext({
    AbortController,
    clearTimeout,
    console,
    exports: module.exports,
    fetch: (...args) => globalThis.fetch(...args),
    Headers,
    module,
    process,
    Request,
    require: localRequire,
    Response,
    setTimeout,
    URL,
    URLSearchParams,
  });
  new vm.Script(compiled, { filename: absolutePath }).runInContext(context);
  return module.exports;
}

function validatePolymarketLinks() {
  const {
    extractPolymarketSlug,
    extractPossibleMarketTerms,
    getPolymarketUrlValidationMessage,
    isPolymarketUrl,
    normalizePolymarketUrl,
    parsePolymarketLink,
  } = loadTsModule("app/lib/polymarketLink.ts");

  const accepted = [
    "https://polymarket.com/event/test",
    "https://polymarket.com/market/test",
    "polymarket.com/event/test",
  ];
  const rejected = [
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///etc/passwd",
    "ftp://polymarket.com/test",
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://0.0.0.0",
    "http://[::1]",
    "http://169.254.169.254",
    "http://192.168.1.1",
    "http://10.0.0.1",
    "http://172.16.0.1",
    "https://polymarket.com.evil.com",
    "https://evil.com/polymarket.com",
    "https://user:pass@polymarket.com/event/test",
    "https://polymarket.com:444/event/test",
    `https://polymarket.com/event/${"x".repeat(2100)}`,
  ];

  for (const input of accepted) {
    const validation = getPolymarketUrlValidationMessage(input);
    assert(validation.ok, `expected Polymarket URL to be accepted: ${input}`);
    assert(isPolymarketUrl(input), `expected isPolymarketUrl to accept: ${input}`);
    assert(
      normalizePolymarketUrl(input)?.startsWith("https://polymarket.com") ||
        normalizePolymarketUrl(input)?.startsWith("https://www.polymarket.com"),
      `expected normalized HTTPS Polymarket URL for: ${input}`,
    );
  }

  for (const input of rejected) {
    const validation = getPolymarketUrlValidationMessage(input);
    assert(!validation.ok, `expected URL to be rejected: ${input}`);
    assert(!isPolymarketUrl(input), `expected isPolymarketUrl to reject: ${input}`);
    assert(normalizePolymarketUrl(input) === null, `expected normalizePolymarketUrl to reject: ${input}`);
  }

  const localizedSportsLink = "https://polymarket.com/es/sports/laliga/lal-cel-lev-2026-05-12";
  const parsedSports = parsePolymarketLink(localizedSportsLink);
  assert(parsedSports?.locale === "es", "expected localized Polymarket URL locale to be extracted");
  assert(parsedSports?.category === "sports", "expected sports category to be extracted");
  assert(parsedSports?.sportOrLeague === "laliga", "expected sports league segment to be extracted");
  assert(parsedSports?.eventSlug === "lal-cel-lev-2026-05-12", "expected complete event slug from sports URL");
  assert(parsedSports?.dateFromSlug === "2026-05-12", "expected date extracted from slug");
  assert(
    JSON.stringify(parsedSports?.possibleTeamCodes) === JSON.stringify(["cel", "lev"]),
    `expected team codes cel/lev, got ${JSON.stringify(parsedSports?.possibleTeamCodes)}`,
  );
  assert(
    !parsedSports?.searchTerms.includes("lal"),
    `expected league prefix not to become a secondary match term, got ${JSON.stringify(parsedSports?.searchTerms)}`,
  );
  assert(extractPolymarketSlug(localizedSportsLink) === "lal-cel-lev-2026-05-12", "expected raw slug without league prefix");
  assert(!extractPossibleMarketTerms(localizedSportsLink).includes("laliga"), "expected league not to become a strong term");
  const genericEvent = parsePolymarketLink("https://polymarket.com/event/nonexistent-market-for-polysignal-qa-2099-01-01");
  assert(
    genericEvent?.possibleTeamCodes.length === 0,
    `expected generic event slug not to invent team codes, got ${JSON.stringify(genericEvent?.possibleTeamCodes)}`,
  );

  return { accepted: accepted.length, parsed_links: 9, rejected: rejected.length };
}

function validateAnalysisDecisionRules() {
  const { getPolySignalDecision, shouldCountForAccuracy } = loadTsModule("app/lib/analysisDecision.ts");

  const yesDecision = getPolySignalDecision({ polySignalYesProbability: 0.56, polySignalNoProbability: 0.44 });
  assert(yesDecision.decision === "clear", "expected YES 56% to be a clear decision");
  assert(yesDecision.predictedSide === "YES", "expected YES 56% to set predictedSide YES");
  assert(yesDecision.decisionThreshold === 55, "expected decision threshold to be stored as 55");

  const noDecision = getPolySignalDecision({ polySignalYesProbability: 0.44, polySignalNoProbability: 0.56 });
  assert(noDecision.decision === "clear", "expected NO 56% to be a clear decision");
  assert(noDecision.predictedSide === "NO", "expected NO 56% to set predictedSide NO");

  const weakDecision = getPolySignalDecision({ polySignalYesProbability: 0.51, polySignalNoProbability: 0.49 });
  assert(weakDecision.decision === "weak", "expected 51/49 to stay weak");
  assert(weakDecision.predictedSide === "UNKNOWN", "expected weak decision not to set predictedSide");

  const noEstimateDecision = getPolySignalDecision({});
  assert(noEstimateDecision.decision === "none", "expected missing PolySignal estimate to be none");
  assert(noEstimateDecision.predictedSide === "UNKNOWN", "expected missing estimate not to set predictedSide");

  assert(
    !shouldCountForAccuracy({ decision: "clear", predictedSide: "YES", result: "pending" }),
    "expected pending clear prediction not to count for accuracy yet",
  );
  assert(
    !shouldCountForAccuracy({ decision: "weak", predictedSide: "UNKNOWN", result: "miss" }),
    "expected weak decision not to count as miss",
  );
  assert(
    shouldCountForAccuracy({ decision: "clear", predictedSide: "YES", result: "hit" }),
    "expected resolved clear prediction to count",
  );

  return { cases: 7, threshold: 55 };
}

function validateEstimateQualityRules() {
  const {
    getEstimateQuality,
    getRealPolySignalProbabilities,
    hasRealPolySignalEstimate,
  } = loadTsModule("app/lib/marketEstimateQuality.ts");

  const marketPriceOnly = {
    latest_prediction: {
      edge_signed: 0,
      no_probability: 0.835,
      used_evidence_in_scoring: false,
      used_news_count: 0,
      used_odds_count: 0,
      yes_probability: 0.165,
    },
    latest_snapshot: {
      no_price: 0.835,
      yes_price: 0.165,
    },
  };
  assert(
    getEstimateQuality(marketPriceOnly) === "market_price_only",
    "expected market-price mirror not to be treated as PolySignal estimate",
  );
  assert(
    getRealPolySignalProbabilities(marketPriceOnly) === null,
    "expected market-price mirror to hide PolySignal probabilities",
  );

  const realEstimate = {
    latest_prediction: {
      edge_signed: 0.08,
      no_probability: 0.755,
      used_evidence_in_scoring: true,
      used_news_count: 1,
      used_odds_count: 1,
      yes_probability: 0.245,
    },
    latest_snapshot: {
      no_price: 0.835,
      yes_price: 0.165,
    },
  };
  assert(hasRealPolySignalEstimate(realEstimate), "expected evidence-backed estimate to be real");
  assert(
    getRealPolySignalProbabilities(realEstimate)?.yes === 0.245,
    "expected real PolySignal probability to be preserved",
  );

  const savedWithoutEvidence = {
    polySignalNoProbability: 0.44,
    polySignalYesProbability: 0.56,
  };
  assert(
    getEstimateQuality(savedWithoutEvidence) === "saved_without_evidence",
    "expected raw saved PolySignal probability without quality to be downgraded",
  );
  assert(
    getRealPolySignalProbabilities(savedWithoutEvidence) === null,
    "expected raw saved probability without quality to be hidden",
  );

  return { cases: 3 };
}

function validateEstimateEngineRules() {
  const {
    getEstimateReadiness,
    getEstimateReadinessScore,
  } = loadTsModule("app/lib/estimationSignals.ts");
  const { getPolySignalEstimate } = loadTsModule("app/lib/polySignalEstimateEngine.ts");
  const {
    extractSoccerMatchContext,
    getSoccerContextReadiness,
    getTeamNamesFromTitle,
  } = loadTsModule("app/lib/soccerMatchContext.ts");

  const marketOnly = {
    market: {
      end_date: "2026-05-09T14:00:00Z",
      event_title: "Brighton & Hove Albion FC vs. Wolverhampton Wanderers FC",
      sport_type: "soccer",
    },
    latest_prediction: {
      edge_signed: 0,
      no_probability: 0.835,
      used_evidence_in_scoring: false,
      used_news_count: 0,
      used_odds_count: 0,
      yes_probability: 0.165,
    },
    latest_snapshot: {
      liquidity: 1000,
      no_price: 0.835,
      volume: 5000,
      yes_price: 0.165,
    },
  };
  const marketOnlyReadiness = getEstimateReadiness(marketOnly);
  const marketOnlyEstimate = getPolySignalEstimate(marketOnly);
  assert(!marketOnlyReadiness.ready, "expected market-only data not to be estimate-ready");
  assert(
    marketOnlyReadiness.independentSignalCount === 2,
    `expected two neutral soccer context signals, got ${marketOnlyReadiness.independentSignalCount}`,
  );
  assert(!marketOnlyEstimate.available, "expected market-only estimate engine result to be unavailable");
  assert(marketOnlyEstimate.yesProbability === undefined, "expected market-only estimate not to expose YES probability");
  const marketOnlyScore = getEstimateReadinessScore(marketOnly);
  assert(marketOnlyScore.score > 0, "expected non-predictive data readiness score to exist");
  assert(
    marketOnlyScore.disclaimer.includes("no probabilidad"),
    "expected readiness score disclaimer to say it is not outcome probability",
  );

  const teams = getTeamNamesFromTitle("Brighton & Hove Albion FC vs. Wolverhampton Wanderers FC");
  assert(teams.length === 2, `expected two teams from soccer title, got ${teams.length}`);
  const soccerContext = extractSoccerMatchContext(marketOnly);
  const soccerReadiness = getSoccerContextReadiness(soccerContext);
  assert(soccerReadiness.hasTeams, "expected soccer context to identify teams");
  assert(soccerReadiness.hasDate, "expected soccer context to identify match date");
  assert(!soccerReadiness.hasLeague, "expected soccer context not to invent league");

  const realEstimate = {
    latest_prediction: {
      confidence_score: 0.63,
      edge_signed: 0.08,
      no_probability: 0.755,
      used_evidence_in_scoring: true,
      used_news_count: 1,
      used_odds_count: 1,
      yes_probability: 0.245,
    },
    latest_snapshot: {
      no_price: 0.835,
      yes_price: 0.165,
    },
  };
  const realResult = getPolySignalEstimate(realEstimate);
  assert(realResult.available, "expected evidence-backed estimate to be available");
  assert(realResult.yesProbability === 0.245, "expected evidence-backed YES probability to be preserved");
  assert(realResult.signalsUsed.length > 0, "expected evidence-backed estimate to list signals used");

  return { cases: 6 };
}

function validateResearchReadinessRules() {
  const { getResearchCoverage, getMissingResearchCategories } = loadTsModule("app/lib/researchReadiness.ts");
  const { collectIndependentSignals } = loadTsModule("app/lib/estimationSignals.ts");
  const { getPolySignalEstimate } = loadTsModule("app/lib/polySignalEstimateEngine.ts");

  const soccerMarket = {
    market: {
      end_date: "2026-05-09T14:00:00Z",
      event_slug: "epl-bri-wol-2026-05-09",
      event_title: "Brighton & Hove Albion FC vs. Wolverhampton Wanderers FC",
      sport_type: "soccer",
    },
  };
  const emptyCoverage = getResearchCoverage(soccerMarket, []);
  assert(emptyCoverage.realFindingCount === 0, "expected no real findings in empty research coverage");
  assert(emptyCoverage.label === "Sin investigacion externa", `unexpected empty research label ${emptyCoverage.label}`);
  assert(
    getMissingResearchCategories(soccerMarket, []).includes("Forma reciente"),
    "expected missing recent form category",
  );

  const fakeFinding = {
    capturedAt: "2026-05-11T00:00:00Z",
    direction: "NEUTRAL",
    id: "fake",
    isReal: false,
    isUserVisible: false,
    reliability: "high",
    sourceType: "official_team",
    summary: "Fixture-only test record.",
    title: "Fake finding",
  };
  const fakeCoverage = getResearchCoverage(soccerMarket, [fakeFinding]);
  assert(fakeCoverage.realFindingCount === 0, "expected fake findings to be ignored");

  const realFinding = {
    capturedAt: "2026-05-11T00:00:00Z",
    direction: "NEUTRAL",
    id: "official-team-news",
    isReal: true,
    isUserVisible: true,
    reliability: "high",
    sourceName: "Official club site",
    sourceType: "official_team",
    summary: "Verified team news record for test coverage.",
    title: "Official team news",
  };
  const realCoverage = getResearchCoverage(soccerMarket, [realFinding]);
  assert(realCoverage.realFindingCount === 1, "expected one real finding");
  assert(realCoverage.label === "Investigacion parcial", `unexpected real research label ${realCoverage.label}`);

  const signalInput = { ...soccerMarket, externalResearchFindings: [realFinding] };
  const signals = collectIndependentSignals(signalInput);
  assert(
    signals.some((signal) => signal.id === "research-official-team-news"),
    "expected real finding to become an independent signal",
  );
  assert(
    !getPolySignalEstimate(signalInput).available,
    "expected research evidence alone not to create a PolySignal estimate",
  );

  return { cases: 5 };
}

async function validateWalletIntelligenceRules() {
  const {
    WALLET_INTELLIGENCE_THRESHOLD_USD,
    calculateWalletSideBias,
    filterRelevantWallets,
    formatWalletAddress,
    getWalletBiasLabel,
    getWalletConfidenceLabel,
    getWalletIntelligenceForMarket,
    getWalletIntelligenceReadiness,
    getWalletIntelligenceSummary,
    getWalletPublicExplanation,
    getPolymarketWalletIntelligence,
    getWalletSignalSummary,
    getWalletWarnings,
    shouldUseWalletAsAuxiliarySignal,
  } = {
    ...loadTsModule("app/lib/walletIntelligence.ts"),
    ...loadTsModule("app/lib/walletIntelligenceAdapter.ts"),
    ...loadTsModule("app/lib/polymarketWalletIntelligence.ts"),
  };
  const { buildWalletProfileSummary } = loadTsModule("app/lib/walletProfiles.ts");
  const {
    buildConservativePolySignalEstimate,
    buildConservativePolySignalSignalMix,
  } = loadTsModule("app/lib/polySignalSignalMixer.ts");
  const { collectIndependentSignals } = loadTsModule("app/lib/estimationSignals.ts");
  const { getPolySignalEstimate } = loadTsModule("app/lib/polySignalEstimateEngine.ts");
  const polymarketWalletRouteSource = readFileSync(
    resolve(appRoot, "app/api/polymarket-wallet-intelligence/route.ts"),
    "utf8",
  );

  const fullWallet = "0x1234567890abcdef1234567890abcdef12345678";
  const secondWallet = "0x2222222222222222222222222222222222222222";

  assert(WALLET_INTELLIGENCE_THRESHOLD_USD === 100, "expected wallet intelligence threshold to be $100");
  assert(formatWalletAddress(fullWallet) === "0x1234...5678", "expected wallet addresses to be shortened");
  const empty = getWalletIntelligenceSummary({});
  assert(!empty.available, "expected empty wallet intelligence to be unavailable");
  assert(empty.relevantWalletsCount === 0, "expected empty wallet intelligence not to invent wallets");
  assert(empty.signalDirection === "UNKNOWN", "expected empty wallet intelligence not to invent a side");
  assert(!JSON.stringify(empty).includes(fullWallet), "empty wallet summary should not include wallet addresses");
  assert(getWalletBiasLabel(empty) === "Datos de billeteras insuficientes", "expected empty wallet bias label to stay unavailable");
  assert(!shouldUseWalletAsAuxiliarySignal(empty), "expected unavailable wallet summary not to become auxiliary signal");

  const belowThreshold = filterRelevantWallets(
    [{ amountUsd: 99, shortAddress: "", side: "YES", walletAddress: fullWallet }],
    100,
  );
  assert(belowThreshold.length === 0, "expected wallets below $100 to be ignored");

  const relevant = filterRelevantWallets(
    [
      { amountUsd: 150, shortAddress: "", side: "YES", walletAddress: fullWallet },
      { amountUsd: 40, shortAddress: "", side: "NO", walletAddress: secondWallet },
    ],
    100,
  );
  assert(relevant.length === 1, "expected only $100+ wallets to be relevant");
  assert(relevant[0].shortAddress === "0x1234...5678", "expected relevant wallet to store short address");

  const bias = calculateWalletSideBias(
    [
      { amountUsd: 150, shortAddress: "", side: "YES", walletAddress: fullWallet },
      { amountUsd: 140, shortAddress: "", side: "NO", walletAddress: secondWallet },
    ],
    100,
  );
  assert(bias.direction === "NEUTRAL", "expected close wallet capital to stay neutral");

  const readiness = getWalletIntelligenceReadiness({});
  assert(!readiness.available, "expected wallet readiness to be unavailable without data");
  assert(readiness.missing.includes("Posiciones por billetera"), "expected wallet readiness to list missing positions");

  const invalidAdapter = await getWalletIntelligenceForMarket({ marketId: "bad-id" });
  assert(!invalidAdapter.available, "expected invalid wallet adapter input to stay unavailable");

  const originalFetch = globalThis.fetch;
  try {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ init, url: String(url) });
      return new Response(
        JSON.stringify({
          concentration_summary: {
            sides: [{ side: "yes", total_position_size_usd: "1500", wallet_count: 1 }],
            total_position_size_usd: "1500",
          },
          data_available: true,
          generated_at: "2026-05-11T00:00:00Z",
          large_positions: [
            {
              avg_price: "0.41",
              current_price: "0.44",
              outcome: "yes",
              position_size_usd: "1500",
              raw_payload_should_not_leak: "SECRET",
              total_pnl: "24.5",
              wallet_address: fullWallet,
              wallet_short: "0x1234...5678",
            },
          ],
          large_trades: [
            {
              outcome: "no",
              price: "0.31",
              trade_size_usd: "80",
              wallet_address: secondWallet,
              wallet_short: "0x2222...2222",
            },
          ],
          threshold_usd: "100",
          warnings: ["concentrated_side_activity"],
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    };
    const adapter = await getWalletIntelligenceForMarket({ marketId: "46" });
    assert(adapter.available, "expected real backend wallet data to become available");
    assert(adapter.source === "backend", "expected connected adapter to mark backend source");
    assert(adapter.relevantWalletsCount === 1, "expected adapter to filter below-threshold wallet rows");
    assert(adapter.signalDirection === "YES", "expected adapter to use real side bias");
    assert(adapter.topWallets?.[0]?.shortAddress === "0x1234...5678", "expected adapter to keep short wallet address");
    assert(adapter.topWallets?.[0]?.unrealizedPnlUsd === 24.5, "expected adapter to keep only structured public PnL when provided");
    assert(
      adapter.topWallets?.every((wallet) => wallet.walletAddress === wallet.shortAddress),
      "expected adapter not to keep full wallet addresses in sanitized positions",
    );
    const reading = getWalletSignalSummary(adapter);
    assert(reading.available, "expected wallet public signal summary to become available");
    assert(reading.biasLabel === "Capital observado inclinado hacia YES", "expected public wallet bias label");
    assert(getWalletConfidenceLabel(adapter).includes("baja"), "expected wallet confidence to stay low without history");
    assert(getWalletPublicExplanation(adapter).includes("no identifica personas"), "expected public explanation to protect identity");
    assert(shouldUseWalletAsAuxiliarySignal(adapter), "expected real wallet data to be usable only as auxiliary signal");
    assert(
      getWalletWarnings(adapter).some((warning) => warning.includes("Actividad publica observada")),
      "expected human wallet warning labels",
    );
    assert(calls[0].url.includes("/api/backend/markets/46/wallet-intelligence"), "expected adapter to use backend proxy route");
    assert(calls[0].init?.method === "GET", "expected adapter to use GET only");
    assert(calls[0].init?.credentials === "omit", "expected adapter not to send browser credentials");
    assert(calls[0].init?.redirect === "error", "expected adapter not to follow redirects");
    assert(!JSON.stringify(adapter).includes(fullWallet), "connected adapter leaked a full wallet address");
    assert(!JSON.stringify(adapter).includes("raw_payload_should_not_leak"), "connected adapter leaked raw payload fields");
    assert(!JSON.stringify(adapter).includes("winRate"), "connected adapter should not invent win rate");
    assert(!JSON.stringify(adapter).includes("estimatedRoi"), "connected adapter should not invent ROI");
    assertTextExcludes(
      `${JSON.stringify(adapter)} ${JSON.stringify(reading)}`,
      ["copy this trader", "guaranteed", "whale knows", "insider", "smart money guaranteed"],
      "wallet public copy",
    );

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data_available: false, warnings: ["condition_id_unavailable"] }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    const unavailable = await getWalletIntelligenceForMarket({ marketId: "47" });
    assert(!unavailable.available, "expected no wallet data response to stay unavailable");
    assert(unavailable.reason.includes("Aun no hay datos"), "expected no-data adapter to explain unavailable data");

    globalThis.fetch = async (url, init) => {
      calls.push({ init, url: String(url) });
      return new Response(
        JSON.stringify({
          analyzedCapitalUsd: 250,
          available: true,
          checkedAt: "2026-05-12T00:00:00Z",
          confidence: "low",
          noCapitalUsd: 0,
          profileSummaries: [
            {
              confidence: "unknown",
              profileAvailable: false,
              reason: "No hay historial publico suficiente para calificar esta billetera.",
              shortAddress: "0x1234...5678",
              warnings: ["No se inventa ROI ni win rate sin mercados cerrados reales."],
            },
          ],
          reason: "Actividad publica real.",
          relevantWalletsCount: 1,
          signalDirection: "YES",
          source: "polymarket_data",
          thresholdUsd: 100,
          topWallets: [{ amountUsd: 250, shortAddress: "0x1234...5678", side: "YES", walletAddress: "0x1234...5678" }],
          warnings: ["No se muestran direcciones completas."],
          yesCapitalUsd: 250,
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    };
    const external = await getPolymarketWalletIntelligence({
      conditionId: "0xcondition",
      marketUrl: "https://polymarket.com/event/test",
      tokenIds: ["yes-token", "no-token"],
    });
    assert(external.available, "expected Polymarket-first wallet adapter to accept sanitized live wallet data");
    assert(external.source === "polymarket_data", "expected live wallet adapter to mark Polymarket Data source");
    assert(external.profileSummaries?.[0]?.profileAvailable === false, "expected insufficient wallet history to remain unavailable");
    assert(calls.at(-1).url === "/api/polymarket-wallet-intelligence", "expected live wallet adapter to use same-origin wallet route");
    assert(calls.at(-1).init?.method === "POST", "expected live wallet adapter to use POST");
    assert(calls.at(-1).init?.credentials === "omit", "expected live wallet adapter not to send credentials");
    assert(calls.at(-1).init?.redirect === "error", "expected live wallet adapter to reject redirects");
    assert(!JSON.stringify(external).includes(fullWallet), "live wallet adapter leaked a full wallet address");

    const walletRoute = loadTsModule("app/api/polymarket-wallet-intelligence/route.ts");
    globalThis.fetch = async (url) => {
      const target = String(url);
      if (target.includes("/trades")) {
        return new Response(
          JSON.stringify([
            {
              asset: "pistons-token",
              outcome: "Pistons",
              price: "0.39",
              proxyWallet: secondWallet,
              size: "400",
              timestamp: "2026-05-14T20:00:00Z",
              transactionHash: "0xtradehash",
            },
          ]),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        );
      }
      if (target.includes("/v1/market-positions")) {
        return new Response(
          JSON.stringify([
            {
              positions: [
                {
                  avgPrice: "0.61",
                  currentValue: "1500",
                  currPrice: "0.62",
                  outcome: "Cavaliers",
                  proxyWallet: fullWallet,
                  size: "2400",
                  tokenId: "cavaliers-token",
                  totalPnl: "12.5",
                },
              ],
            },
          ]),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        );
      }
      if (target.includes("/closed-positions")) {
        return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" }, status: 200 });
      }
      return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" }, status: 200 });
    };
    const routeResult = await walletRoute.POST(
      new Request("https://example.test/api/polymarket-wallet-intelligence", {
        body: JSON.stringify({
          conditionId: "0xabc123",
          marketUrl: "https://polymarket.com/event/nba-det-cle-2026-05-15",
          minUsd: 100,
          tokenIds: ["pistons-token", "cavaliers-token"],
        }),
        method: "POST",
      }),
    );
    assert(routeResult.status === 200, `expected wallet route fixture to return 200, got ${routeResult.status}`);
    const routeBody = await routeResult.json();
    assert(routeBody.available, "expected wallet route fixture to be available");
    assert(routeBody.relevantWalletsCount === 2, `expected two relevant public wallet rows, got ${routeBody.relevantWalletsCount}`);
    assert(routeBody.analyzedCapitalUsd > 1600, "expected observed capital to include non-YES/NO outcomes");
    assert(routeBody.neutralCapitalUsd > 1600, "expected outcome/neutral capital for team outcomes");
    assert(routeBody.publicActivities.some((activity) => activity.walletAddress === fullWallet), "expected drawer payload to keep full public wallet address");
    assert(routeBody.publicActivities.some((activity) => activity.activityType === "position" && activity.outcome === "Cavaliers"), "expected positions to be visible as activities");
    assert(routeBody.publicActivities.some((activity) => activity.activityType === "trade" && activity.outcome === "Pistons"), "expected trades to be visible as activities");
    assert(!JSON.stringify(routeBody).includes("raw_payload_should_not_leak"), "wallet route leaked raw fields");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const insufficientProfile = buildWalletProfileSummary({
    closedPositions: [],
    currentSide: "YES",
    observedCapitalUsd: 250,
    shortAddress: "0x1234...5678",
  });
  assert(!insufficientProfile.profileAvailable, "expected wallet profile without closed history to stay unavailable");
  assert(insufficientProfile.winRate === undefined, "expected wallet profile not to invent win rate");

  const resolvedProfile = buildWalletProfileSummary({
    closedPositions: [
      { conditionId: "a", realizedPnlUsd: 10, volumeUsd: 100 },
      { conditionId: "b", realizedPnlUsd: 5, volumeUsd: 100 },
      { conditionId: "c", realizedPnlUsd: -2, volumeUsd: 100 },
      { conditionId: "d", realizedPnlUsd: 8, volumeUsd: 100 },
      { conditionId: "e", realizedPnlUsd: -1, volumeUsd: 100 },
    ],
    currentSide: "YES",
    shortAddress: "0x1234...5678",
  });
  assert(resolvedProfile.profileAvailable, "expected enough closed wallet history to create a basic profile");
  assert(resolvedProfile.wins === 3 && resolvedProfile.losses === 2, "expected wallet profile to use real wins/losses only");
  assert(resolvedProfile.winRate === 0.6, "expected wallet win rate to be calculated from real wins/losses");

  const conservativeMix = buildConservativePolySignalSignalMix({
    marketImpliedProbability: { no: 0.4, yes: 0.6 },
    walletSignal: { ...empty, available: true, relevantWalletsCount: 1, signalDirection: "YES" },
  });
  assert(!conservativeMix.finalEstimateAvailable, "expected wallet-only signal mix not to create final PolySignal estimate");
  assert(conservativeMix.status === "estimate_pending", "expected incomplete signal mix to stay pending");

  const validSamanthaReport = {
    completedAt: "2026-05-12T12:00:00.000Z",
    evidence: [
      {
        checkedAt: "2026-05-12T12:00:00.000Z",
        direction: "YES",
        id: "official-yes",
        reliability: "high",
        sourceName: "Official source",
        sourceType: "official",
        sourceUrl: "https://example.com/official",
        summary: "Official fixture context supports YES.",
        title: "Official fixture context",
      },
      {
        checkedAt: "2026-05-12T12:05:00.000Z",
        direction: "YES",
        id: "news-yes",
        reliability: "medium",
        sourceName: "News source",
        sourceType: "news",
        sourceUrl: "https://example.com/news",
        summary: "News fixture context supports YES.",
        title: "News fixture context",
      },
    ],
    marketUrl: "https://polymarket.com/event/test",
    status: "completed",
    suggestedEstimate: {
      available: true,
      confidence: "medium",
      decision: "YES",
      noProbability: 39,
      reason: "Two independent fixture sources support YES.",
      yesProbability: 61,
    },
    version: "1.0",
    warnings: [],
  };
  const gatedEstimate = buildConservativePolySignalEstimate({
    marketImpliedProbability: { no: 0.8, yes: 0.2 },
    samanthaReport: validSamanthaReport,
    walletSignal: empty,
  });
  assert(gatedEstimate.available, "expected valid Samantha report with strong external evidence to create a conservative estimate");
  assert(gatedEstimate.estimateYesProbability === 0.61, "expected PolySignal estimate to preserve Samantha validated YES, not market price");
  assert(gatedEstimate.marketImpliedProbability.yes === 0.2, "expected market price to remain a reference only");
  assert(gatedEstimate.countsForHistoryAccuracy, "expected clear gated estimate to be countable after resolution");
  assert(
    gatedEstimate.contributions.some((contribution) => contribution.source === "market_reference" && !contribution.usedForEstimate),
    "expected market reference contribution not to be used as estimate",
  );

  const missingSamanthaEstimate = buildConservativePolySignalEstimate({
    marketImpliedProbability: { no: 0.4, yes: 0.6 },
    walletSignal: { ...empty, available: true, analyzedCapitalUsd: 500, confidence: "medium", relevantWalletsCount: 3, signalDirection: "YES" },
  });
  assert(!missingSamanthaEstimate.available, "expected no PolySignal estimate without validated Samantha report");
  assert(
    missingSamanthaEstimate.blockers.some((entry) => entry.code === "missing_samantha_report"),
    "expected missing Samantha blocker to stay visible",
  );

  const noMarketReferenceEstimate = buildConservativePolySignalEstimate({
    samanthaReport: validSamanthaReport,
    walletSignal: { ...empty, available: true, analyzedCapitalUsd: 500, confidence: "medium", relevantWalletsCount: 3, signalDirection: "YES" },
  });
  assert(!noMarketReferenceEstimate.available, "expected no estimate without market reference from Polymarket");

  assert(polymarketWalletRouteSource.includes("https://data-api.polymarket.com"), "wallet route must use Polymarket Data API allowlist");
  assert(polymarketWalletRouteSource.includes("SAFE_PATHS"), "wallet route must constrain upstream paths");
  assert(polymarketWalletRouteSource.includes("credentials: \"omit\""), "wallet route must omit credentials");
  assert(polymarketWalletRouteSource.includes("redirect: \"error\""), "wallet route must reject redirects");
  assert(!polymarketWalletRouteSource.includes("NEXT_PUBLIC_API_BASE_URL"), "wallet route must not use internal backend overview fallback");

  const marketWithWalletData = {
    walletIntelligence: {
      positions: [{ amountUsd: 150, shortAddress: "0x1234...5678", side: "YES", walletAddress: "0x1234...5678" }],
      summary: {
        available: true,
        confidence: "low",
        reason: "Fixture only.",
        relevantWalletsCount: 1,
        signalDirection: "YES",
        source: "backend",
        thresholdUsd: 100,
        topWallets: [{ amountUsd: 150, shortAddress: "0x1234...5678", side: "YES", walletAddress: "0x1234...5678" }],
        warnings: [],
      },
    },
  };
  const walletSignals = collectIndependentSignals(marketWithWalletData);
  assert(
    walletSignals.some((signal) => signal.source === "wallet_intelligence"),
    "expected real wallet data to become an auxiliary independent signal",
  );
  assert(
    !getPolySignalEstimate(marketWithWalletData).available,
    "expected wallet data alone not to create a PolySignal estimate",
  );

  return { cases: 55, threshold_usd: WALLET_INTELLIGENCE_THRESHOLD_USD };
}

function validateAnalyzeLoadingPanelSource() {
  const source = readFileSync(resolve(appRoot, "app/components/AnalyzeLoadingPanel.tsx"), "utf8");
  const analyzePage = readFileSync(resolve(appRoot, "app/analyze/page.tsx"), "utf8");
  const marketDetailsSource = readFileSync(resolve(appRoot, "app/components/MarketDataDetails.tsx"), "utf8");
  const walletDetailsSource = readFileSync(resolve(appRoot, "app/components/WalletIntelligenceDetails.tsx"), "utf8");
  const expectedSteps = [
    "Leyendo enlace",
    "Detectando mercado",
    "Cargando datos de Polymarket",
    "Revisando billeteras",
    "${agentName} analizando",
    "Preparando lectura",
  ];

  assert(source.includes("export type AnalyzeLoadingPhase"), "expected typed analyze loading phases");
  assert(source.includes("export function AnalyzeProgressPanel"), "expected clear analyzer progress component");
  assert(source.includes("Analizando hace"), "expected elapsed-time copy in progress panel");
  assert(source.includes("Esto normalmente toma unos segundos."), "expected normal wait guidance");
  assert(source.includes("Esta tardando mas de lo normal"), "expected slow wait guidance");
  assert(source.includes("Puedes reintentar o revisar el enlace"), "expected retry guidance");
  assert(source.includes("${agentName} sigue analizando fuentes automaticas"), "expected honest dynamic agent automatic pending state");
  assert(source.includes("Guardar para continuar luego"), "expected save-for-later recovery action");
  assert(source.includes("Progreso del analisis"), "expected loading panel to expose human analysis progress state");
  assert(source.includes("stepActions"), "expected progress panel to support explicit detail buttons");
  assert(source.includes("Ver billeteras") || analyzePage.includes("Ver billeteras"), "expected wallet detail button copy");
  assert(analyzePage.includes("Ver datos"), "expected market data detail button copy");
  assert(analyzePage.includes("setMarketDetailsOpen(true)"), "market data drawer must open only from click");
  assert(analyzePage.includes("setWalletDetailsOpen(true)"), "wallet drawer must open only from click");
  assert(analyzePage.includes("open={marketDetailsOpen}"), "market data drawer must be closed by default");
  assert(analyzePage.includes("open={walletDetailsOpen}"), "wallet drawer must be closed by default");
  assert(marketDetailsSource.includes("Datos de Polymarket"), "expected market data detail drawer");
  assert(marketDetailsSource.includes("summaryOutcomes"), "market drawer must summarize real outcome prices, not only YES/NO snapshots");
  assert(marketDetailsSource.includes("Fecha disponible"), "market drawer must avoid inventing event time labels");
  assert(marketDetailsSource.includes("conditionId") || marketDetailsSource.includes("ConditionId"), "market drawer must show conditionId state");
  assert(marketDetailsSource.includes("token_id") || marketDetailsSource.includes("TokenId"), "market drawer must show token ids");
  assert(walletDetailsSource.includes("Billeteras analizadas"), "expected wallet detail drawer");
  assert(walletDetailsSource.includes("Billeteras notables"), "wallet drawer must expose notable wallets when the source reports them");
  assert(walletDetailsSource.includes("Hay billeteras relevantes reportadas"), "wallet drawer must explain relevant wallet counts without individual trades");
  assert(walletDetailsSource.includes("walletAddress"), "wallet drawer may render public full wallet addresses by user request");
  assert(walletDetailsSource.includes("Datos tecnicos"), "wallet drawer must keep technical raw fields collapsed");
  assert(!walletDetailsSource.includes("<pre"), "wallet drawer must not render raw JSON by default");
  assert(!walletDetailsSource.includes("copy this trader"), "wallet drawer must not recommend copy-trading");
  assert(!walletDetailsSource.includes("esta wallet sabe"), "wallet drawer must not imply a wallet knows something");
  assert(!walletDetailsSource.includes("ROI 100%"), "wallet drawer must not invent ROI copy");
  assert(!walletDetailsSource.includes("win rate 100%"), "wallet drawer must not invent win-rate copy");
  assert(!source.includes("Deep Analysis Job"), "loading panel should not expose technical Deep Analysis Job title");
  assert(!source.includes("Leyendo Polymarket"), "loading panel should use human Polymarket read copy");
  assert(!source.includes("Analizando mercado seleccionado"), "loading panel should use human market review copy");
  assert(!source.includes("Esperando reporte de Samantha"), "loading panel should not ask for manual Samantha reports");
  assert(!source.includes("Cargar reporte Samantha"), "loading panel should not expose manual report upload");
  assert(!source.includes('return "OK"'), "loading panel should not expose OK as public status copy");
  assert(!source.includes('return "Ahora"'), "loading panel should not expose Ahora as public status copy");
  assert(source.includes("aria-live=\"polite\""), "expected polite live region in loading panel");
  assert(source.includes('aria-busy={isBusy ? "true" : "false"}'), "expected real busy state in loading panel");
  for (const step of expectedSteps) {
    assert(source.includes(step), `expected loading step copy: ${step}`);
  }
  assert(!source.includes("setTimeout"), "loading panel should not use fake timers");
  assert(!source.includes("setInterval"), "loading panel should not use interval-based fake progress");
  assert(!source.includes("100%"), "loading panel should not expose invented percent progress");
  assert(!source.includes("Buscando evidencia externa"), "loading panel must not claim external research is running");
  assert(!source.includes("buscando internet"), "loading panel must not claim internet search is running");
  assert(analyzePage.includes("withRequestTimeout"), "expected frontend request timeouts for analyzer calls");
  assert(analyzePage.includes("AbortController"), "expected analyzer requests to be abortable");
  assert(analyzePage.includes("AnalyzeLoadingPanel"), "expected /analyze to render the loading panel");
  assert(analyzePage.includes("MarketSelectionPanel"), "expected /analyze to render the confirmation selector");
  assert(analyzePage.includes("analyzeSelectedMarket"), "expected /analyze to analyze only a selected market");
  assert(analyzePage.includes("/api/analyze-polymarket-link"), "expected /analyze to resolve links through the safe Polymarket route");
  assert(analyzePage.includes("getPolymarketWalletIntelligence"), "expected /analyze to use Polymarket-first wallet intelligence");
  assert(!analyzePage.includes("getWalletIntelligenceForMarket"), "link analyzer must not use internal market IDs for wallet lookup");
  assert(analyzePage.includes("resolvePolymarketLinkForAnalyze"), "expected /analyze to use the live Polymarket resolver");
  assert(!analyzePage.includes("/markets/overview"), "analyzer must not use internal markets overview for primary matching");
  assert(!analyzePage.includes("rankAnalyzerMatches"), "analyzer must not rank internal markets as the primary source");
  assert(!analyzePage.includes("fetchComparableMarkets"), "analyzer must not fetch comparable internal markets");
  assert(analyzePage.includes("Mercado unico detectado. Continuamos automaticamente"), "expected exact matches to continue automatically");
  assert(analyzePage.includes('status: "analyzing_selected"'), "expected selected-market loading state");
  assert(analyzePage.includes('status: "result"'), "expected single selected result state");
  assert(!analyzePage.includes("enrichMatchesWithWalletIntelligence(matches)"), "expected wallet lookup not to run for all matches");
  assert(analyzePage.includes('advancePhase("matching")'), "expected /analyze loader to enter matching phase");
  assert(analyzePage.includes('advancePhase("context")'), "expected /analyze loader to enter context phase");
  assert(analyzePage.includes('advancePhase("readiness")'), "expected /analyze loader to enter readiness phase");
  assert(analyzePage.includes('advancePhase("research")'), "expected /analyze loader to enter research phase");
  assert(analyzePage.includes('advancePhase("preparing_samantha")'), "expected /analyze loader to prepare analysis agent task");
  assert(analyzePage.includes('advancePhase("sending_samantha")'), "expected /analyze loader to try the safe analysis agent bridge");
  assert(analyzePage.includes("/api/analysis-agent/send-research"), "expected /analyze to call the generic analysis agent route");
  assert(analyzePage.includes("progressIssue"), "expected /analyze to keep progress recovery visible after timeout or error");

  return { phases: expectedSteps.length, recovery_actions: 4, timeout_guard: true };
}

function validateAnalyzerReportSource() {
  const source = readFileSync(resolve(appRoot, "app/components/AnalyzerReport.tsx"), "utf8");
  const analyzePage = readFileSync(resolve(appRoot, "app/analyze/page.tsx"), "utf8");
  const requiredCopy = [
    "Resumen del analisis",
    "Fuentes del analisis",
    "Estado del analisis profundo",
    "Analisis profundo",
    "Capas del motor",
    "Pendiente de integracion",
    "{analysisAgentName} automatico",
    "Lectura rapida de",
    "Lectura parcial automatica",
    "Senales principales",
    "Riesgos",
    "Limitaciones",
    "Que revisar primero",
    "No hay estimacion propia de PolySignal",
    "Fuente automatica no disponible",
    "Actualizar lectura automatica",
    "Guardar y continuar despues",
    "Que puedes hacer ahora",
    "Analizar otro enlace",
    "Capas revisadas",
    "Ver todas las billeteras analizadas",
    "No encontramos datos publicos suficientes de billeteras",
    "Perfil de billeteras",
    "Estimacion PolySignal pendiente",
    "Todavia no hay suficiente evidencia para generar un porcentaje propio",
    "Porcentaje PolySignal",
    "PolySignal separa el precio del mercado de su estimacion propia",
  ];

  assert(analyzePage.includes("AnalyzerReport"), "expected /analyze to render AnalyzerReport");
  assert(source.includes("buildAnalyzerResult"), "expected AnalyzerReport to use unified analyzer result model");
  assert(source.includes("buildDeepAnalysisFromPolymarketMarket"), "expected AnalyzerReport to build deep analyzer readiness");
  assert(source.includes("buildSamanthaResearchBrief"), "expected AnalyzerReport to build compatible research briefs");
  assert(source.includes("buildSamanthaTaskPacket"), "expected AnalyzerReport to keep legacy-compatible task packets");
  assert(source.includes("buildConservativePolySignalEstimate"), "expected AnalyzerReport to use conservative PolySignal estimate gates");
  assert(source.includes("parseSamanthaResearchReport"), "expected AnalyzerReport to validate Samantha reports locally");
  assert(source.includes("handleValidateSamanthaReport"), "expected AnalyzerReport to validate reports before applying");
  assert(source.includes("handleApplySamanthaReport"), "expected AnalyzerReport to apply valid reports explicitly");
  assert(source.includes("NEXT_PUBLIC_SHOW_ANALYZER_DEBUG_TOOLS"), "expected manual Samantha tools to be behind a debug flag");
  assert(source.includes("!SHOW_ANALYZER_DEBUG_TOOLS"), "expected debug tools not to render by default");
  assert(source.includes("mergeSamanthaResearchLayer"), "expected AnalyzerReport to merge Samantha research into deep readiness");
  assert(source.includes("mergeWalletIntelligenceLayer"), "expected AnalyzerReport to merge wallet layer into deep readiness");
  assert(source.includes("getWalletIntelligenceSummary"), "expected AnalyzerReport to summarize wallet intelligence");
  assert(source.includes("getProbabilityDisplayState"), "expected AnalyzerReport to keep market probability separated");
  assert(source.includes("/api/analysis-agent/research-status"), "AnalyzerReport should query agent status only through same-origin route");
  assert(!/fetch\(\s*["']https?:\/\//.test(source), "AnalyzerReport must not call external services for the analysis agent");
  assert(!source.includes("OpenClaw"), "AnalyzerReport must not try to execute OpenClaw");
  assert(!source.includes("Deep Analysis Job"), "AnalyzerReport should not expose technical Deep Analysis Job title");
  assert(!source.includes(">OK<"), "AnalyzerReport should not expose OK status chip");
  for (const copy of requiredCopy) {
    assert(source.includes(copy), `AnalyzerReport missing required copy: ${copy}`);
  }
  assert(!source.includes("wallet.walletAddress"), "AnalyzerReport must not render full wallet addresses");
  assert(!/0x[a-fA-F0-9]{40}/.test(source), "AnalyzerReport source should not contain full wallet addresses");
  assert(!source.includes("win rate 100%"), "AnalyzerReport should not invent win-rate copy");
  assert(!source.includes("ROI 100%"), "AnalyzerReport should not invent ROI copy");
  assert(!source.includes("copy this trader"), "AnalyzerReport should not recommend copy-trading");
  assert(!source.includes("recomendacion de apuesta"), "AnalyzerReport should not use betting advice copy");

  return { sections: requiredCopy.length, wallet_privacy_source_guard: true };
}

function validateSamanthaResearchRules() {
  const {
    buildSamanthaResearchBrief,
    serializeResearchBrief,
    validateResearchBrief,
  } = loadTsModule("app/lib/samanthaResearchBrief.ts");
  const {
    convertSamanthaReportToEvidence,
    convertSamanthaReportToSignals,
    parseSamanthaResearchReport,
    shouldAcceptSuggestedEstimate,
  } = loadTsModule("app/lib/samanthaResearchReport.ts");
  const {
    invalidSamanthaReportCases,
    strongValidSamanthaReport,
    weakValidSamanthaReport,
  } = loadTsModule("app/lib/__fixtures__/samanthaReports.ts");
  const {
    buildSamanthaTaskPacket,
    getExpectedSamanthaReportSchema,
  } = loadTsModule("app/lib/samanthaTaskPacket.ts");
  const reportTypes = readFileSync(resolve(appRoot, "app/lib/samanthaResearchTypes.ts"), "utf8");
  const reportSource = readFileSync(resolve(appRoot, "app/lib/samanthaResearchReport.ts"), "utf8");
  const taskPacketSource = readFileSync(resolve(appRoot, "app/lib/samanthaTaskPacket.ts"), "utf8");
  const analysisAgentTypesSource = readFileSync(resolve(appRoot, "app/lib/analysisAgentTypes.ts"), "utf8");
  const analysisAgentRegistrySource = readFileSync(resolve(appRoot, "app/lib/analysisAgentRegistry.ts"), "utf8");
  const analysisAgentBridgeSource = readFileSync(resolve(appRoot, "app/lib/analysisAgentBridge.ts"), "utf8");
  const analysisAgentRouteSource = readFileSync(resolve(appRoot, "app/api/analysis-agent/send-research/route.ts"), "utf8");
  const bridgeTypesSource = readFileSync(resolve(appRoot, "app/lib/samanthaBridgeTypes.ts"), "utf8");
  const bridgeSource = readFileSync(resolve(appRoot, "app/lib/samanthaBridge.ts"), "utf8");
  const envExampleSource = readFileSync(resolve(appRoot, ".env.example"), "utf8");
  const bridgeRouteSource = readFileSync(resolve(appRoot, "app/api/samantha/send-research/route.ts"), "utf8");
  const bridgeStatusRouteSource = readFileSync(resolve(appRoot, "app/api/samantha/research-status/route.ts"), "utf8");
  const historySource = readFileSync(resolve(appRoot, "app/history/page.tsx"), "utf8");
  const analyzePageSource = readFileSync(resolve(appRoot, "app/analyze/page.tsx"), "utf8");
  const packageSource = readFileSync(resolve(appRoot, "package.json"), "utf8");

  const brief = buildSamanthaResearchBrief({
    item: {
      latest_snapshot: {
        liquidity: 800,
        volume: 1200,
        yes_price: 0.58,
        no_price: 0.42,
      },
      market: {
        event_slug: "nba-okc-lal-2026-05-11",
        market_slug: "nba-okc-lal-2026-05-11-lal",
        outcomes: [
          { label: "YES", price: 0.58, side: "YES" },
          { label: "NO", price: 0.42, side: "NO" },
        ],
        question: "Will the Lakers win?",
        sport_type: "nba",
      },
    },
    normalizedUrl: "https://polymarket.com/es/sports/nba/nba-okc-lal-2026-05-11",
    walletSummary: {
      analyzedCapitalUsd: 350,
      available: true,
      confidence: "low",
      reason: "Fixture summary only.",
      profileSummaries: [
        {
          confidence: "unknown",
          profileAvailable: false,
          reason: "No hay historial publico suficiente para calificar esta billetera.",
          shortAddress: "0x1234...5678",
          warnings: [],
        },
      ],
      relevantWalletsCount: 1,
      signalDirection: "YES",
      thresholdUsd: 100,
      warnings: ["Fixture wallet warning."],
    },
  });
  const serializedBrief = serializeResearchBrief(brief);
  const briefValidation = validateResearchBrief(brief);
  assert(briefValidation.valid, `Samantha brief should be valid: ${briefValidation.errors.join(", ")}`);
  assert(!serializedBrief.includes("walletAddress"), "Samantha brief must not include raw wallet fields");
  assert(!/0x[a-fA-F0-9]{40}/.test(serializedBrief), "Samantha brief must not include full wallet addresses");
  assert(!serializedBrief.toLowerCase().includes("database_url="), "Samantha brief must not include secrets");
  assert(serializedBrief.includes("Do not invent sources"), "Samantha brief must include anti-invention rule");
  assert(serializedBrief.includes("Do not touch Neon"), "Samantha brief must include no-Neon rule");
  assert(serializedBrief.includes("walletSignalAvailable"), "Samantha brief must include sanitized wallet signal availability");
  assert(serializedBrief.includes("notableWalletCount"), "Samantha brief must include sanitized notable wallet count");
  assert(serializedBrief.includes("profileSummary"), "Samantha brief must include sanitized wallet profile summary");
  const taskPacket = buildSamanthaTaskPacket(brief);
  const taskPacketText = [
    taskPacket.researchBriefJson,
    taskPacket.samanthaInstructionsText,
    taskPacket.expectedReportSchema,
    taskPacket.returnInstructions,
    taskPacket.taskPacketJson,
  ].join("\n");
  assert(taskPacket.samanthaInstructionsText.includes("Return ONLY valid JSON"), "Samantha task packet must instruct JSON-only return");
  assert(taskPacket.samanthaInstructionsText.includes("Do not invent sources"), "Samantha task packet must include anti-invention rules");
  assert(taskPacket.samanthaInstructionsText.includes("Do not touch Neon"), "Samantha task packet must include no-Neon rule");
  assert(taskPacket.samanthaInstructionsText.includes("Reddit and social content are weak signals"), "Samantha task packet must downgrade social evidence");
  assert(taskPacket.expectedReportSchema.includes('"evidence"'), "Samantha task packet must include expected report schema");
  assert(getExpectedSamanthaReportSchema().includes('"suggestedEstimate"'), "Samantha schema helper should include suggestedEstimate");
  assert(!/0x[a-fA-F0-9]{40}/.test(taskPacketText), "Samantha task packet must not include full wallet addresses");
  assert(!taskPacketText.toLowerCase().includes("database_url="), "Samantha task packet must not include secrets");
  assert(!taskPacketSource.includes("fetch("), "Samantha task packet builder must not call external services");
  assert(analysisAgentTypesSource.includes("AnalysisAgentProvider"), "generic analysis agent provider contract is missing");
  assert(analysisAgentTypesSource.includes("AnalysisAgentRequest"), "generic analysis agent request contract is missing");
  assert(analysisAgentTypesSource.includes("AnalysisAgentResponse"), "generic analysis agent response contract is missing");
  assert(analysisAgentRegistrySource.includes("ANALYSIS_AGENT_PROVIDER"), "analysis agent registry must read generic provider env");
  assert(analysisAgentRegistrySource.includes("SAMANTHA_BRIDGE_ENABLED"), "analysis agent registry must keep legacy Samantha env fallback");
  assert(analysisAgentRegistrySource.includes("usesGenericEnv"), "analysis agent registry must prioritize generic env");
  assert(analysisAgentBridgeSource.includes("buildAnalysisAgentMarketPayload"), "analysis agent bridge must send automatic market-analysis payloads");
  assert(analysisAgentBridgeSource.includes("polymarketUrl"), "analysis agent payload must include the Polymarket URL");
  assert(analysisAgentBridgeSource.includes("walletIntelligence"), "analysis agent payload must include sanitized Wallet Intelligence context");
  assert(analysisAgentBridgeSource.includes('"insufficient_data"'), "analysis agent bridge must understand insufficient_data responses");
  assert(analysisAgentBridgeSource.includes("credentials: \"omit\""), "analysis agent bridge fetch must omit credentials");
  assert(analysisAgentBridgeSource.includes("redirect: \"error\""), "analysis agent bridge fetch must reject redirects");
  assert(analysisAgentBridgeSource.includes("analysisAgentEndpointIsSafe"), "analysis agent bridge must validate configured endpoint");
  assert(analysisAgentBridgeSource.includes("Private network analysis agent endpoints are blocked"), "analysis agent bridge must block unsafe private endpoints");
  assert(!analysisAgentBridgeSource.includes("NEXT_PUBLIC"), "analysis agent bridge must not use client-exposed env vars");
  assert(bridgeTypesSource.includes('"disabled" | "manual_fallback" | "automatic"'), "legacy Samantha bridge types must still model disabled/manual/automatic modes");
  assert(bridgeSource.includes("sendAnalysisAgentResearchTask"), "legacy Samantha bridge must delegate to generic analysis agent bridge");
  assert(envExampleSource.includes("https://<samantha-bridge-host>/polysignal/analyze-market"), "env example must document public HTTPS Samantha bridge URL");
  assert(envExampleSource.includes("ANALYSIS_AGENT_PROVIDER=samantha"), "env example must document generic analysis agent provider");
  assert(envExampleSource.includes("ANALYSIS_AGENT_URL=https://<agent-host>/polysignal/analyze-market"), "env example must document generic HTTPS analysis agent URL");
  assert(envExampleSource.includes("SAMANTHA_BRIDGE_ALLOW_LOCALHOST=false"), "env example must keep localhost disabled by default");
  assert(analysisAgentRouteSource.includes("handleAnalysisAgentSendResearch"), "generic send route must use shared handler");
  assert(analysisAgentRouteSource.includes("analysisAgentJsonResponse"), "generic send route must use safe JSON response helper");
  assert(bridgeRouteSource.includes("../../analysis-agent/send-research/route"), "legacy Samantha send route must alias generic route");
  assert(!analysisAgentRouteSource.includes("request.nextUrl"), "analysis agent send route must not derive destination from request URL");
  assert(bridgeStatusRouteSource.includes("../../analysis-agent/research-status/route"), "legacy Samantha status route must alias generic route");
  assert(!bridgeStatusRouteSource.includes("SAMANTHA_BRIDGE_TOKEN"), "Samantha status route must not read or expose bridge token directly");
  assert(historySource.includes("Actualizar lectura automatica"), "history should expose safe Samantha result lookup");
  assert(historySource.includes("updateAnalysisHistoryItem"), "history should update pending research state without raw payloads");
  assert(analyzePageSource.includes("/api/analysis-agent/send-research"), "analyze page must try the safe generic analysis agent route");
  assert(analyzePageSource.includes("markJobSamanthaBridgeFallback"), "analyze page must keep safe partial state when bridge is unavailable");
  assert(analyzePageSource.includes("markJobSendingToSamantha"), "analyze page must mark sending_to_samantha state");
  assert(analyzePageSource.includes("setSamanthaAutoReportResult"), "analyze page must pass validated automatic reports to the report UI");

  const validReport = parseSamanthaResearchReport({
    completedAt: "2026-05-12T12:00:00.000Z",
    evidence: [
      {
        checkedAt: "2026-05-12T12:00:00.000Z",
        direction: "YES",
        id: "official-1",
        reliability: "high",
        sourceName: "Official source",
        sourceType: "official",
        sourceUrl: "https://example.com/official",
        summary: "Official context supports YES in this fixture.",
        title: "Official context",
      },
      {
        checkedAt: "2026-05-12T12:05:00.000Z",
        direction: "YES",
        id: "news-1",
        reliability: "medium",
        sourceName: "News source",
        sourceType: "news",
        sourceUrl: "https://example.com/news",
        summary: "Reported context supports YES in this fixture.",
        title: "News context",
      },
    ],
    marketUrl: "https://polymarket.com/event/test",
    status: "completed",
    suggestedEstimate: {
      available: true,
      confidence: "medium",
      decision: "YES",
      noProbability: 39,
      reason: "Two independent fixture sources support YES.",
      yesProbability: 61,
    },
    version: "1.0",
    warnings: [],
  });
  assert(validReport.valid, `valid Samantha report rejected: ${validReport.errors.join(", ")}`);
  assert(validReport.report, "valid Samantha report should return sanitized report");
  assert(convertSamanthaReportToEvidence(validReport.report).length === 2, "Samantha report should convert to evidence");
  assert(convertSamanthaReportToSignals(validReport.report).length >= 2, "Samantha report should convert to signals");
  assert(shouldAcceptSuggestedEstimate(validReport.report), "Samantha suggested estimate should pass strict fixture gate");

  const belowThresholdReport = parseSamanthaResearchReport({
    ...validReport.report,
    suggestedEstimate: {
      available: true,
      confidence: "medium",
      decision: "YES",
      noProbability: 47,
      reason: "Directional fixture below decision threshold.",
      yesProbability: 53,
    },
  });
  assert(belowThresholdReport.valid, "below-threshold report should still be structurally valid");
  assert(
    !shouldAcceptSuggestedEstimate(belowThresholdReport.report),
    "Samantha estimate below 55% should not become a PolySignal decision",
  );

  const dangerousUrl = parseSamanthaResearchReport({
    completedAt: "2026-05-12T12:00:00.000Z",
    evidence: [
      {
        checkedAt: "2026-05-12T12:00:00.000Z",
        direction: "YES",
        id: "bad-url",
        reliability: "medium",
        sourceName: "Bad",
        sourceType: "news",
        sourceUrl: "file:///etc/passwd",
        summary: "Bad source URL.",
        title: "Bad URL",
      },
    ],
    marketUrl: "https://polymarket.com/event/test",
    status: "completed",
    version: "1.0",
    warnings: [],
  });
  assert(!dangerousUrl.valid, "Samantha validator must reject dangerous URLs");

  const invalidJson = parseSamanthaResearchReport("{not-json");
  assert(!invalidJson.valid, "Samantha validator must reject invalid JSON");
  assert(invalidJson.errors.some((error) => error.includes("JSON invalido")), "Samantha validator should explain invalid JSON");

  const badEstimate = parseSamanthaResearchReport({
    completedAt: "2026-05-12T12:00:00.000Z",
    evidence: [],
    marketUrl: "https://polymarket.com/event/test",
    status: "failed",
    suggestedEstimate: {
      available: true,
      confidence: "medium",
      decision: "YES",
      noProbability: -1,
      reason: "Bad estimate.",
      yesProbability: 101,
    },
    version: "1.0",
    warnings: [],
  });
  assert(!badEstimate.valid, "Samantha validator must reject estimates outside 0-100");

  const redditHigh = parseSamanthaResearchReport({
    completedAt: "2026-05-12T12:00:00.000Z",
    evidence: [
      {
        checkedAt: "2026-05-12T12:00:00.000Z",
        direction: "YES",
        id: "reddit-high",
        reliability: "high",
        sourceName: "Reddit",
        sourceType: "reddit",
        summary: "Reddit should not be high reliability.",
        title: "Reddit thread",
      },
    ],
    marketUrl: "https://polymarket.com/event/test",
    status: "completed",
    version: "1.0",
    warnings: [],
  });
  assert(!redditHigh.valid, "Samantha validator must reject Reddit high reliability");

  const kalshiNotEquivalent = parseSamanthaResearchReport({
    completedAt: "2026-05-12T12:00:00.000Z",
    evidence: [],
    kalshiComparison: {
      direction: "YES",
      equivalent: false,
      found: true,
      reliability: "high",
      summary: "Not equivalent.",
    },
    marketUrl: "https://polymarket.com/event/test",
    status: "failed",
    version: "1.0",
    warnings: [],
  });
  assert(!kalshiNotEquivalent.valid, "Samantha validator must reject non-equivalent Kalshi as strong signal");

  const fullWallet = `0x${"a".repeat(40)}`;
  const fullWalletReport = parseSamanthaResearchReport({
    completedAt: "2026-05-12T12:00:00.000Z",
    evidence: [
      {
        checkedAt: "2026-05-12T12:00:00.000Z",
        direction: "UNKNOWN",
        id: "wallet",
        reliability: "low",
        sourceName: fullWallet,
        sourceType: "other",
        summary: "Full wallet should be rejected.",
        title: "Wallet identity",
      },
    ],
    marketUrl: "https://polymarket.com/event/test",
    status: "completed",
    version: "1.0",
    warnings: [],
  });
  assert(!fullWalletReport.valid, "Samantha validator must reject full wallet addresses");

  const secretReportText = JSON.stringify({
    completedAt: "2026-05-12T12:00:00.000Z",
    evidence: [],
    marketUrl: "https://polymarket.com/event/test",
    status: "failed",
    version: "1.0",
    warnings: ["token=abc123"],
  });
  const secretReport = parseSamanthaResearchReport(secretReportText);
  assert(!secretReport.valid, "Samantha validator must reject possible secrets in raw report text");

  const longSummary = "Long ".repeat(400);
  const longReport = parseSamanthaResearchReport({
    completedAt: "2026-05-12T12:00:00.000Z",
    evidence: [
      {
        checkedAt: "2026-05-12T12:00:00.000Z",
        direction: "NEUTRAL",
        id: "long",
        reliability: "low",
        sourceName: "Long source",
        sourceType: "other",
        summary: longSummary,
        title: "Long text",
      },
    ],
    marketUrl: "https://polymarket.com/event/test",
    status: "completed",
    version: "1.0",
    warnings: [],
  });
  assert(longReport.valid, "long but safe Samantha report should remain valid after sanitization");
  assert(longReport.report.evidence[0].summary.length <= 900, "Samantha validator should limit long summaries");
  const tooLongReport = parseSamanthaResearchReport("x".repeat(70000));
  assert(!tooLongReport.valid, "Samantha validator must reject excessively long report text");

  assert(reportTypes.includes("SamanthaResearchBrief"), "Samantha research types should include brief contract");
  assert(reportTypes.includes("SamanthaResearchReport"), "Samantha research types should include report contract");
  assert(reportSource.includes("isSafeSourceUrl"), "Samantha report validator should validate source URLs");
  assert(reportSource.includes("MAX_REPORT_INPUT_LENGTH"), "Samantha report validator should limit raw report length");
  assert(reportSource.includes("UNSAFE_RESEARCH_PATTERNS"), "Samantha report validator should reject unsafe research claims");
  assert(packageSource.includes("test:estimate-gates"), "web package should expose estimate gate tests");
  assert(packageSource.includes("test:samantha-report-validation"), "web package should expose Samantha report validation tests");

  const strongFixture = parseSamanthaResearchReport(JSON.stringify(strongValidSamanthaReport));
  assert(strongFixture.valid, `strong Samantha fixture should be valid: ${strongFixture.errors.join(", ")}`);
  assert(
    shouldAcceptSuggestedEstimate(strongFixture.report),
    "strong Samantha fixture should pass suggested estimate acceptance",
  );
  const weakFixture = parseSamanthaResearchReport(JSON.stringify(weakValidSamanthaReport));
  assert(weakFixture.valid, `weak Samantha fixture should be structurally valid: ${weakFixture.errors.join(", ")}`);
  assert(!shouldAcceptSuggestedEstimate(weakFixture.report), "weak Samantha fixture should not create final estimate");
  for (const [label, fixture] of Object.entries({
    roiClaim: invalidSamanthaReportCases.roiClaim,
    scriptInjection: invalidSamanthaReportCases.scriptInjection,
    tradingInstruction: invalidSamanthaReportCases.tradingInstruction,
    winRateClaim: invalidSamanthaReportCases.winRateClaim,
  })) {
    const parsed = parseSamanthaResearchReport(JSON.stringify(fixture));
    assert(!parsed.valid, `Samantha validator must reject ${label}`);
  }

  return {
    brief_safe: true,
    parser_cases: 16,
    task_packet_safe: true,
    valid_signals: convertSamanthaReportToSignals(validReport.report).length,
  };
}

function validateDeepAnalyzerReadinessRules() {
  const {
    buildDeepAnalysisFromPolymarketMarket,
    canGenerateDecision,
    createInitialDeepAnalysis,
    mergeSamanthaResearchLayer,
    mergeWalletIntelligenceLayer,
    summarizeDeepAnalysis,
  } = loadTsModule("app/lib/deepAnalyzerEngine.ts");
  const {
    getDeepAnalysisProgressPlan,
    getRunnableDeepAnalysisSteps,
  } = loadTsModule("app/lib/deepAnalysisProgress.ts");
  const typesSource = readFileSync(resolve(appRoot, "app/lib/deepAnalyzerTypes.ts"), "utf8");

  const initial = createInitialDeepAnalysis("https://polymarket.com/event/test");
  assert(!initial.decision.available, "initial deep analysis must not create a decision");
  assert(initial.decision.side === "NONE", "initial deep analysis must not create a predicted side");

  const marketOnly = buildDeepAnalysisFromPolymarketMarket({
    item: {
      latest_snapshot: {
        liquidity: 450,
        volume: 1200,
      },
      market: {
        active: true,
        closed: false,
        event_slug: "nba-okc-lal-2026-05-11",
        market_slug: "nba-okc-lal-2026-05-11-lal",
        outcomes: [
          { label: "YES", price: 0.61, side: "YES" },
          { label: "NO", price: 0.39, side: "NO" },
        ],
        question: "Will the Lakers win?",
        source: "gamma",
      },
    },
    normalizedUrl: "https://polymarket.com/es/sports/nba/nba-okc-lal-2026-05-11",
  });

  assert(marketOnly.market?.source === "gamma", "deep analyzer should preserve live Polymarket/Gamma source");
  assert(!marketOnly.decision.available, "market-only deep analysis must not create a PolySignal estimate");
  assert(marketOnly.decision.side === "NONE", "market-only deep analysis must not create predictedSide");
  assert(marketOnly.decision.yesProbability === undefined, "market price must not become a PolySignal yesProbability");
  assert(marketOnly.decision.noProbability === undefined, "market price must not become a PolySignal noProbability");
  assert(
    marketOnly.layers.some((layer) => layer.id === "polymarket_market" && layer.status === "available"),
    "deep analyzer should mark Polymarket market data available when structured data exists",
  );

  const withWallet = mergeWalletIntelligenceLayer(marketOnly, {
    analyzedCapitalUsd: 500,
    available: true,
    confidence: "low",
    noCapitalUsd: 0,
    reason: "Test fixture with real-shape wallet summary only.",
    relevantWalletsCount: 1,
    signalDirection: "YES",
    source: "backend",
    thresholdUsd: 100,
    warnings: ["Senal auxiliar; no decision final."],
    yesCapitalUsd: 500,
  });
  const walletLayer = withWallet.layers.find((layer) => layer.id === "wallet_intelligence");
  assert(walletLayer?.status === "available", "real wallet summary should become an available auxiliary layer");
  assert(walletLayer?.signals.length === 1, "wallet summary should create one auxiliary signal");
  assert(!withWallet.decision.available, "wallet data alone must not create a PolySignal estimate");
  assert(!canGenerateDecision(withWallet), "deep analyzer v0 must not generate a decision from wallet data alone");
  assert(
    summarizeDeepAnalysis(withWallet).includes("Sin decision PolySignal suficiente"),
    "deep analyzer summary should remain conservative",
  );

  const withSamantha = mergeSamanthaResearchLayer(withWallet, {
    completedAt: "2026-05-12T12:00:00.000Z",
    evidence: [
      {
        checkedAt: "2026-05-12T12:00:00.000Z",
        direction: "YES",
        id: "official-1",
        reliability: "high",
        sourceName: "Official source",
        sourceType: "official",
        summary: "Official fixture evidence supports YES.",
        title: "Official fixture",
      },
      {
        checkedAt: "2026-05-12T12:05:00.000Z",
        direction: "YES",
        id: "news-1",
        reliability: "medium",
        sourceName: "News source",
        sourceType: "news",
        summary: "News fixture evidence supports YES.",
        title: "News fixture",
      },
    ],
    marketUrl: "https://polymarket.com/event/test",
    status: "completed",
    suggestedEstimate: {
      available: true,
      confidence: "medium",
      decision: "YES",
      noProbability: 39,
      reason: "Validated imported research fixture.",
      yesProbability: 61,
    },
    version: "1.0",
    warnings: [],
  });
  assert(
    withSamantha.layers.some((layer) => layer.id === "external_research" && layer.status === "available"),
    "validated Samantha report should populate external research layer",
  );
  assert(withSamantha.decision.available, "validated Samantha report should be able to pass v0 decision gate");
  assert(withSamantha.decision.side === "YES", "accepted Samantha estimate should preserve suggested side");
  assert(withSamantha.decision.yesProbability === 61, "accepted Samantha estimate should preserve suggested probability");

  const progressPlan = getDeepAnalysisProgressPlan();
  assert(
    progressPlan.some(
      (step) =>
        step.state === "researching_external_sources" &&
        !step.canRunNow &&
        step.requiresBackendJob &&
        step.requiresExternalSource,
    ),
    "external research progress must remain blocked until integration is authorized",
  );
  assert(
    progressPlan.some((step) => step.state === "comparing_kalshi" && !step.canRunNow && step.requiresExternalSource),
    "Kalshi comparison progress must remain blocked until integration is authorized",
  );
  assert(
    getRunnableDeepAnalysisSteps().every((step) => step.canRunNow),
    "runnable deep-analysis progress helper should return only runnable states",
  );
  for (const layerId of [
    '"polymarket_market"',
    '"wallet_profiles"',
    '"external_research"',
    '"odds_comparison"',
    '"kalshi_comparison"',
    '"decision"',
    '"resolution"',
  ]) {
    assert(typesSource.includes(layerId), `deep analyzer types missing ${layerId}`);
  }

  return {
    conservative_decision_guard: true,
    layers: initial.layers.length,
    progress_states: progressPlan.length,
  };
}

function validateDeepAnalysisJobRules() {
  const {
    createDeepAnalysisJob,
    getCurrentJobStep,
    getJobProgressSummary,
    markJobAwaitingSamantha,
    markJobMarketAnalyzed,
    markJobPolymarketRead,
    markJobReceivingSamanthaReport,
    markJobSamanthaBriefReady,
    markJobSamanthaBridgeFallback,
    markJobSamanthaReportLoaded,
    markJobSamanthaResearching,
    markJobSendingToSamantha,
    markJobValidatingSamanthaReport,
    markJobWalletsAnalyzed,
  } = loadTsModule("app/lib/deepAnalysisJob.ts");
  const storageSource = readFileSync(resolve(appRoot, "app/lib/deepAnalysisJobStorage.ts"), "utf8");
  const analyzePage = readFileSync(resolve(appRoot, "app/analyze/page.tsx"), "utf8");
  const reportSource = readFileSync(resolve(appRoot, "app/components/AnalyzerReport.tsx"), "utf8");
  const historySource = readFileSync(resolve(appRoot, "app/history/page.tsx"), "utf8");

  let job = createDeepAnalysisJob("https://polymarket.com/event/test");
  assert(job.status === "running", "new deep analysis job should start running");
  assert(
    getCurrentJobStep(job)?.id === "reading_polymarket",
    "new deep analysis job should start by reading Polymarket",
  );
  assert(!getJobProgressSummary(job).headline.includes("completado"), "running job must not claim completion");

  job = markJobPolymarketRead(job, {
    eventSlug: "test-event",
    marketId: "123",
    marketSlug: "test-market",
    marketTitle: "Will test pass?",
    normalizedUrl: "https://polymarket.com/event/test",
  });
  job = markJobMarketAnalyzed(job);
  job = markJobWalletsAnalyzed(job, { available: false, summary: "No wallet source for this fixture." });
  job = markJobSamanthaBriefReady(job);
  job = markJobAwaitingSamantha(job);

  assert(job.status === "awaiting_samantha", "job should wait for Samantha after brief preparation");
  assert(job.briefReady === true, "job should mark Samantha brief ready");
  assert(
    job.steps.find((step) => step.id === "awaiting_samantha_report")?.status === "running",
    "awaiting_samantha_report should be the automatic Samantha running step",
  );
  assert(
    job.steps.find((step) => step.id === "completed")?.status !== "completed",
    "awaiting Samantha job must not be marked completed",
  );
  assert(
    getJobProgressSummary(job).nextAction.includes("lectura parcial"),
    "awaiting job summary should offer a partial automatic reading",
  );

  const sendingJob = markJobSendingToSamantha(job);
  assert(sendingJob.status === "sending_to_samantha", "bridge send attempt should set sending_to_samantha");
  assert(
    sendingJob.steps.find((step) => step.id === "awaiting_samantha_report")?.status === "running",
    "sending job should keep awaiting_samantha_report running",
  );
  const researchingJob = markJobSamanthaResearching(sendingJob, { reason: "Queued safely.", taskId: "task-1" });
  assert(researchingJob.status === "samantha_researching", "accepted bridge task should mark Samantha researching");
  const receivingJob = markJobReceivingSamanthaReport(researchingJob);
  assert(receivingJob.status === "receiving_samantha_report", "candidate report should mark receiving state");
  const validatingJob = markJobValidatingSamanthaReport(receivingJob);
  assert(validatingJob.status === "validating_samantha_report", "candidate report should mark validating state");
  const fallbackJob = markJobSamanthaBridgeFallback(sendingJob, {
    automaticAvailable: false,
    reason: "Bridge disabled for fixture.",
  });
  assert(fallbackJob.status === "awaiting_samantha", "bridge fallback must keep job awaiting Samantha");
  assert(fallbackJob.resultReady !== true, "bridge fallback must not complete the analysis");

  const withEvidenceNoDecision = markJobSamanthaReportLoaded(job, {
    acceptedEstimate: false,
    signalCount: 2,
  });
  assert(
    withEvidenceNoDecision.status === "ready_to_score",
    "validated evidence without accepted estimate should be ready_to_score",
  );
  assert(
    withEvidenceNoDecision.resultReady !== true,
    "validated evidence without accepted estimate should not create final result",
  );

  const withAcceptedDecision = markJobSamanthaReportLoaded(job, {
    acceptedEstimate: true,
    signalCount: 3,
  });
  assert(withAcceptedDecision.status === "completed", "accepted report should complete the local job");
  assert(withAcceptedDecision.resultReady === true, "accepted report should mark result ready");

  assert(storageSource.includes("localStorage"), "deep analysis job storage should use localStorage");
  assert(storageSource.includes("FULL_WALLET_PATTERN"), "deep analysis job storage should redact full wallets");
  assert(storageSource.includes("bridgeTaskId"), "deep analysis job storage should preserve Samantha bridge task ids");
  assert(storageSource.includes("bridgeStatus"), "deep analysis job storage should preserve Samantha bridge statuses");
  assert(storageSource.includes("sentToSamanthaAt"), "deep analysis job storage should preserve Samantha send timestamp");
  assert(!storageSource.includes("fetch("), "deep analysis job storage must not call external services");
  assert(!storageSource.includes("raw payload"), "deep analysis job storage should not store raw payloads");
  assert(analyzePage.includes("createDeepAnalysisJob"), "analyze page should create local deep analysis jobs");
  assert(analyzePage.includes("getLatestDeepAnalysisJobForUrl(normalizedUrl)"), "analyze page should reuse pending jobs by URL");
  assert(analyzePage.includes("existingBridgeTaskId"), "analyze page should not duplicate Samantha sends when continuing a job");
  assert(analyzePage.includes("markJobSamanthaBridgeFallback"), "analyze page should keep jobs awaiting Samantha when bridge is unavailable");
  assert(analyzePage.includes("markJobSendingToSamantha"), "analyze page should expose automatic bridge states");
  assert(analyzePage.includes("deepAnalysisJob"), "analyze page should keep job state");
  assert(reportSource.includes("Progreso del analisis"), "AnalyzerReport should show human progress copy");
  assert(reportSource.includes("Estado del analisis profundo"), "AnalyzerReport should expose an accessible job-state label");
  assert(reportSource.includes("{analysisAgentName} automatico"), "AnalyzerReport should show dynamic automatic agent state");
  assert(reportSource.includes("Fuente automatica no disponible"), "AnalyzerReport should show unavailable automatic source state");
  assert(reportSource.includes("NEXT_PUBLIC_SHOW_ANALYZER_DEBUG_TOOLS"), "AnalyzerReport should gate manual tools behind debug flag");
  assert(reportSource.includes("markJobSamanthaReportLoaded"), "AnalyzerReport should merge Samantha report into the job");
  assert(historySource.includes("Continuar analisis"), "history should let users continue pending deep research");
  assert(historySource.includes("/api/samantha/research-status") || historySource.includes("/api/analysis-agent/research-status"), "history should query agent status through same-origin route");
  assert(historySource.includes("manual_needed"), "history should show manual_needed as a continuation state");
  assert(!historySource.includes("Cargar reporte manual"), "history should not expose manual report upload as a public action");
  assert(!historySource.includes("Necesita reporte manual"), "history should not label pending Samantha as manual report needed");
  assert(historySource.includes("bridgeTaskId"), "history should preserve Samantha task ids without raw payloads");
  assert(!/0x[a-fA-F0-9]{40}/.test(historySource), "history source should not include full wallet literals");

  return {
    awaiting_samantha_guard: true,
    job_steps: job.steps.length,
    ready_to_score_guard: true,
  };
}

function validateAnalyzerResultRules() {
  const {
    buildAnalyzerResult,
    getAnalyzerDecisionCopy,
    getAnalyzerSummary,
    getRelatedAnalyzerHistory,
  } = loadTsModule("app/lib/analyzerResult.ts");

  const normalizedUrl = "https://polymarket.com/event/test-market";
  const marketPriceOnly = {
    latest_snapshot: {
      no_price: 0.4,
      yes_price: 0.6,
    },
    market: {
      active: true,
      event_slug: "test-market",
      event_title: "Test Team vs Other Team",
      id: 123,
      market_slug: "test-market",
      question: "Will Test Team win?",
      sport_type: "soccer",
    },
  };
  const priceOnlyResult = buildAnalyzerResult({
    item: marketPriceOnly,
    matchScore: 72,
    normalizedUrl,
    relatedHistory: [],
    url: normalizedUrl,
  });

  assert(priceOnlyResult.decision === "NONE", "market price only must not become an analyzer decision");
  assert(!priceOnlyResult.canCountForAccuracy, "market price only must not count for accuracy");
  assert(!priceOnlyResult.polySignalEstimateAvailable, "market price only must not become a PolySignal estimate");
  assert(
    priceOnlyResult.layers.some((layer) => layer.id === "wallet_intelligence"),
    "analyzer result should include wallet intelligence layer",
  );
  assert(
    priceOnlyResult.layers.some((layer) => layer.id === "history"),
    "analyzer result should include related history layer",
  );
  assert(
    priceOnlyResult.layers.some((layer) => layer.id === "resolution"),
    "analyzer result should include resolution layer",
  );
  assert(
    getAnalyzerDecisionCopy(priceOnlyResult).label.includes("Sin estimacion"),
    "price only analyzer copy must stay honest",
  );

  const realEstimate = {
    ...marketPriceOnly,
    estimateQuality: "real_polysignal_estimate",
    latest_prediction: {
      no_probability: 0.38,
      yes_probability: 0.62,
    },
  };
  const realResult = buildAnalyzerResult({
    item: realEstimate,
    matchScore: 80,
    normalizedUrl,
    relatedHistory: [
      {
        analyzedAt: "2026-05-11T00:00:00.000Z",
        decision: "clear",
        id: "history-1",
        marketId: "123",
        predictedSide: "YES",
        result: "pending",
        source: "link_analyzer",
        status: "open",
        title: "Will Test Team win?",
        url: normalizedUrl,
      },
    ],
    url: normalizedUrl,
  });
  assert(realResult.decision === "YES", "real PolySignal estimate should allow clear YES decision");
  assert(realResult.canCountForAccuracy, "real clear estimate should be countable after resolution");
  assert(getAnalyzerSummary(realResult).found.length > 0, "analyzer summary should describe found layers");

  const walletOnly = {
    ...marketPriceOnly,
    walletIntelligence: {
      summary: {
        analyzedCapitalUsd: 250,
        available: true,
        confidence: "low",
        reason: "Test wallet data",
        relevantWalletsCount: 1,
        signalDirection: "YES",
        source: "backend",
        thresholdUsd: 100,
        warnings: ["Actividad publica observada"],
        yesCapitalUsd: 250,
      },
    },
  };
  const walletOnlyResult = buildAnalyzerResult({
    item: walletOnly,
    matchScore: 78,
    normalizedUrl,
    relatedHistory: [],
    url: normalizedUrl,
  });
  assert(walletOnlyResult.decision === "NONE", "wallet data alone must not create a prediction");
  assert(!walletOnlyResult.canCountForAccuracy, "wallet data alone must not count for accuracy");

  const related = getRelatedAnalyzerHistory({
    historyItems: [
      {
        analyzedAt: "2026-05-11T00:00:00.000Z",
        id: "history-2",
        marketId: "123",
        source: "link_analyzer",
        status: "open",
        title: "Will Test Team win?",
        url: normalizedUrl,
      },
    ],
    marketId: 123,
    normalizedUrl,
  });
  assert(related.length === 1, "expected analyzer related history lookup to match market id");

  return { cases: 14, layers: priceOnlyResult.layers.length };
}

function validateAnalyzerMatchRankingRules() {
  const { rankAnalyzerMatches } = loadTsModule("app/lib/analyzerMatchRanking.ts");
  const link = "https://polymarket.com/es/sports/laliga/lal-cel-lev-2026-05-12";
  const items = [
    {
      market: {
        active: true,
        event_slug: "lal-cel-lev-2026-05-12",
        event_title: "Celta de Vigo vs Levante UD",
        id: 1,
        market_slug: "lal-cel-lev-2026-05-12-celta-win",
        question: "Celta de Vigo to win",
        sport_type: "soccer",
      },
    },
    {
      market: {
        active: true,
        event_slug: "lal-sev-esp-2026-05-12",
        event_title: "Sevilla vs Espanyol",
        id: 2,
        market_slug: "lal-sev-esp-2026-05-12-sevilla-win",
        question: "Sevilla to win",
        sport_type: "soccer",
      },
    },
    {
      market: {
        active: true,
        event_slug: "lal-atm-cel-2026-05-12",
        event_title: "Atletico Madrid vs Celta de Vigo",
        id: 3,
        market_slug: "lal-atm-cel-2026-05-12-atletico-win",
        question: "Atletico Madrid to win",
        sport_type: "soccer",
      },
    },
    {
      market: {
        active: true,
        event_slug: "lal-cel-lev-2026-05-12",
        event_title: "Celta de Vigo vs Levante UD",
        id: 4,
        market_slug: "lal-cel-lev-2026-05-12-draw",
        question: "Draw",
        sport_type: "soccer",
      },
    },
  ];
  const ranking = rankAnalyzerMatches(items, link);
  assert(ranking.linkInfo?.eventSlug === "lal-cel-lev-2026-05-12", "expected ranking to use complete event slug");
  assert(ranking.candidates.length === 2, `expected same-event options only, got ${ranking.candidates.length}`);
  assert(
    ranking.candidates.every((candidate) => candidate.eventSlug === "lal-cel-lev-2026-05-12"),
    "expected candidates to stay within the exact event",
  );
  assert(
    ranking.candidates.every((candidate) => candidate.strength === "exact" || candidate.strength === "strong"),
    "expected exact event candidates to be exact or strong",
  );
  assert(
    !ranking.candidates.some((candidate) => candidate.title.includes("Sevilla") || candidate.title.includes("Atletico")),
    "expected league/date or one-team matches to be hidden",
  );

  const exactMarketLink = "https://polymarket.com/market/lal-cel-lev-2026-05-12-celta-win";
  const exactMarket = rankAnalyzerMatches(items, exactMarketLink);
  assert(exactMarket.candidates.length === 1, `expected exact market link to show one candidate, got ${exactMarket.candidates.length}`);
  assert(
    exactMarket.candidates[0]?.marketSlug === "lal-cel-lev-2026-05-12-celta-win",
    "expected exact market link to keep only the matching market",
  );

  const possible = rankAnalyzerMatches(
    [
      {
        market: {
          active: true,
          event_slug: "celta-vigo-levante",
          event_title: "Celta Vigo vs Levante",
          id: 5,
          market_slug: "celta-vigo-levante-winner",
          question: "Celta Vigo wins",
          sport_type: "soccer",
        },
      },
    ],
    link,
  );
  assert(possible.candidates[0]?.strength === "possible", "expected team-only match to stay possible, not exact");

  const oneTeamNoise = rankAnalyzerMatches(
    [
      {
        market: {
          active: true,
          event_slug: "lal-atm-cel-2026-05-12",
          event_title: "Atletico Madrid vs Celta de Vigo",
          id: 6,
          market_slug: "lal-atm-cel-2026-05-12-atletico-win",
          question: "Atletico Madrid to win",
          sport_type: "soccer",
        },
      },
      {
        market: {
          active: true,
          event_slug: "lal-sev-esp-2026-05-12",
          event_title: "Sevilla vs Espanyol",
          id: 7,
          market_slug: "lal-sev-esp-2026-05-12-sevilla-win",
          question: "Sevilla to win",
          sport_type: "soccer",
        },
      },
    ],
    link,
  );
  assert(oneTeamNoise.candidates.length === 0, "expected league/date/one-team noise not to become visible candidates");

  return { cases: 8 };
}

async function validatePolymarketLinkResolverRules() {
  const {
    resolvePolymarketLink,
    resolvedMarketToOverviewItem,
  } = loadTsModule("app/lib/polymarketLinkResolver.ts");

  const rejected = await resolvePolymarketLink(
    { url: "https://polymarket.com.evil.com/event/test" },
    async () => {
      throw new Error("fetch should not be called for invalid input");
    },
  );
  assert(rejected.status === "unsupported", "expected resolver to reject non-Polymarket host");

  const calls = [];
  const resolverFetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    assert(String(url).startsWith("https://gamma-api.polymarket.com/events?slug="), `unexpected resolver URL ${url}`);
    assert(init.credentials === "omit", "expected resolver fetch to omit credentials");
    assert(init.redirect === "error", "expected resolver fetch to reject redirects");
    return new Response(
      JSON.stringify([
        {
          slug: "nba-okc-lal-2026-05-11",
          startTime: "2026-05-12T02:30:00Z",
          tags: [{ label: "Sports", slug: "sports" }, { label: "NBA", slug: "nba" }],
          title: "Thunder vs. Lakers",
          markets: [
            {
              active: true,
              closed: false,
              conditionId: "0xabc",
              clobTokenIds: "[\"token-thunder\", \"token-lakers\"]",
              id: "2161658",
              liquidity: "1422845.15",
              outcomePrices: "[\"0.825\", \"0.175\"]",
              outcomes: "[\"Thunder\", \"Lakers\"]",
              question: "Thunder vs. Lakers",
              slug: "nba-okc-lal-2026-05-11",
              volume: "1457369.46",
            },
            {
              active: true,
              closed: false,
              id: "2220924",
              outcomePrices: "[\"0.495\", \"0.505\"]",
              outcomes: "[\"Over\", \"Under\"]",
              question: "Thunder vs. Lakers: O/U 214.5",
              slug: "nba-okc-lal-2026-05-11-total-214pt5",
            },
          ],
        },
      ]),
      { headers: { "Content-Type": "application/json" }, status: 200 },
    );
  };

  const resolved = await resolvePolymarketLink(
    { url: "https://polymarket.com/es/sports/nba/nba-okc-lal-2026-05-11" },
    resolverFetch,
  );
  assert(resolved.status === "ok", `expected NBA link to resolve, got ${resolved.status}`);
  assert(resolved.source === "gamma", `expected gamma source, got ${resolved.source}`);
  assert(resolved.eventSlug === "nba-okc-lal-2026-05-11", "expected event slug to stay NBA");
  assert(resolved.sport === "nba", `expected NBA sport tag, got ${resolved.sport}`);
  assert(resolved.markets.length === 2, `expected two event markets, got ${resolved.markets.length}`);
  assert(!JSON.stringify(resolved).includes("Sevilla"), "resolver must not include unrelated internal soccer markets");
  assert(!JSON.stringify(resolved).includes("rawPayloadShouldNotLeak"), "resolver leaked raw payload fields");
  const overview = resolvedMarketToOverviewItem(resolved, resolved.markets[0]);
  assert(overview.market.remote_id === "2161658", "expected resolved market id to become remote_id");
  assert(overview.market.condition_id === "0xabc", "expected conditionId to be preserved for future read-only lookups");
  assert(overview.market.outcomes.length === 2, "expected outcome prices to be preserved");
  assert(calls.length === 1, `expected one Gamma call, got ${calls.length}`);

  const marketCalls = [];
  const exactMarket = await resolvePolymarketLink(
    { url: "https://polymarket.com/market/lal-cel-lev-2026-05-12-cel" },
    async (url, init) => {
      marketCalls.push({ init, url: String(url) });
      assert(String(url).startsWith("https://gamma-api.polymarket.com/"), `unexpected exact market resolver URL ${url}`);
      assert(init.credentials === "omit", "expected exact market resolver fetch to omit credentials");
      assert(init.redirect === "error", "expected exact market resolver fetch to reject redirects");
      if (String(url).startsWith("https://gamma-api.polymarket.com/markets?slug=")) {
        return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" }, status: 200 });
      }
      return new Response(
        JSON.stringify([
          {
            slug: "lal-cel-lev-2026-05-12",
            startTime: "2026-05-12T17:00:00Z",
            tags: [{ label: "Sports", slug: "sports" }, { label: "La Liga", slug: "soccer" }],
            title: "RC Celta de Vigo vs. Levante UD",
            markets: [
              {
                active: true,
                closed: true,
                id: "2113258",
                outcomePrices: "[\"0\", \"1\"]",
                outcomes: "[\"Yes\", \"No\"]",
                question: "Will RC Celta de Vigo win on 2026-05-12?",
                slug: "lal-cel-lev-2026-05-12-cel",
              },
              {
                active: true,
                closed: true,
                id: "2113259",
                outcomePrices: "[\"0\", \"1\"]",
                outcomes: "[\"Yes\", \"No\"]",
                question: "Will RC Celta de Vigo vs. Levante UD end in a draw?",
                slug: "lal-cel-lev-2026-05-12-draw",
              },
            ],
          },
        ]),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    },
  );
  assert(exactMarket.status === "ok", `expected exact market fallback to resolve, got ${exactMarket.status}`);
  assert(exactMarket.marketSlug === "lal-cel-lev-2026-05-12-cel", "expected exact market slug to be preserved");
  assert(exactMarket.markets.length === 1, `expected exact market fallback to return one market, got ${exactMarket.markets.length}`);
  assert(exactMarket.markets[0]?.slug === "lal-cel-lev-2026-05-12-cel", "expected exact market fallback to keep only the requested market");
  assert(marketCalls.length === 2, `expected market lookup then event fallback, got ${marketCalls.length} calls`);

  const notFound = await resolvePolymarketLink(
    { url: "https://polymarket.com/es/sports/laliga/lal-cel-lev-2099-01-01" },
    async () => new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" }, status: 200 }),
  );
  assert(notFound.status === "not_found", `expected not_found without internal fallback, got ${notFound.status}`);
  assert(notFound.markets.length === 0, "not_found resolver result must not invent markets");

  return { live_source: "gamma", no_cross_sport_fallback: true, resolver_cases: 4 };
}

async function validatePolymarketResolutionAdapter() {
  const {
    buildExternalResolutionRequest,
    lookupExternalPolymarketResolution,
  } = loadTsModule("app/lib/polymarketResolutionAdapter.ts");

  const rejected = [
    { url: "http://localhost:3000/event/test" },
    { url: "http://127.0.0.1/event/test" },
    { url: "http://169.254.169.254/latest/meta-data" },
    { url: "http://192.168.1.1/event/test" },
    { url: "https://polymarket.com.evil.com/event/test" },
    { url: "https://user:pass@polymarket.com/event/test" },
    { url: "https://polymarket.com:444/event/test" },
    { url: `https://polymarket.com/event/${"x".repeat(2100)}` },
  ];
  for (const input of rejected) {
    const request = buildExternalResolutionRequest(input);
    assert(request.url === null, `expected resolution adapter to reject ${JSON.stringify(input)}`);
  }

  const request = buildExternalResolutionRequest({
    eventSlug: "test-event",
    marketSlug: "test-market",
    remoteId: "123",
    url: "https://polymarket.com/event/test-event",
  });
  assert(request.url === "https://gamma-api.polymarket.com/events?slug=test-event", `unexpected gamma URL ${request.url}`);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify([
          {
            slug: "test-event",
            markets: [
              {
                active: false,
                automaticallyResolved: true,
                closed: true,
                closedTime: "2026-05-10T00:00:00Z",
                id: "123",
                outcomePrices: "[\"1\", \"0\"]",
                outcomes: "[\"Yes\", \"No\"]",
                slug: "test-market",
                umaResolutionStatus: "resolved",
                rawPayloadShouldNotLeak: "SECRET",
              },
            ],
          },
        ]),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    const resolved = await lookupExternalPolymarketResolution({
      eventSlug: "test-event",
      marketSlug: "test-market",
      remoteId: "123",
      url: "https://polymarket.com/event/test-event",
    });
    assert(resolved.status === "resolved", `expected resolved status, got ${resolved.status}`);
    assert(resolved.outcome === "YES", `expected YES outcome, got ${resolved.outcome}`);
    assert(resolved.source === "gamma", `expected gamma source, got ${resolved.source}`);
    assert(!JSON.stringify(resolved).includes("rawPayloadShouldNotLeak"), "resolution result leaked raw payload");
    assert(!JSON.stringify(resolved).includes("SECRET"), "resolution result leaked secret-like payload");

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify([{ slug: "test-event", markets: [{ active: false, closed: true, id: "123", slug: "test-market" }] }]),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    const unknown = await lookupExternalPolymarketResolution({
      eventSlug: "test-event",
      marketSlug: "test-market",
      remoteId: "123",
      url: "https://polymarket.com/event/test-event",
    });
    assert(unknown.status === "unknown", `expected unknown status, got ${unknown.status}`);
    assert(unknown.outcome === "UNKNOWN", `expected UNKNOWN outcome, got ${unknown.outcome}`);
  } finally {
    globalThis.fetch = originalFetch;
  }

  return { rejected: rejected.length, safe_resolution_cases: 2 };
}

async function validateResolvePolymarketRoute() {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify([
          {
            slug: "test-event",
            markets: [
              {
                active: false,
                automaticallyResolved: true,
                closed: true,
                id: "123",
                outcomePrices: "[\"0\", \"1\"]",
                outcomes: "[\"Yes\", \"No\"]",
                slug: "test-market",
                umaResolutionStatus: "resolved",
              },
            ],
          },
        ]),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    const route = loadTsModule("app/api/resolve-polymarket/route.ts");
    const invalid = await route.POST(
      new Request("https://example.test/api/resolve-polymarket", {
        body: JSON.stringify({ url: "https://polymarket.com.evil.com/event/test" }),
        method: "POST",
      }),
    );
    assert(invalid.status === 400, `expected invalid resolution route request to fail, got ${invalid.status}`);

    const resolved = await route.POST(
      new Request("https://example.test/api/resolve-polymarket", {
        body: JSON.stringify({
          eventSlug: "test-event",
          marketSlug: "test-market",
          remoteId: "123",
          url: "https://polymarket.com/event/test-event",
        }),
        method: "POST",
      }),
    );
    assert(resolved.status === 200, `expected resolution route to return 200, got ${resolved.status}`);
    const body = await resolved.json();
    assert(body.outcome === "NO", `expected sanitized route outcome NO, got ${body.outcome}`);
    assert(body.source === "gamma", `expected sanitized route source gamma, got ${body.source}`);
    assert(!JSON.stringify(body).includes("markets"), "resolution route returned raw markets payload");
    assert(route.GET().status === 405, "expected resolution route GET to be rejected");
  } finally {
    globalThis.fetch = originalFetch;
  }

  return { route_checks: 4 };
}

async function validateAnalyzePolymarketLinkRoute() {
  const originalFetch = globalThis.fetch;
  try {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ init, url: String(url) });
      if (String(url).startsWith("https://gamma-api.polymarket.com/markets?slug=")) {
        return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" }, status: 200 });
      }
      if (String(url).includes("slug=lal-cel-lev-2026-05-12")) {
        return new Response(
          JSON.stringify([
            {
              slug: "lal-cel-lev-2026-05-12",
              startTime: "2026-05-12T17:00:00Z",
              tags: [{ label: "Sports", slug: "sports" }, { label: "La Liga", slug: "soccer" }],
              title: "RC Celta de Vigo vs. Levante UD",
              markets: [
                {
                  active: true,
                  closed: true,
                  id: "2113258",
                  outcomePrices: "[\"0\", \"1\"]",
                  outcomes: "[\"Yes\", \"No\"]",
                  question: "Will RC Celta de Vigo win on 2026-05-12?",
                  rawPayloadShouldNotLeak: "SECRET",
                  slug: "lal-cel-lev-2026-05-12-cel",
                },
                {
                  active: true,
                  closed: true,
                  id: "2113260",
                  outcomePrices: "[\"1\", \"0\"]",
                  outcomes: "[\"Yes\", \"No\"]",
                  question: "Will Levante UD win on 2026-05-12?",
                  slug: "lal-cel-lev-2026-05-12-lev",
                },
              ],
            },
          ]),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        );
      }
      return new Response(
        JSON.stringify([
          {
            slug: "nba-okc-lal-2026-05-11",
            startTime: "2026-05-12T02:30:00Z",
            tags: [{ label: "Sports", slug: "sports" }, { label: "NBA", slug: "nba" }],
            title: "Thunder vs. Lakers",
            markets: [
              {
                active: true,
                closed: false,
                conditionId: "0xabc",
                id: "2161658",
                outcomePrices: "[\"0.825\", \"0.175\"]",
                outcomes: "[\"Thunder\", \"Lakers\"]",
                question: "Thunder vs. Lakers",
                rawPayloadShouldNotLeak: "SECRET",
                slug: "nba-okc-lal-2026-05-11",
              },
            ],
          },
        ]),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    };

    const route = loadTsModule("app/api/analyze-polymarket-link/route.ts");
    const invalid = await route.POST(
      new Request("https://example.test/api/analyze-polymarket-link", {
        body: JSON.stringify({ url: "https://polymarket.com.evil.com/event/test" }),
        method: "POST",
      }),
    );
    assert(invalid.status === 400, `expected invalid analyze route request to fail, got ${invalid.status}`);

    const resolved = await route.POST(
      new Request("https://example.test/api/analyze-polymarket-link", {
        body: JSON.stringify({ url: "https://polymarket.com/es/sports/nba/nba-okc-lal-2026-05-11" }),
        method: "POST",
      }),
    );
    assert(resolved.status === 200, `expected analyze route to return 200, got ${resolved.status}`);
    const body = await resolved.json();
    assert(body.status === "ok", `expected analyze route ok status, got ${body.status}`);
    assert(body.source === "gamma", `expected analyze route gamma source, got ${body.source}`);
    assert(body.eventSlug === "nba-okc-lal-2026-05-11", `unexpected event slug ${body.eventSlug}`);
    assert(body.markets?.[0]?.question === "Thunder vs. Lakers", "expected route to normalize the returned market");
    assert(!JSON.stringify(body).includes("SECRET"), "analyze route leaked raw payload");
    assert(!JSON.stringify(body).includes("Sevilla"), "analyze route included unrelated soccer market");
    assert(String(calls[0]?.url).startsWith("https://gamma-api.polymarket.com/events?slug="), "route did not call allowlisted Gamma events endpoint");

    const marketResolved = await route.POST(
      new Request("https://example.test/api/analyze-polymarket-link", {
        body: JSON.stringify({ url: "https://polymarket.com/market/lal-cel-lev-2026-05-12-cel" }),
        method: "POST",
      }),
    );
    assert(marketResolved.status === 200, `expected analyze route exact market to return 200, got ${marketResolved.status}`);
    const marketBody = await marketResolved.json();
    assert(marketBody.status === "ok", `expected exact market route ok status, got ${marketBody.status}`);
    assert(marketBody.marketSlug === "lal-cel-lev-2026-05-12-cel", `unexpected exact market slug ${marketBody.marketSlug}`);
    assert(marketBody.markets?.length === 1, `expected exact market route to return one market, got ${marketBody.markets?.length}`);
    assert(marketBody.markets?.[0]?.slug === "lal-cel-lev-2026-05-12-cel", "exact market route returned a sibling market");
    assert(!JSON.stringify(marketBody).includes("SECRET"), "exact market route leaked raw payload");
    assert(route.GET().status === 405, "expected analyze route GET to be rejected");
  } finally {
    globalThis.fetch = originalFetch;
  }

  return { route_checks: 6 };
}

async function validateBackendProxy() {
  const route = loadTsModule("app/api/backend/[...path]/route.ts");
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  };

  try {
    const allowed = await route.GET(
      new Request("https://example.test/api/backend/markets/overview?sport_type=soccer"),
      { params: Promise.resolve({ path: ["markets", "overview"] }) },
    );
    assert(allowed.status === 200, `expected allowed proxy request to return 200, got ${allowed.status}`);
    assert(calls.length === 1, "expected allowed proxy request to call upstream once");
    assert(
      calls[0].url === "https://polisygnal.onrender.com/markets/overview?sport_type=soccer",
      `unexpected upstream URL: ${calls[0].url}`,
    );

    const absoluteUrl = await route.GET(new Request("https://example.test/api/backend/https://evil.com"), {
      params: Promise.resolve({ path: ["https://evil.com"] }),
    });
    assert(absoluteUrl.status === 404, `expected absolute URL path to be blocked, got ${absoluteUrl.status}`);
    assert(!JSON.stringify(await absoluteUrl.json()).includes("polisygnal.onrender.com"), "blocked proxy leaked backend host");

    const unexpectedPath = await route.GET(new Request("https://example.test/api/backend/admin/secrets"), {
      params: Promise.resolve({ path: ["admin", "secrets"] }),
    });
    assert(unexpectedPath.status === 404, `expected unexpected path to be blocked, got ${unexpectedPath.status}`);

    const longQuery = await route.GET(
      new Request(`https://example.test/api/backend/markets/overview?${"q=x&".repeat(500)}`),
      { params: Promise.resolve({ path: ["markets", "overview"] }) },
    );
    assert(longQuery.status === 414, `expected long query to be blocked, got ${longQuery.status}`);

    globalThis.fetch = async () =>
      new Response("<html>unexpected</html>", {
        headers: { "Content-Type": "text/html" },
        status: 200,
      });
    const unsafeContentType = await route.GET(
      new Request("https://example.test/api/backend/markets/overview?sport_type=soccer"),
      { params: Promise.resolve({ path: ["markets", "overview"] }) },
    );
    assert(unsafeContentType.status === 502, `expected unsafe content-type to be blocked, got ${unsafeContentType.status}`);

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ detail: "internal timeout" }), {
        headers: { "Content-Type": "application/json" },
        status: 504,
      });
    const upstreamTimeout = await route.GET(
      new Request("https://example.test/api/backend/markets/overview?sport_type=soccer"),
      { params: Promise.resolve({ path: ["markets", "overview"] }) },
    );
    const upstreamTimeoutBody = await upstreamTimeout.json();
    assert(upstreamTimeout.status === 504, `expected upstream timeout to stay 504, got ${upstreamTimeout.status}`);
    assert(
      upstreamTimeoutBody.error === "temporary_unavailable",
      `expected generic timeout body, got ${JSON.stringify(upstreamTimeoutBody)}`,
    );
    assert(
      upstreamTimeout.headers.get("x-polysignal-proxy-error") === "upstream_timeout",
      "expected internal proxy diagnostic header for upstream timeout",
    );

    assert(route.POST().status === 405, "expected POST to be rejected");
    assert(route.DELETE().status === 405, "expected DELETE to be rejected");
  } finally {
    globalThis.fetch = originalFetch;
  }

  return { proxy_checks: 7 };
}

function validateAnalyzerFirstProductSource() {
  const shell = readFileSync(resolve(appRoot, "app/components/AppShell.tsx"), "utf8");
  const home = readFileSync(resolve(appRoot, "app/page.tsx"), "utf8");
  const alerts = readFileSync(resolve(appRoot, "app/alerts/page.tsx"), "utf8");
  const performance = readFileSync(resolve(appRoot, "app/performance/page.tsx"), "utf8");
  const methodology = readFileSync(resolve(appRoot, "app/methodology/page.tsx"), "utf8");
  const legacySports = readFileSync(resolve(appRoot, "app/sports/page.tsx"), "utf8");
  const legacySamanthaRoute = resolve(appRoot, "app/api/samantha-polysignal-analysis");

  for (const item of ["Analizar enlace", "Historial", "Rendimiento", "Alertas", "Metodologia"]) {
    assert(shell.includes(item), `expected analyzer-first nav item: ${item}`);
  }
  for (const legacyItem of ["Mercados deportivos", "Resumen diario", "Mi lista"]) {
    assert(!shell.includes(`label: "${legacyItem}"`), `legacy nav item still appears in primary navigation: ${legacyItem}`);
  }
  assert(home.includes("mide si PolySignal acierta"), "home should explain analyzer-first performance loop");
  assert(home.includes("Ver rendimiento"), "home should link to performance");
  assert(alerts.includes("Seguimiento de analisis guardados"), "alerts should focus on saved analyses");
  assert(!alerts.includes("fetchWatchlistItems"), "alerts should not depend on sports watchlist");
  assert(performance.includes("aciertos y fallos medibles"), "performance should document honest accuracy denominator");
  assert(performance.includes("Pendientes de investigacion"), "performance should separate Samantha/research-pending analyses");
  assert(performance.includes("stats.researchPending"), "performance should not mix research pending items with misses");
  assert(methodology.includes("umbral para decision clara es 55%"), "methodology should explain clear decision threshold");
  assert(legacySports.includes("Vista legacy"), "sports route should be marked legacy");
  assert(!existsSync(legacySamanthaRoute), "legacy samantha-polysignal-analysis route must not be reintroduced");

  return { analyzer_first_source_checks: true };
}

const linkChecks = validatePolymarketLinks();
const decisionChecks = validateAnalysisDecisionRules();
const estimateQualityChecks = validateEstimateQualityRules();
const estimateEngineChecks = validateEstimateEngineRules();
const researchReadinessChecks = validateResearchReadinessRules();
const walletIntelligenceChecks = await validateWalletIntelligenceRules();
const analyzeLoadingPanelChecks = validateAnalyzeLoadingPanelSource();
const analyzerReportChecks = validateAnalyzerReportSource();
const samanthaResearchChecks = validateSamanthaResearchRules();
const deepAnalyzerReadinessChecks = validateDeepAnalyzerReadinessRules();
const deepAnalysisJobChecks = validateDeepAnalysisJobRules();
const analyzerResultChecks = validateAnalyzerResultRules();
const analyzerMatchRankingChecks = validateAnalyzerMatchRankingRules();
const polymarketLinkResolverChecks = await validatePolymarketLinkResolverRules();
const resolutionAdapterChecks = await validatePolymarketResolutionAdapter();
const resolutionRouteChecks = await validateResolvePolymarketRoute();
const analyzePolymarketLinkRouteChecks = await validateAnalyzePolymarketLinkRoute();
const proxyChecks = await validateBackendProxy();
const analyzerFirstProductChecks = validateAnalyzerFirstProductSource();

console.log(
  JSON.stringify(
    {
      link_validation: linkChecks,
      analysis_decision: decisionChecks,
      estimate_quality: estimateQualityChecks,
      estimate_engine: estimateEngineChecks,
      research_readiness: researchReadinessChecks,
      wallet_intelligence: walletIntelligenceChecks,
      analyze_loading_panel: analyzeLoadingPanelChecks,
      analyzer_report: analyzerReportChecks,
      samantha_research: samanthaResearchChecks,
      deep_analyzer_readiness: deepAnalyzerReadinessChecks,
      deep_analysis_job: deepAnalysisJobChecks,
      analyzer_result: analyzerResultChecks,
      analyzer_match_ranking: analyzerMatchRankingChecks,
      polymarket_link_resolver: polymarketLinkResolverChecks,
      polymarket_resolution_adapter: resolutionAdapterChecks,
      resolve_polymarket_route: resolutionRouteChecks,
      analyze_polymarket_link_route: analyzePolymarketLinkRouteChecks,
      analyzer_first_product: analyzerFirstProductChecks,
      proxy: proxyChecks,
      status: "ok",
    },
    null,
    2,
  ),
);
