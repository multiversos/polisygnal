import { getAnalysisAgentRuntimeConfig } from "./analysisAgentRegistry";
import { parseSamanthaResearchReport } from "./samanthaResearchReport";
import type {
  AnalysisAgentBridgeConfig,
  AnalysisAgentErrorCode,
  AnalysisAgentLookupResult,
  AnalysisAgentRawResponse,
  AnalysisAgentRequest,
  AnalysisAgentResponse,
  AnalysisAgentSendResult,
  AnalysisAgentTask,
} from "./analysisAgentTypes";

const MAX_ENDPOINT_LENGTH = 2048;
const PRIVATE_IPV4_PATTERNS = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
] as const;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const SECRET_MARKERS = [
  "api_key",
  "authorization:",
  "bearer ",
  "database_url=",
  "password",
  "postgres://",
  "postgresql://",
  "secret=",
  "token=",
] as const;
const FULL_WALLET_PATTERN = /\b0x[a-fA-F0-9]{40}\b/;
const TASK_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,160}$/;

function nowIso(): string {
  return new Date().toISOString();
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isPrivateIpv4(hostname: string): boolean {
  return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(hostname));
}

function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

function allowedPorts(): Set<string> {
  const raw =
    process.env.ANALYSIS_AGENT_ALLOWED_PORTS?.trim() ||
    process.env.SAMANTHA_BRIDGE_ALLOWED_PORTS?.trim();
  if (!raw) {
    return new Set(["", "80", "443", "8787"]);
  }
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter((item) => item === "" || /^\d{1,5}$/.test(item)),
  );
}

export function analysisAgentEndpointIsSafe(
  rawUrl: string,
  allowLocalhost: boolean,
  agentName = "analysis agent",
): { reason?: string; safe: boolean; url?: URL } {
  if (!rawUrl || rawUrl.length > MAX_ENDPOINT_LENGTH) {
    return { reason: `${agentName} endpoint is missing or too long.`, safe: false };
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { reason: `${agentName} endpoint is not a valid URL.`, safe: false };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { reason: `${agentName} endpoint must use http or https.`, safe: false };
  }
  if (parsed.username || parsed.password) {
    return { reason: `${agentName} endpoint must not include credentials.`, safe: false };
  }
  if (parsed.hash) {
    return { reason: `${agentName} endpoint must not include fragments.`, safe: false };
  }
  const hostname = parsed.hostname.toLowerCase();
  const local = isLocalHost(hostname);
  if (local && !allowLocalhost) {
    return { reason: "Localhost analysis agent endpoint requires explicit allow-localhost config.", safe: false };
  }
  if (!local && isPrivateIpv4(hostname)) {
    return { reason: "Private network analysis agent endpoints are blocked.", safe: false };
  }
  if (parsed.protocol !== "https:" && !local) {
    return { reason: "Non-local analysis agent endpoints must use https.", safe: false };
  }
  if (!allowedPorts().has(parsed.port || (parsed.protocol === "https:" ? "443" : "80"))) {
    return { reason: "Analysis agent endpoint port is not allowlisted.", safe: false };
  }
  return { safe: true, url: parsed };
}

function containsUnsafeText(value: unknown): boolean {
  const serialized = JSON.stringify(value ?? "");
  const lower = serialized.toLowerCase();
  return FULL_WALLET_PATTERN.test(serialized) || SECRET_MARKERS.some((marker) => lower.includes(marker));
}

function configResult(
  mode: AnalysisAgentBridgeConfig["mode"],
  reason: string,
  input: ReturnType<typeof getAnalysisAgentRuntimeConfig>,
): AnalysisAgentBridgeConfig {
  return {
    agentId: input.provider.id,
    agentName: input.provider.displayName,
    allowLocalhost: input.allowLocalhost,
    automaticAvailable: mode === "automatic",
    endpointConfigured: Boolean(input.endpointUrl),
    maxRequestBytes: input.maxRequestBytes,
    maxResponseBytes: input.maxResponseBytes,
    mode,
    provider: input.provider,
    reason,
    timeoutMs: input.timeoutMs,
  };
}

