import { assert, loadTsModule } from "./lib/test-loader.mjs";

const {
  analysisAgentEndpointIsSafe,
  getAnalysisAgentBridgeConfig,
  sendAnalysisAgentResearchTask,
} = loadTsModule("app/lib/analysisAgentBridge.ts");
const {
  getAnalysisAgentRuntimeConfig,
} = loadTsModule("app/lib/analysisAgentRegistry.ts");

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("ANALYSIS_AGENT_") || key.startsWith("SAMANTHA_BRIDGE_")) {
      delete process.env[key];
    }
  }
}

function restore() {
  process.env = ORIGINAL_ENV;
  globalThis.fetch = ORIGINAL_FETCH;
}

function fixtureTask() {
  return {
    brief: {
      createdAt: "2026-05-13T00:00:00.000Z",
      knownSignals: {
        marketProbability: { no: 0.46, yes: 0.54 },
        walletIntelligence: {
          available: false,
          notableWalletCount: 0,
          observedCapitalUsd: 0,
          walletSignalAvailable: false,
          warnings: ["Fixture without wallet signal."],
        },
      },
      market: {
        category: "sports",
        eventSlug: "fixture-event",
        liquidity: 1000,
        marketSlug: "fixture-market",
        normalizedUrl: "https://polymarket.com/event/fixture-event",
        outcomes: [
          { label: "YES", price: 0.54, side: "YES" },
          { label: "NO", price: 0.46, side: "NO" },
        ],
        title: "Fixture market",
        url: "https://polymarket.com/event/fixture-event",
        volume: 2000,
      },
      researchGoals: ["external_news"],
      safetyRules: ["No fake ROI.", "No copy-trading."],
      taskType: "deep_market_research",
      version: "1.0",
    },
    createdAt: "2026-05-13T00:00:00.000Z",
    id: "fixture-task",
    normalizedUrl: "https://polymarket.com/event/fixture-event",
    taskPacket: {
      expectedReportSchema: "{}",
      returnInstructions: "Return JSON.",
      safetyRules: ["No secrets."],
      samanthaInstructionsText: "Analyze safely.",
      taskPacketJson: "{\"ok\":true}",
    },
  };
}

try {
  resetEnv();
  let config = getAnalysisAgentBridgeConfig();
  assert(config.agentId === "samantha", "default provider should be Samantha");
  assert(config.mode === "disabled", "bridge should be disabled without env");

  process.env.SAMANTHA_BRIDGE_ENABLED = "true";
  process.env.SAMANTHA_BRIDGE_URL = "https://samantha.example.com/polysignal/analyze-market";
  config = getAnalysisAgentBridgeConfig();
  assert(config.mode === "automatic", "legacy SAMANTHA_BRIDGE_* should still configure the bridge");
  assert(config.agentName === "Samantha", "legacy bridge should keep Samantha display name");

  process.env.ANALYSIS_AGENT_PROVIDER = "jarvis";
  process.env.ANALYSIS_AGENT_ENABLED = "true";
  process.env.ANALYSIS_AGENT_URL = "https://jarvis.example.com/polysignal/analyze-market";
  process.env.ANALYSIS_AGENT_DISPLAY_NAME = "Jarvis";
  const runtime = getAnalysisAgentRuntimeConfig();
  assert(runtime.usesGenericEnv, "generic env should take priority over Samantha legacy env");
  assert(runtime.provider.id === "jarvis", "generic provider id should be active");
  assert(runtime.provider.displayName === "Jarvis", "generic display name should be active");

  const unsafeLocalhost = analysisAgentEndpointIsSafe("http://localhost:8787/polysignal/analyze-market", false);
  assert(!unsafeLocalhost.safe, "localhost must be rejected unless explicitly allowed");
  const safeLocalhost = analysisAgentEndpointIsSafe("http://localhost:8787/polysignal/analyze-market", true);
  assert(safeLocalhost.safe, "localhost should be accepted only when allow-localhost is true");

  process.env.ANALYSIS_AGENT_TOKEN = "test-token-value";
  let capturedAuthorization = "";
  globalThis.fetch = async (_url, init) => {
    capturedAuthorization = init?.headers?.authorization || "";
    return new Response(
      JSON.stringify({
        agentId: "jarvis",
        agentName: "Jarvis",
        checkedAt: "2026-05-13T00:00:00.000Z",
        keySignals: [],
        limitations: ["Fixture only."],
        risks: [],
        sourcesUsed: ["fixture"],
        status: "partial",
        suggestedDecision: {
          available: false,
          confidence: null,
          probability: null,
          reason: "Fixture has no independent signal.",
          side: null,
        },
        summary: "Fixture partial reading.",
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );
  };
  const partial = await sendAnalysisAgentResearchTask(fixtureTask());
  assert(capturedAuthorization === "Bearer test-token-value", "bridge should send token as bearer header");
  assert(!JSON.stringify(partial).includes("test-token-value"), "bridge result must not leak token");
  assert(partial.agentName === "Jarvis", "bridge response should preserve dynamic agent name");
  assert(partial.status === "agent_researching", "partial agent response should not be treated as a fake completed estimate");

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ summary: "Wallet 0x1234567890abcdef1234567890abcdef12345678" }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  const unsafe = await sendAnalysisAgentResearchTask(fixtureTask());
  assert(unsafe.fallbackRequired, "unsafe full wallet response should fail safe");
  assert(unsafe.errorCode === "invalid_response", "unsafe full wallet response should be invalid_response");

  resetEnv();
  process.env.ANALYSIS_AGENT_PROVIDER = "jarvis";
  process.env.ANALYSIS_AGENT_ENABLED = "false";
  process.env.ANALYSIS_AGENT_URL = "";
  const jarvisDisabled = await sendAnalysisAgentResearchTask(fixtureTask());
  assert(jarvisDisabled.status === "disabled", "unconfigured Jarvis provider should not make fake calls");

  console.log("Analysis agent bridge tests passed");
} finally {
  restore();
}
