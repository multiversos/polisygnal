import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { appRoot, assert, loadTsModule } from "./lib/test-loader.mjs";

const {
  ANALYZE_PROGRESS_MIN_STEP_MS,
  isImmediateAnalyzeStepStatus,
  isTerminalAnalyzeStepStatus,
  remainingStepRevealMs,
} = loadTsModule("app/lib/analyzerProgressReveal.ts");

const panelSource = readFileSync(resolve(appRoot, "app/components/AnalyzeLoadingPanel.tsx"), "utf8");
const analyzePageSource = readFileSync(resolve(appRoot, "app/analyze/page.tsx"), "utf8");

assert(ANALYZE_PROGRESS_MIN_STEP_MS === 700, "analyzer progress should use a short 700ms visual step minimum");
assert(isTerminalAnalyzeStepStatus("completed_with_data"), "completed_with_data should be terminal for visual reveal");
assert(isTerminalAnalyzeStepStatus("completed_empty"), "completed_empty should be terminal for visual reveal");
assert(isTerminalAnalyzeStepStatus("limited"), "limited market data should be terminal for visual reveal");
assert(isTerminalAnalyzeStepStatus("timeout"), "timeout should be terminal for visual reveal");
assert(!isTerminalAnalyzeStepStatus("running"), "running should not reveal as completed");
assert(!isTerminalAnalyzeStepStatus("pending"), "pending should not reveal as completed");
assert(isImmediateAnalyzeStepStatus("timeout"), "timeout should bypass artificial holding");
assert(isImmediateAnalyzeStepStatus("failed_safe"), "failed_safe should bypass artificial holding");
assert(remainingStepRevealMs({ elapsedMs: 0, status: "completed_with_data" }) === 700, "fast completed steps should hold briefly");
assert(remainingStepRevealMs({ elapsedMs: 250, status: "completed_with_data" }) === 450, "remaining reveal time should shrink with elapsed time");
assert(remainingStepRevealMs({ elapsedMs: 900, status: "completed_with_data" }) === 0, "completed steps should not wait past the minimum");
assert(remainingStepRevealMs({ elapsedMs: 0, status: "timeout" }) === 0, "timeouts should not be delayed");

assert(panelSource.includes("visualStepIndex"), "progress panel should keep a separate visual step index");
assert(panelSource.includes("runningOverrideForStep"), "progress panel should show running copy before revealing fast completions");
assert(panelSource.includes("Resumen encontrado hasta ahora"), "progress panel should show an incremental source summary");
assert(panelSource.includes("Mercado, datos y billeteras ya fueron consultados"), "long wait copy should say sources were already consulted");
assert(panelSource.includes("Enriqueciendo perfiles"), "progress panel should support real profile enrichment phase");
assert(panelSource.includes("Construyendo historial de wallets"), "progress panel should support real wallet history phase");
assert(panelSource.includes("Validando consistencia de capital"), "progress panel should support consistency validation for large markets");
assert(panelSource.includes("optional: true"), "expanded wallet phases should stay optional");
assert(panelSource.includes("window.setTimeout"), "progress panel should use a short visual timer for sequential reveal");
assert(panelSource.includes("ANALYZE_PROGRESS_MIN_STEP_MS"), "progress panel should use the shared short reveal constant");
assert(panelSource.includes('label: actionReady ? realAction.label : "Preparando..."'), "detail buttons should stay disabled until their step is visually revealed");
assert(!panelSource.includes("setInterval"), "progress panel should not use interval-based fake progress");
assert(!panelSource.includes("100%"), "progress panel should not expose invented percent progress");
assert(!panelSource.includes("5000"), "progress panel should not add long fake delays");
assert(!panelSource.includes("10000"), "progress panel should not add long fake delays");

assert(analyzePageSource.includes("progressKey={analysisRunRef.current}"), "analyze page should reset visual reveal per analysis run");
assert(analyzePageSource.includes("getDisplayMarketPrices"), "market-data progress summary should use real outcome prices");
assert(analyzePageSource.includes("formatMarketPriceValue"), "market-data progress should summarize real visible prices");
assert(analyzePageSource.includes('status: "timeout"'), "wallet timeout should have its own honest status");
assert(analyzePageSource.includes("buildWalletExpandedSummary"), "analyze page should derive expanded wallet progress from real summary data");
assert(analyzePageSource.includes("shouldUseExpandedWalletAnalysis"), "large markets should trigger expanded wallet analysis only from real thresholds");
assert(!analyzePageSource.includes("enrichMatchesWithWalletIntelligence(matches)"), "wallet lookup should still run only for the selected market");

console.log("Analyzer progress reveal tests passed");