export function getAnalysisAgentBridgeConfig(): AnalysisAgentBridgeConfig {
  const runtime = getAnalysisAgentRuntimeConfig();
  if (!runtime.enabled) {
    return configResult("disabled", `${runtime.displayName} automatic bridge is disabled; automatic source is unavailable.`, runtime);
  }
  const safeEndpoint = analysisAgentEndpointIsSafe(runtime.endpointUrl, runtime.allowLocalhost, runtime.displayName);
  if (!safeEndpoint.safe) {
    return configResult("manual_fallback", safeEndpoint.reason || "Analysis agent endpoint is not safe.", runtime);
  }
  return configResult("automatic", `${runtime.displayName} automatic bridge is configured.`, runtime);
}

export function validateAnalysisAgentTask(
  task: AnalysisAgentTask,
  config = getAnalysisAgentBridgeConfig(),
): { errors: string[]; valid: boolean } {
  const errors: string[] = [];
  if (!task || typeof task !== "object") {
    return { errors: ["invalid_task"], valid: false };
  }
  if (!task.id || !task.normalizedUrl || !task.brief || !task.taskPacket) {
    errors.push("missing_task_fields");
  }
  if (containsUnsafeText(task)) {
    errors.push("task_contains_sensitive_text");
  }
  const serialized = JSON.stringify(task);
  if (byteLength(serialized) > config.maxRequestBytes) {
    errors.push("task_payload_too_large");
  }
  if (task.taskPacket.taskPacketJson === "{}") {
    errors.push("task_packet_blocked");
  }
  return { errors, valid: errors.length === 0 };
}

function fallbackResult(
  config: AnalysisAgentBridgeConfig,
  reason: string,
  errorCode: AnalysisAgentErrorCode,
): AnalysisAgentSendResult {
  return {
    agentId: config.agentId,
    agentName: config.agentName,
    automaticAvailable: false,
    checkedAt: nowIso(),
    errorCode,
    fallbackRequired: true,
    mode: config.mode,
    reason,
    status:
      config.mode === "disabled"
        ? "disabled"
        : errorCode === "request_timeout"
          ? "timeout"
          : "fallback_required",
    warnings: [],
  };
}

function normalizeString(value: unknown, max = 600): string {
  if (typeof value !== "string") {
    return "";
  }
  const cleaned = value.replace(FULL_WALLET_PATTERN, "[wallet redacted]").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, max);
}

function normalizeStringList(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => normalizeString(item, 600))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeAnalysisResponse(
  value: unknown,
  config: AnalysisAgentBridgeConfig,
): AnalysisAgentResponse | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Partial<AnalysisAgentResponse>;
  const status = record.status;
  if (
    status !== "completed" &&
    status !== "partial" &&
    status !== "insufficient_data" &&
    status !== "failed_safe" &&
    status !== "unavailable"
  ) {
    return undefined;
  }
  const suggestedDecision = record.suggestedDecision;
  return {
    agentId: normalizeString(record.agentId, 80) || config.agentId,
    agentName: normalizeString(record.agentName, 80) || config.agentName,
    checkedAt: normalizeString(record.checkedAt, 80) || nowIso(),
    keySignals: Array.isArray(record.keySignals)
      ? record.keySignals
          .map((signal) => {
            if (!signal || typeof signal !== "object") return null;
            const candidate = signal as AnalysisAgentResponse["keySignals"][number];
            const direction =
              candidate.direction === "YES" ||
              candidate.direction === "NO" ||
              candidate.direction === "neutral" ||
              candidate.direction === "unknown"
                ? candidate.direction
                : "unknown";
            const confidence =
              candidate.confidence === "high" ||
              candidate.confidence === "medium" ||
              candidate.confidence === "low"
                ? candidate.confidence
                : "low";
            return {
              confidence,
              direction,
              isReal: candidate.isReal === true,
              label: normalizeString(candidate.label, 120) || "Senal",
              source: normalizeString(candidate.source, 120) || config.agentName,
            };
          })
          .filter((signal): signal is AnalysisAgentResponse["keySignals"][number] => Boolean(signal))
          .slice(0, 8)
      : [],
    limitations: normalizeStringList(record.limitations, 8),
    risks: normalizeStringList(record.risks, 8),
    sourcesUsed: normalizeStringList(record.sourcesUsed, 8),
    status,
    suggestedDecision: {
      available: suggestedDecision?.available === true,
      confidence:
        suggestedDecision?.confidence === "high" ||
        suggestedDecision?.confidence === "medium" ||
        suggestedDecision?.confidence === "low"
          ? suggestedDecision.confidence
          : null,
      probability:
        typeof suggestedDecision?.probability === "number" &&
        Number.isFinite(suggestedDecision.probability) &&
        suggestedDecision.probability >= 0 &&
        suggestedDecision.probability <= 1
          ? suggestedDecision.probability
          : null,
      reason: normalizeString(suggestedDecision?.reason, 400) || "Sin decision sugerida por el agente.",
      side: suggestedDecision?.side === "YES" || suggestedDecision?.side === "NO" ? suggestedDecision.side : null,
    },
    summary: normalizeString(record.summary, 600) || "El agente no devolvio un resumen utilizable.",
  };
}

