import type { EvidenceItem } from "./evidenceTypes";
import type { DeepAnalysisSignal } from "./deepAnalyzerTypes";
import type {
  SamanthaComparisonSummary,
  SamanthaDirection,
  SamanthaEvidenceItem,
  SamanthaEvidenceSourceType,
  SamanthaKalshiComparisonSummary,
  SamanthaReliability,
  SamanthaResearchParseResult,
  SamanthaResearchReport,
  SamanthaSuggestedEstimate,
} from "./samanthaResearchTypes";

const MAX_EVIDENCE_ITEMS = 24;
const MAX_TEXT_LENGTH = 900;
const MAX_QUOTE_LENGTH = 280;
const FULL_WALLET_ADDRESS_PATTERN = /0x[a-fA-F0-9]{40}/;
const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /authorization\s*:/i,
  /bearer\s+[a-z0-9._-]+/i,
  /database_url/i,
  /password\s*[:=]/i,
  /postgres(ql)?:\/\//i,
  /secret\s*[:=]/i,
  /token\s*[:=]/i,
] as const;
const MAX_REPORT_INPUT_LENGTH = 60000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, limit = MAX_TEXT_LENGTH): string {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function normalizeDirection(value: unknown): SamanthaDirection {
  if (value === "YES" || value === "NO" || value === "NEUTRAL" || value === "UNKNOWN") {
    return value;
  }
  return "UNKNOWN";
}

function normalizeReliability(value: unknown): SamanthaReliability {
  if (value === "high" || value === "medium" || value === "low" || value === "unknown") {
    return value;
  }
  return "unknown";
}

function normalizeSourceType(value: unknown): SamanthaEvidenceSourceType {
  if (
    value === "official" ||
    value === "news" ||
    value === "sports_data" ||
    value === "odds" ||
    value === "kalshi" ||
    value === "reddit" ||
    value === "social" ||
    value === "other"
  ) {
    return value;
  }
  return "other";
}

function normalizeStatus(value: unknown): SamanthaResearchReport["status"] {
  if (value === "completed" || value === "partial" || value === "failed") {
    return value;
  }
  return "failed";
}

function normalizeDecision(value: unknown): SamanthaSuggestedEstimate["decision"] {
  if (value === "YES" || value === "NO" || value === "WEAK" || value === "NONE") {
    return value;
  }
  return "NONE";
}

function normalizeConfidence(value: unknown): SamanthaSuggestedEstimate["confidence"] {
  if (value === "high" || value === "medium" || value === "low" || value === "none") {
    return value;
  }
  return "none";
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function containsSensitiveText(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value)) || FULL_WALLET_ADDRESS_PATTERN.test(value);
}

function isPrivateIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return false;
  }
  const [a, b] = match.slice(1).map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isSafeSourceUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "metadata.google.internal" ||
      hostname === "169.254.169.254" ||
      hostname.endsWith(".local") ||
      hostname === "::1" ||
      isPrivateIpv4(hostname)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function sanitizeEvidenceItem(value: unknown, index: number): SamanthaEvidenceItem {
  const item = isRecord(value) ? value : {};
  const sourceType = normalizeSourceType(item.sourceType);
  const reliability = normalizeReliability(item.reliability);
  return {
    checkedAt: cleanText(item.checkedAt) || new Date().toISOString(),
    direction: normalizeDirection(item.direction),
    id: cleanText(item.id, 80) || `evidence-${index + 1}`,
    publishedAt: cleanText(item.publishedAt, 80) || undefined,
    quote: cleanText(item.quote, MAX_QUOTE_LENGTH) || undefined,
    reliability,
    sourceName: cleanText(item.sourceName, 140),
    sourceType,
    sourceUrl: cleanText(item.sourceUrl, 600) || undefined,
    summary: cleanText(item.summary),
    title: cleanText(item.title, 180),
  };
}

function sanitizeComparison(
  value: unknown,
): SamanthaComparisonSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    direction: normalizeDirection(value.direction),
    found: value.found === true,
    reliability: normalizeReliability(value.reliability),
    summary: cleanText(value.summary),
  };
}

function sanitizeKalshiComparison(value: unknown): SamanthaKalshiComparisonSummary | undefined {
  const comparison = sanitizeComparison(value);
  if (!comparison || !isRecord(value)) {
    return undefined;
  }
  return {
    ...comparison,
    equivalent: value.equivalent === true,
  };
}

function sanitizeSuggestedEstimate(value: unknown): SamanthaSuggestedEstimate | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    available: value.available === true,
    confidence: normalizeConfidence(value.confidence),
    decision: normalizeDecision(value.decision),
    noProbability: toNumber(value.noProbability),
    reason: cleanText(value.reason),
    yesProbability: toNumber(value.yesProbability),
  };
}

