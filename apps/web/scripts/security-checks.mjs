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
  });
  new vm.Script(compiled, { filename: absolutePath }).runInContext(context);
  return module.exports;
}

function validatePolymarketLinks() {
  const {
    getPolymarketUrlValidationMessage,
    isPolymarketUrl,
    normalizePolymarketUrl,
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

  return { accepted: accepted.length, rejected: rejected.length };
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

function validateAnalyzeLoadingPanelSource() {
  const source = readFileSync(resolve(appRoot, "app/components/AnalyzeLoadingPanel.tsx"), "utf8");
  const analyzePage = readFileSync(resolve(appRoot, "app/analyze/page.tsx"), "utf8");
  const expectedSteps = [
    "Validando enlace",
    "Buscando coincidencias en PolySignal",
    "Detectando contexto del partido",
    "Revisando preparacion de datos",
    "Revisando investigacion externa",
    "Preparando lectura final",
  ];
  const expectedSkeletons = [
    "Probabilidad del mercado",
    "Estimacion PolySignal",
    "Contexto del partido",
    "Investigacion externa",
    "Preparacion de datos",
  ];

  assert(source.includes("export type AnalyzeLoadingPhase"), "expected typed analyze loading phases");
  assert(source.includes("aria-live=\"polite\""), "expected polite live region in loading panel");
  assert(source.includes("aria-busy=\"true\""), "expected busy state in loading panel");
  for (const step of expectedSteps) {
    assert(source.includes(step), `expected loading step copy: ${step}`);
  }
  for (const skeleton of expectedSkeletons) {
    assert(source.includes(skeleton), `expected loading skeleton copy: ${skeleton}`);
  }
  assert(!source.includes("setTimeout"), "loading panel should not use fake timers");
  assert(!source.includes("setInterval"), "loading panel should not use interval-based fake progress");
  assert(!source.includes("100%"), "loading panel should not expose invented percent progress");
  assert(analyzePage.includes("AnalyzeLoadingPanel"), "expected /analyze to render the loading panel");
  assert(analyzePage.includes('advancePhase("matching")'), "expected /analyze loader to enter matching phase");
  assert(analyzePage.includes('advancePhase("context")'), "expected /analyze loader to enter context phase");
  assert(analyzePage.includes('advancePhase("readiness")'), "expected /analyze loader to enter readiness phase");
  assert(analyzePage.includes('advancePhase("research")'), "expected /analyze loader to enter research phase");
  assert(analyzePage.includes('advancePhase("preparing")'), "expected /analyze loader to enter preparing phase");

  return { phases: expectedSteps.length, skeletons: expectedSkeletons.length };
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
const analyzeLoadingPanelChecks = validateAnalyzeLoadingPanelSource();
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
      analyze_loading_panel: analyzeLoadingPanelChecks,
      polymarket_resolution_adapter: resolutionAdapterChecks,
      resolve_polymarket_route: resolutionRouteChecks,
      proxy: proxyChecks,
      status: "ok",
    },
    null,
    2,
  ),
);