function parseAgentResponse(value: unknown, config: AnalysisAgentBridgeConfig): AnalysisAgentRawResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const analysis = normalizeAnalysisResponse(record.analysis ?? record, config);
  return {
    accepted: typeof record.accepted === "boolean" ? record.accepted : undefined,
    analysis,
    message:
      typeof record.message === "string"
        ? record.message.slice(0, 280)
        : typeof record.summary === "string"
          ? record.summary.slice(0, 280)
          : analysis?.summary,
    report:
      record.report && typeof record.report === "object"
        ? (record.report as AnalysisAgentRawResponse["report"])
        : record.researchReport && typeof record.researchReport === "object"
          ? (record.researchReport as AnalysisAgentRawResponse["report"])
          : record.version === "1.0"
            ? (record as AnalysisAgentRawResponse["report"])
            : undefined,
    status:
      record.status === "accepted" ||
      record.status === "pending" ||
      record.status === "processing" ||
      record.status === "queued" ||
      record.status === "researching" ||
      record.status === "completed" ||
      record.status === "partial" ||
      record.status === "insufficient_data" ||
      record.status === "manual_needed" ||
      record.status === "failed_safe" ||
      record.status === "failed" ||
      record.status === "unavailable"
        ? record.status
        : analysis?.status,
    taskId: typeof record.taskId === "string" ? record.taskId.slice(0, 120) : undefined,
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter((item): item is string => typeof item === "string").slice(0, 6)
      : undefined,
  };
}

export function buildAnalysisAgentMarketPayload(task: AnalysisAgentTask): AnalysisAgentRequest {
  const market = task.brief.market;
  const marketProbability = task.brief.knownSignals.marketProbability;
  return {
    category: market.category ?? market.sport ?? null,
    eventSlug: market.eventSlug ?? null,
    liquidity: market.liquidity ?? null,
    marketId: market.conditionId ?? null,
    marketProbability:
      typeof marketProbability?.yes === "number"
        ? marketProbability.yes
        : null,
    marketSlug: market.marketSlug ?? null,
    polymarketUrl: task.normalizedUrl || market.normalizedUrl || market.url,
    prices: {
      outcomes: market.outcomes.map((outcome) => ({
        label: outcome.label,
        price: outcome.price,
        side: outcome.side,
        tokenId: outcome.tokenId,
      })),
    },
    question: market.title,
    source: "polysignal",
    sportsContext: task.brief.knownSignals.sportsContext
      ? {
          eventDate: task.brief.knownSignals.sportsContext.eventDate ?? null,
          independentStatus: task.brief.knownSignals.sportsContext.independentStatus ?? null,
          injuries: task.brief.knownSignals.sportsContext.injuries ?? null,
          isHomeAwayReliable: task.brief.knownSignals.sportsContext.isHomeAwayReliable ?? false,
          league: task.brief.knownSignals.sportsContext.league ?? null,
          limitations: task.brief.knownSignals.sportsContext.limitations ?? [],
          marketCloseTime: task.brief.knownSignals.sportsContext.marketCloseTime ?? null,
          participants: task.brief.knownSignals.sportsContext.participants ?? [],
          recentForm: task.brief.knownSignals.sportsContext.recentForm ?? null,
          scheduleContext: task.brief.knownSignals.sportsContext.scheduleContext ?? null,
          sport: task.brief.knownSignals.sportsContext.sport ?? null,
          warnings: task.brief.knownSignals.sportsContext.warnings ?? [],
        }
      : null,
    title: market.title,
    volume: market.volume ?? null,
    walletIntelligence: task.brief.knownSignals.walletIntelligence ?? null,
  };
}