export function sanitizeSamanthaResearchReport(report: unknown): SamanthaResearchReport {
  const value = isRecord(report) ? report : {};
  const evidence = Array.isArray(value.evidence)
    ? value.evidence.slice(0, MAX_EVIDENCE_ITEMS).map((item, index) => sanitizeEvidenceItem(item, index))
    : [];
  return {
    completedAt: cleanText(value.completedAt, 80) || new Date().toISOString(),
    evidence,
    kalshiComparison: sanitizeKalshiComparison(value.kalshiComparison),
    marketUrl: cleanText(value.marketUrl, 600),
    oddsComparison: sanitizeComparison(value.oddsComparison),
    status: normalizeStatus(value.status),
    suggestedEstimate: sanitizeSuggestedEstimate(value.suggestedEstimate),
    version: value.version === "1.0" ? "1.0" : "1.0",
    warnings: Array.isArray(value.warnings)
      ? value.warnings.map((warning) => cleanText(warning, 220)).filter(Boolean).slice(0, 12)
      : [],
  };
}

export function validateSamanthaResearchReport(report: SamanthaResearchReport): SamanthaResearchParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (report.version !== "1.0") {
    errors.push("El reporte debe usar version 1.0.");
  }
  if (!report.marketUrl) {
    errors.push("El reporte debe incluir marketUrl.");
  } else if (!isSafeSourceUrl(report.marketUrl)) {
    errors.push("marketUrl no es una URL publica segura.");
  }
  if (report.status !== "failed" && report.evidence.length === 0) {
    errors.push("Un reporte completado o parcial debe incluir evidencia o marcarse como failed.");
  }
  report.evidence.forEach((item, index) => {
    const label = `evidence[${index}]`;
    if (!item.sourceName) {
      errors.push(`${label} requiere sourceName.`);
    }
    if (!item.summary) {
      errors.push(`${label} requiere summary.`);
    }
    if (!item.title) {
      errors.push(`${label} requiere title.`);
    }
    if (item.sourceUrl && !isSafeSourceUrl(item.sourceUrl)) {
      errors.push(`${label} contiene sourceUrl insegura.`);
    }
    if ((item.sourceType === "reddit" || item.sourceType === "social") && item.reliability === "high") {
      errors.push(`${label} no puede marcar Reddit/social como high reliability.`);
    }
    const text = [item.title, item.sourceName, item.sourceUrl, item.summary, item.quote].filter(Boolean).join(" ");
    if (containsSensitiveText(text)) {
      errors.push(`${label} contiene secreto, direccion completa o dato sensible.`);
    }
    if (item.quote && item.quote.length > MAX_QUOTE_LENGTH) {
      warnings.push(`${label} quote fue truncada.`);
    }
  });
  if (report.oddsComparison?.found && !report.oddsComparison.summary) {
    errors.push("oddsComparison requiere summary si found=true.");
  }
  if (report.kalshiComparison?.found && !report.kalshiComparison.summary) {
    errors.push("kalshiComparison requiere summary si found=true.");
  }
  if (
    report.kalshiComparison?.found &&
    !report.kalshiComparison.equivalent &&
    (report.kalshiComparison.direction === "YES" || report.kalshiComparison.direction === "NO") &&
    (report.kalshiComparison.reliability === "high" || report.kalshiComparison.reliability === "medium")
  ) {
    errors.push("Kalshi no equivalente no puede aportar una senal fuerte YES/NO.");
  }
  const estimate = report.suggestedEstimate;
  if (estimate?.available) {
    const yes = estimate.yesProbability;
    const no = estimate.noProbability;
    if (estimate.confidence === "none") {
      errors.push("suggestedEstimate no puede estar disponible con confidence=none.");
    }
    if (estimate.decision === "NONE") {
      errors.push("suggestedEstimate disponible requiere decision YES, NO o WEAK.");
    }
    if (typeof yes !== "number" || yes < 0 || yes > 100) {
      errors.push("suggestedEstimate.yesProbability debe estar entre 0 y 100.");
    }
    if (typeof no !== "number" || no < 0 || no > 100) {
      errors.push("suggestedEstimate.noProbability debe estar entre 0 y 100.");
    }
    if (!estimate.reason) {
      errors.push("suggestedEstimate requiere reason.");
    }
  }
  return {
    errors,
    report: errors.length === 0 ? report : undefined,
    valid: errors.length === 0,
    warnings: [...warnings, ...report.warnings],
  };
}

