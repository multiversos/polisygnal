import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { appRoot, assert, loadTsModule } from "./lib/test-loader.mjs";

const { markJobSamanthaBridgeFallback, markJobSamanthaReportLoaded, createDeepAnalysisJob } =
  loadTsModule("app/lib/deepAnalysisJob.ts");

const analyzePageSource = readFileSync(resolve(appRoot, "app/analyze/page.tsx"), "utf8");
const panelSource = readFileSync(resolve(appRoot, "app/components/AnalyzeLoadingPanel.tsx"), "utf8");
const bridgeSource = readFileSync(resolve(appRoot, "app/lib/analysisAgentBridge.ts"), "utf8");

const fallbackJob = markJobSamanthaBridgeFallback(createDeepAnalysisJob("https://polymarket.com/market/fixture"), {
  agentName: "Samantha",
  automaticAvailable: true,
  reason: "Samantha no respondio dentro del tiempo maximo.",
});
assert(fallbackJob.status === "ready_to_score", "agent fallback should be terminal instead of awaiting forever");
assert(fallbackJob.samanthaBridge?.fallbackRequired === true, "agent fallback should be visible as fallback");
assert(
  fallbackJob.steps.find((step) => step.id === "awaiting_samantha_report")?.status === "blocked",
  "agent fallback should close the awaiting step",
);

const partialReportJob = markJobSamanthaReportLoaded(createDeepAnalysisJob("https://polymarket.com/market/fixture"), {
  acceptedEstimate: false,
  agentName: "Samantha",
  reportStatus: "partial",
  signalCount: 0,
});
assert(partialReportJob.status === "ready_to_score", "valid partial report with no signals should still be terminal");

assert(analyzePageSource.includes("ANALYSIS_AGENT_POLL_TIMEOUT_MS = 90_000"), "analyze should cap polling at 90s");
assert(analyzePageSource.includes("ANALYSIS_AGENT_UI_TIMEOUT_SECONDS = 120"), "UI should force a terminal timeout by 120s");
assert(analyzePageSource.includes("remainingAgentMs"), "send plus polling should respect the 120s UI cap");
assert(analyzePageSource.includes("sendAnalysisAgentResearchWithRetry"), "agent send should use controlled retry");
assert(analyzePageSource.includes("ANALYSIS_AGENT_MAX_AUTO_RETRIES = 1"), "agent retry should be limited to one automatic retry");
assert(analyzePageSource.includes("pollAnalysisAgentResearchStatus"), "pending agent task should poll with a limit");
assert(analyzePageSource.includes("markCurrentAgentTimeout"), "analyze page should convert long waits to terminal timeout");
assert(analyzePageSource.includes("handleRetrySamantha"), "timeout recovery should retry only Samantha");
assert(analyzePageSource.includes("handleContinueWithPartial"), "timeout recovery should allow partial continuation");
assert(analyzePageSource.includes("job.samanthaBridge?.fallbackRequired"), "pending radar should stop after fallback");
assert(!analyzePageSource.includes("while (true)"), "agent polling must not be unbounded");

assert(panelSource.includes("no respondio a tiempo"), "loading panel should show explicit agent timeout recovery");
assert(panelSource.includes("Continuar con lectura parcial"), "loading panel should expose partial continuation");
assert(panelSource.includes("Reintentar {agentName}"), "loading panel should expose agent-only retry");
assert(analyzePageSource.includes("Tiempo maximo"), "loading panel should show max wait copy");
assert(panelSource.includes("Estado operativo"), "loading panel should expose operational status without secrets");

assert(bridgeSource.includes('status: terminalStatus'), "bridge should preserve terminal analysis status");
assert(bridgeSource.includes('errorCode === "request_timeout"'), "bridge timeout should become a visible timeout status");
assert(!panelSource.toLowerCase().includes("token"), "agent panel must not mention tokens");

console.log("Analysis agent timeout tests passed");