function endpointForTaskStatus(endpoint: URL, taskId: string): URL {
  const base = endpoint.toString().replace(/\/+$/, "");
  return new URL(`${base}/${encodeURIComponent(taskId)}`);
}

function headersForAgent(config: AnalysisAgentBridgeConfig): Record<string, string> {
  const runtime = getAnalysisAgentRuntimeConfig();
  const headers: Record<string, string> = {
    accept: "application/json",
  };
  if (runtime.token && config.provider.authMode === "bearer") {
    headers.authorization = `Bearer ${runtime.token}`;
  } else if (runtime.token && config.provider.authMode === "header-token") {
    headers["x-analysis-agent-token"] = runtime.token;
  }
  return headers;
}

export async function sendAnalysisAgentResearchTask(task: AnalysisAgentTask): Promise<AnalysisAgentSendResult> {
  const config = getAnalysisAgentBridgeConfig();
  if (config.mode !== "automatic") {
    const errorCode = config.mode === "disabled" ? "bridge_disabled" : "invalid_bridge_config";
    return fallbackResult(config, config.reason, errorCode);
  }

  const validation = validateAnalysisAgentTask(task, config);
  if (!validation.valid) {
    return {
      agentId: config.agentId,
      agentName: config.agentName,
      automaticAvailable: true,
      checkedAt: nowIso(),
      errorCode: validation.errors.includes("task_payload_too_large") ? "payload_too_large" : "invalid_request",
      fallbackRequired: true,
      mode: config.mode,
      reason: `${config.agentName} task packet did not pass bridge validation.`,
      status: "error",
      validationErrors: validation.errors,
      warnings: [],
    };
  }

  const endpoint = config.provider.endpointUrl ?? "";
  const safeEndpoint = analysisAgentEndpointIsSafe(endpoint, config.allowLocalhost, config.agentName);
  if (!safeEndpoint.safe || !safeEndpoint.url) {
    return fallbackResult(config, safeEndpoint.reason || "Analysis agent endpoint is not safe.", "invalid_bridge_config");
  }

  const requestBody = JSON.stringify(buildAnalysisAgentMarketPayload(task));
  if (byteLength(requestBody) > config.maxRequestBytes) {
    return fallbackResult(config, "Analysis agent request is too large.", "payload_too_large");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(safeEndpoint.url.toString(), {
      body: requestBody,
      cache: "no-store",
      credentials: "omit",
      headers: {
        ...headersForAgent(config),
        "content-type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal: controller.signal,
    });
    const text = await response.text();
    if (byteLength(text) > config.maxResponseBytes) {
      return fallbackResult(config, "Analysis agent response exceeded the safe size limit.", "invalid_response");
    }
    if (!response.ok) {
      return fallbackResult(config, "Analysis agent did not accept the task.", "request_failed");
    }
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      return fallbackResult(config, "Analysis agent returned invalid JSON.", "invalid_response");
    }
    if (containsUnsafeText(parsed)) {
      return fallbackResult(config, "Analysis agent response contained unsafe text.", "invalid_response");
    }
    const agentResponse = parseAgentResponse(parsed, config);
    if (agentResponse.report) {
      const reportResult = parseSamanthaResearchReport(agentResponse.report);
      if (!reportResult.valid || !reportResult.report) {
        return {
          agentId: config.agentId,
          agentName: config.agentName,
          automaticAvailable: true,
          checkedAt: nowIso(),
          errorCode: "report_invalid",
          fallbackRequired: true,
          mode: config.mode,
          reason: `${config.agentName} returned a report, but it failed PolySignal validation.`,
          status: "report_invalid",
          validationErrors: reportResult.errors,
          warnings: reportResult.warnings,
        };
      }
      return {
        agentId: config.agentId,
        agentName: config.agentName,
        automaticAvailable: true,
        checkedAt: nowIso(),
        fallbackRequired: false,
        mode: config.mode,
        reason: `${config.agentName} returned a validated research report.`,
        report: reportResult.report,
        status: "report_received",
        taskId: agentResponse.taskId,
        warnings: reportResult.warnings,
      };
    }
    if (agentResponse.analysis) {
      const terminalStatus = agentResponse.analysis.status;
      const insufficient =
        terminalStatus === "failed_safe" ||
        terminalStatus === "insufficient_data" ||
        terminalStatus === "unavailable";
      return {
        agentId: agentResponse.analysis.agentId || config.agentId,
        agentName: agentResponse.analysis.agentName || config.agentName,
        analysis: agentResponse.analysis,
        automaticAvailable: true,
        checkedAt: nowIso(),
        fallbackRequired: insufficient,
        mode: config.mode,
        reason: agentResponse.analysis.summary || agentResponse.message || `${config.agentName} returned an automatic reading.`,
        status: terminalStatus,
        taskId: agentResponse.taskId,
        warnings: agentResponse.warnings ?? [],
      };
    }
    if (agentResponse.status === "insufficient_data") {
      return {
        agentId: config.agentId,
        agentName: config.agentName,
        automaticAvailable: true,
        checkedAt: nowIso(),
        fallbackRequired: true,
        mode: config.mode,
        reason: agentResponse.message || `${config.agentName} did not find enough automatic signals.`,
        status: "insufficient_data",
        taskId: agentResponse.taskId,
        warnings: agentResponse.warnings ?? [],
      };
    }
    return {
      agentId: config.agentId,
      agentName: config.agentName,
      automaticAvailable: true,
      checkedAt: nowIso(),
      fallbackRequired: false,
      mode: config.mode,
      reason: agentResponse.message || `${config.agentName} accepted the research task.`,
      status: "agent_researching",
      taskId: agentResponse.taskId,
      warnings: agentResponse.warnings ?? [],
    };
  } catch (error) {
    const timedOut = typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
    return fallbackResult(
      config,
      timedOut
        ? "Analysis agent request timed out."
        : "Analysis agent request failed safely.",
      timedOut ? "request_timeout" : "request_failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupAnalysisAgentResearchTask(taskId: string): Promise<AnalysisAgentLookupResult> {
  const config = getAnalysisAgentBridgeConfig();
  if (config.mode !== "automatic") {
    const errorCode = config.mode === "disabled" ? "bridge_disabled" : "invalid_bridge_config";
    return fallbackResult(config, config.reason, errorCode);
  }
  if (!TASK_ID_PATTERN.test(taskId)) {
    return {
      agentId: config.agentId,
      agentName: config.agentName,
      automaticAvailable: true,
      checkedAt: nowIso(),
      errorCode: "invalid_request",
      fallbackRequired: true,
      mode: config.mode,
      reason: "Analysis agent task id did not pass validation.",
      status: "error",
      warnings: [],
    };
  }

  const endpoint = config.provider.endpointUrl ?? "";
  const safeEndpoint = analysisAgentEndpointIsSafe(endpoint, config.allowLocalhost, config.agentName);
  if (!safeEndpoint.safe || !safeEndpoint.url) {
    return fallbackResult(config, safeEndpoint.reason || "Analysis agent endpoint is not safe.", "invalid_bridge_config");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(endpointForTaskStatus(safeEndpoint.url, taskId).toString(), {
      cache: "no-store",
      credentials: "omit",
      headers: headersForAgent(config),
      method: "GET",
      redirect: "error",
      signal: controller.signal,
    });
    const text = await response.text();
    if (byteLength(text) > config.maxResponseBytes) {
      return fallbackResult(config, "Analysis agent response exceeded the safe size limit.", "invalid_response");
    }
    if (!response.ok) {
      return fallbackResult(config, "Analysis agent did not return a safe task status.", "request_failed");
    }
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      return fallbackResult(config, "Analysis agent returned invalid JSON.", "invalid_response");
    }
    if (containsUnsafeText(parsed)) {
      return fallbackResult(config, "Analysis agent response contained unsafe text.", "invalid_response");
    }
    const agentResponse = parseAgentResponse(parsed, config);
    if (agentResponse.status === "manual_needed" || agentResponse.status === "insufficient_data") {
      return {
        agentId: config.agentId,
        agentName: config.agentName,
        automaticAvailable: true,
        bridgeTaskStatus: "manual_needed",
        checkedAt: nowIso(),
        fallbackRequired: true,
        mode: config.mode,
        reason:
          agentResponse.status === "insufficient_data"
            ? agentResponse.message || `${config.agentName} did not find enough automatic signals.`
            : agentResponse.message || `${config.agentName} marked this task as requiring more automatic source coverage.`,
        status: "manual_needed",
        taskId: agentResponse.taskId || taskId,
        warnings: agentResponse.warnings ?? [],
      };
    }
    if (agentResponse.status === "failed_safe" || agentResponse.status === "failed") {
      return {
        agentId: config.agentId,
        agentName: config.agentName,
        automaticAvailable: true,
        bridgeTaskStatus: "failed_safe",
        checkedAt: nowIso(),
        errorCode: "request_failed",
        fallbackRequired: true,
        mode: config.mode,
        reason: agentResponse.message || `${config.agentName} could not complete the task safely.`,
        status: "error",
        taskId: agentResponse.taskId || taskId,
        warnings: agentResponse.warnings ?? [],
      };
    }
    if (agentResponse.report) {
      const reportResult = parseSamanthaResearchReport(agentResponse.report);
      if (!reportResult.valid || !reportResult.report) {
        return {
          agentId: config.agentId,
          agentName: config.agentName,
          automaticAvailable: true,
          bridgeTaskStatus: "completed",
          checkedAt: nowIso(),
          errorCode: "report_invalid",
          fallbackRequired: true,
          mode: config.mode,
          reason: `${config.agentName} returned a report, but it failed PolySignal validation.`,
          status: "report_invalid",
          taskId: agentResponse.taskId || taskId,
          validationErrors: reportResult.errors,
          warnings: reportResult.warnings,
        };
      }
      return {
        agentId: config.agentId,
        agentName: config.agentName,
        bridgeTaskStatus: "completed",
        automaticAvailable: true,
        checkedAt: nowIso(),
        fallbackRequired: false,
        mode: config.mode,
        reason: `${config.agentName} returned a validated research report.`,
        report: reportResult.report,
        status: "report_received",
        taskId: agentResponse.taskId || taskId,
        warnings: reportResult.warnings,
      };
    }
    if (agentResponse.analysis) {
      const terminalStatus = agentResponse.analysis.status;
      const insufficient =
        terminalStatus === "failed_safe" ||
        terminalStatus === "insufficient_data" ||
        terminalStatus === "unavailable";
      return {
        agentId: agentResponse.analysis.agentId || config.agentId,
        agentName: agentResponse.analysis.agentName || config.agentName,
        analysis: agentResponse.analysis,
        automaticAvailable: true,
        bridgeTaskStatus: insufficient ? "manual_needed" : "completed",
        checkedAt: nowIso(),
        fallbackRequired: insufficient,
        mode: config.mode,
        reason: agentResponse.analysis.summary || agentResponse.message || `${config.agentName} returned an automatic reading.`,
        status: terminalStatus,
        taskId: agentResponse.taskId || taskId,
        warnings: agentResponse.warnings ?? [],
      };
    }
    return {
      agentId: config.agentId,
      agentName: config.agentName,
      automaticAvailable: true,
      bridgeTaskStatus: agentResponse.status === "processing" ? "processing" : "pending",
      checkedAt: nowIso(),
      fallbackRequired: false,
      mode: config.mode,
      reason: agentResponse.message || `${config.agentName} research is still pending.`,
      status: "agent_researching",
      taskId: agentResponse.taskId || taskId,
      warnings: agentResponse.warnings ?? [],
    };
  } catch (error) {
    const timedOut = typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
    return fallbackResult(
      config,
      timedOut
        ? "Analysis agent status request timed out."
        : "Analysis agent status request failed safely.",
      timedOut ? "request_timeout" : "request_failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}