export function parseSamanthaResearchReport(input: string | unknown): SamanthaResearchParseResult {
  let raw: unknown = input;
  if (typeof input === "string") {
    if (input.length > MAX_REPORT_INPUT_LENGTH) {
      return {
        errors: ["Texto demasiado largo: el reporte debe ser JSON estructurado y resumido."],
        valid: false,
        warnings: [],
      };
    }
    if (containsSensitiveText(input)) {
      return {
        errors: ["Posible secreto o direccion completa detectada en el reporte."],
        valid: false,
        warnings: [],
      };
    }
    try {
      raw = JSON.parse(input);
    } catch {
      return {
        errors: ["JSON invalido: no pudimos leer el reporte estructurado."],
        valid: false,
        warnings: [],
      };
    }
  }
  if (!isRecord(raw) || raw.version !== "1.0") {
    return {
      errors: ["El reporte debe incluir version 1.0."],
      valid: false,
      warnings: [],
    };
  }
  const sanitized = sanitizeSamanthaResearchReport(raw);
  return validateSamanthaResearchReport(sanitized);
}

function evidenceSourceLabel(sourceType: SamanthaEvidenceSourceType): string {
  if (sourceType === "reddit" || sourceType === "social") {
    return "social_signal";
  }
  if (sourceType === "odds") {
    return "odds_reference";
  }
  if (sourceType === "sports_data") {
    return "stats_provider";
  }
  if (sourceType === "official") {
    return "official_team";
  }
  if (sourceType === "news") {
    return "sports_news";
  }
  return "unknown";
}

function strengthFromReliability(reliability: SamanthaReliability): DeepAnalysisSignal["strength"] {
  if (reliability === "high") {
    return "high";
  }
  if (reliability === "medium") {
    return "medium";
  }
  return "low";
}

function confidenceFromReliability(reliability: SamanthaReliability): DeepAnalysisSignal["confidence"] {
  if (reliability === "high" || reliability === "medium" || reliability === "low") {
    return reliability;
  }
  return "unknown";
}

export function convertSamanthaReportToEvidence(report: SamanthaResearchReport): EvidenceItem[] {
  return report.evidence.map((item) => ({
    capturedAt: item.checkedAt,
    direction: item.direction,
    id: `samantha-${item.id}`,
    isExternal: true,
    isUserVisible: true,
    publishedAt: item.publishedAt,
    reliability: item.reliability,
    sourceName: item.sourceName,
    summary: item.summary,
    title: item.title,
    url: item.sourceUrl,
  }));
}

export function convertSamanthaReportToSignals(report: SamanthaResearchReport): DeepAnalysisSignal[] {
  const signals = report.evidence
    .filter((item) => item.direction !== "UNKNOWN")
    .map((item) => ({
      confidence: confidenceFromReliability(item.reliability),
      direction: item.direction,
      isReal: true,
      label: item.title,
      reason: item.summary,
      source: `samantha_${evidenceSourceLabel(item.sourceType)}`,
      strength: strengthFromReliability(item.reliability),
    }));
  if (report.oddsComparison?.found && report.oddsComparison.direction !== "UNKNOWN") {
    signals.push({
      confidence: confidenceFromReliability(report.oddsComparison.reliability),
      direction: report.oddsComparison.direction,
      isReal: true,
      label: "Comparacion de odds",
      reason: report.oddsComparison.summary,
      source: "samantha_odds_comparison",
      strength: strengthFromReliability(report.oddsComparison.reliability),
    });
  }
  if (
    report.kalshiComparison?.found &&
    report.kalshiComparison.equivalent &&
    report.kalshiComparison.direction !== "UNKNOWN"
  ) {
    signals.push({
      confidence: confidenceFromReliability(report.kalshiComparison.reliability),
      direction: report.kalshiComparison.direction,
      isReal: true,
      label: "Comparacion Kalshi equivalente",
      reason: report.kalshiComparison.summary,
      source: "samantha_kalshi_comparison",
      strength: strengthFromReliability(report.kalshiComparison.reliability),
    });
  }
  return signals;
}

export function shouldAcceptSuggestedEstimate(report: SamanthaResearchReport): boolean {
  const estimate = report.suggestedEstimate;
  if (!estimate?.available || estimate.confidence === "none") {
    return false;
  }
  if (estimate.decision !== "YES" && estimate.decision !== "NO") {
    return false;
  }
  if (
    typeof estimate.yesProbability !== "number" ||
    typeof estimate.noProbability !== "number" ||
    estimate.yesProbability < 0 ||
    estimate.yesProbability > 100 ||
    estimate.noProbability < 0 ||
    estimate.noProbability > 100
  ) {
    return false;
  }
  if (estimate.decision === "YES" && estimate.yesProbability <= estimate.noProbability) {
    return false;
  }
  if (estimate.decision === "NO" && estimate.noProbability <= estimate.yesProbability) {
    return false;
  }
  if (estimate.decision === "YES" && estimate.yesProbability < 55) {
    return false;
  }
  if (estimate.decision === "NO" && estimate.noProbability < 55) {
    return false;
  }
  const directionalSignals = convertSamanthaReportToSignals(report).filter(
    (signal) =>
      signal.direction === estimate.decision &&
      signal.source !== "samantha_social_signal" &&
      (signal.confidence === "high" || signal.confidence === "medium"),
  );
  return directionalSignals.length >= 2;
}
