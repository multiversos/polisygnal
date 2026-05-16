import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const reportPath = path.resolve("app/components/AnalyzerReport.tsx");
const source = fs.readFileSync(reportPath, "utf8");
const nonDebugStart = source.indexOf("{!SHOW_ANALYZER_DEBUG_TOOLS ? (");
const manualSectionStart = source.indexOf(
  '<section className="samantha-research-panel" id="samantha-research"',
);
const nonDebugSection =
  nonDebugStart >= 0 && manualSectionStart > nonDebugStart
    ? source.slice(nonDebugStart, manualSectionStart)
    : "";

assert(nonDebugSection.includes('aria-label="Evidencia usada"'), "missing compact evidence section");
assert(
  nonDebugSection.includes('aria-label="Que falta para generar estimacion propia"'),
  "missing estimate gap section",
);
assert(
  nonDebugSection.includes('aria-label="Que revisar primero"'),
  "missing review-first section",
);
assert(
  nonDebugSection.includes("Detalles avanzados del analisis"),
  "missing advanced details accordion",
);
assert(
  !nonDebugSection.includes('open className="analyzer-report-layer completed analyzer-advanced-details"') &&
    !nonDebugSection.includes('className="analyzer-report-layer completed analyzer-advanced-details" open'),
  "advanced details must stay collapsed by default",
);

const viewDataCount = (nonDebugSection.match(/>\s*Ver datos\s*</g) ?? []).length;
const viewWalletsCount = (nonDebugSection.match(/>\s*Ver billeteras\s*</g) ?? []).length;
const oddsComparisonCount = (nonDebugSection.match(/Comparacion con OddsBlaze/g) ?? []).length;
const signalsSectionCount = (nonDebugSection.match(/Senales principales/g) ?? []).length;

assert(viewDataCount === 1, `expected one visible 'Ver datos' button, got ${viewDataCount}`);
assert(viewWalletsCount === 1, `expected one visible 'Ver billeteras' button, got ${viewWalletsCount}`);
assert(oddsComparisonCount === 0, "odds comparison should live inside the compact odds card, not as a duplicate section");
assert(signalsSectionCount === 0, "visible non-debug layout should not keep the old 'Senales principales' section");

console.log("Analyzer report layout tests passed");
