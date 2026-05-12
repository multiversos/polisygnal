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
  assert(extractPolymarketSlug(localizedSportsLink) === "lal-cel-lev-2026-05-12", "expected raw slug without league prefix");
  assert(!extractPossibleMarketTerms(localizedSportsLink).includes("laliga"), "expected league not to become a strong term");

  return { accepted: accepted.length, parsed_links: 8, rejected: rejected.length };
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
    getWalletSignalSummary,
    getWalletWarnings,
    shouldUseWalletAsAuxiliarySignal,
  } = {
    ...loadTsModule("app/lib/walletIntelligence.ts"),
    ...loadTsModule("app/lib/walletIntelligenceAdapter.ts"),
  };
  const { collectIndependentSignals } = loadTsModule("app/lib/estimationSignals.ts");
  const { getPolySignalEstimate } = loadTsModule("app/lib/polySignalEstimateEngine.ts");

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
  } finally {
    globalThis.fetch = originalFetch;
  }

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

  return { cases: 28, threshold_usd: WALLET_INTELLIGENCE_THRESHOLD_USD };
}

function validateAnalyzeLoadingPanelSource() {
  const source = readFileSync(resolve(appRoot, "app/components/AnalyzeLoadingPanel.tsx"), "utf8");
  const analyzePage = readFileSync(resolve(appRoot, "app/analyze/page.tsx"), "utf8");
  const expectedSteps = [
    "Detectando enlace",
    "Resolviendo mercado/evento",
    "Analizando mercado seleccionado",
    "Revisando senales disponibles",
    "Revisando billeteras",
    "Preparando lectura",
  ];
  const expectedSkeletons = [
    "Mercado detectado",
    "Selector de mercados",
    "Probabilidad del mercado",
    "Estimacion PolySignal",
    "Wallet Intelligence",
    "Resultado/verificacion",
  ];
  const expectedCategories = [
    "Deportes",
    "Noticias",
    "Politica",
    "Mercados",
    "Cripto",
    "Billeteras",
    "Historial",
    "Resolucion",
  ];

  assert(source.includes("export type AnalyzeLoadingPhase"), "expected typed analyze loading phases");
  assert(source.includes("scouting-radar-shell"), "expected prominent radar analytics visual shell");
  assert(source.includes("scouting-radar-core"), "expected radar center mark");
  assert(source.includes("RADAR_MARKET_CATEGORIES"), "expected multi-market radar category config");
  assert(source.includes("aria-live=\"polite\""), "expected polite live region in loading panel");
  assert(source.includes("aria-busy=\"true\""), "expected busy state in loading panel");
  for (const step of expectedSteps) {
    assert(source.includes(step), `expected loading step copy: ${step}`);
  }
  for (const skeleton of expectedSkeletons) {
    assert(source.includes(skeleton), `expected loading skeleton copy: ${skeleton}`);
  }
  for (const category of expectedCategories) {
    assert(source.includes(category), `expected multi-market radar category: ${category}`);
  }
  assert(!source.includes("setTimeout"), "loading panel should not use fake timers");
  assert(!source.includes("setInterval"), "loading panel should not use interval-based fake progress");
  assert(!source.includes("100%"), "loading panel should not expose invented percent progress");
  assert(analyzePage.includes("AnalyzeLoadingPanel"), "expected /analyze to render the loading panel");
  assert(analyzePage.includes("MarketSelectionPanel"), "expected /analyze to render the confirmation selector");
  assert(analyzePage.includes("analyzeSelectedMarket"), "expected /analyze to analyze only a selected market");
  assert(analyzePage.includes('status: "needs_selection"'), "expected exact matches to require confirmation");
  assert(analyzePage.includes('status: "analyzing_selected"'), "expected selected-market loading state");
  assert(analyzePage.includes('status: "result"'), "expected single selected result state");
  assert(!analyzePage.includes("enrichMatchesWithWalletIntelligence(matches)"), "expected wallet lookup not to run for all matches");
  assert(analyzePage.includes('advancePhase("matching")'), "expected /analyze loader to enter matching phase");
  assert(analyzePage.includes('advancePhase("context")'), "expected /analyze loader to enter context phase");
  assert(analyzePage.includes('advancePhase("readiness")'), "expected /analyze loader to enter readiness phase");
  assert(analyzePage.includes('advancePhase("research")'), "expected /analyze loader to enter research phase");
  assert(analyzePage.includes('advancePhase("preparing")'), "expected /analyze loader to enter preparing phase");

  return { phases: expectedSteps.length, skeletons: expectedSkeletons.length };
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

  return { cases: 6 };
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

const linkChecks = validatePolymarketLinks();
const decisionChecks = validateAnalysisDecisionRules();
const estimateQualityChecks = validateEstimateQualityRules();
const estimateEngineChecks = validateEstimateEngineRules();
const researchReadinessChecks = validateResearchReadinessRules();
const walletIntelligenceChecks = await validateWalletIntelligenceRules();
const analyzeLoadingPanelChecks = validateAnalyzeLoadingPanelSource();
const analyzerResultChecks = validateAnalyzerResultRules();
const analyzerMatchRankingChecks = validateAnalyzerMatchRankingRules();
const resolutionAdapterChecks = await validatePolymarketResolutionAdapter();
const resolutionRouteChecks = await validateResolvePolymarketRoute();
const proxyChecks = await validateBackendProxy();

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
      analyzer_result: analyzerResultChecks,
      analyzer_match_ranking: analyzerMatchRankingChecks,
      polymarket_resolution_adapter: resolutionAdapterChecks,
      resolve_polymarket_route: resolutionRouteChecks,
      proxy: proxyChecks,
      status: "ok",
    },
    null,
    2,
  ),
);
