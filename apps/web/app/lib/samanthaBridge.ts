import {
  parseSamanthaResearchReport,
} from "./samanthaResearchReport";
import type {
  SamanthaBridgeConfig,
  SamanthaBridgeErrorCode,
  SamanthaBridgeLookupResult,
  SamanthaBridgeMode,
  SamanthaBridgeSendResult,
  SamanthaBridgeTask,
  SamanthaResearchResponse,
} from "./samanthaBridgeTypes";

const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_MAX_REQUEST_BYTES = 90000;
const DEFAULT_MAX_RESPONSE_BYTES = 120000;
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
const FULL_WALLET_PATTERN = /0x[a-fA-F0-9]{40}/;
const TASK_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,160}$/;

function nowIso(): string {
  return new Date().toISOString();
}

function boolFromEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function boundedIntFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function isPrivateIpv4(hostname: string): boolean {
  return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(hostname));
}

function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

function allowedPorts(): Set<string> {
  const raw = process.env.SAMANTHA_BRIDGE_ALLOWED_PORTS?.trim();
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

function endpointIsSafe(rawUrl: string, allowLocalhost: boolean): { reason?: string; safe: boolean; url?: URL } {
  if (!rawUrl || rawUrl.length > MAX_ENDPOINT_LENGTH) {
    return { reason: "Samantha bridge endpoint is missing or too long.", safe: false };
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { reason: "Samantha bridge endpoint is not a valid URL.", safe: false };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { reason: "Samantha bridge endpoint must use http or https.", safe: false };
  }
  if (parsed.username || parsed.password) {
    return { reason: "Samantha bridge endpoint must not include credentials.", safe: false };
  }
  if (parsed.hash) {
    return { reason: "Samantha bridge endpoint must not include fragments.", safe: false };
  }
  const hostname = parsed.hostname.toLowerCase();
  const local = isLocalHost(hostname);
  if (local && !allowLocalhost) {
    return { reason: "Localhost bridge endpoint requires explicit allow-localhost config.", safe: false };
  }
  if (!local && isPrivateIpv4(hostname)) {
    return { reason: "Private network bridge endpoints are blocked.", safe: false };
  }
  if (parsed.protocol !== "https:" && !local) {
    return { reason: "Non-local Samantha bridge endpoints must use https.", safe: false };
  }
  if (!allowedPorts().has(parsed.port || (parsed.protocol === "https:" ? "443" : "80"))) {
    return { reason: "Samantha bridge endpoint port is not allowlisted.", safe: false };
  }
  return { safe: true, url: parsed };
}

function containsUnsafeText(value: unknown): boolean {
  const serialized = JSON.stringify(value ?? "");
  const lower = serialized.toLowerCase();
  return FULL_WALLET_PATTERN.test(serialized) || SECRET_MARKERS.some((marker) => lower.includes(marker));
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function configResult(
  mode: SamanthaBridgeMode,
  reason: string,
  input: { allowLocalhost: boolean; endpointConfigured: boolean; maxRequestBytes: number; maxResponseBytes: number; timeoutMs: number },
): SamanthaBridgeConfig {
  return {
    allowLocalhost: input.allowLocalhost,
    automaticAvailable: mode === "automatic",
    endpointConfigured: input.endpointConfigured,
    maxRequestBytes: input.maxRequestBytes,
    maxResponseBytes: input.maxResponseBytes,
    mode,
    reason,
    timeoutMs: input.timeoutMs,
  };
}

export function getSamanthaBridgeConfig(): SamanthaBridgeConfig {
  const allowLocalhost = boolFromEnv("SAMANTHA_BRIDGE_ALLOW_LOCALHOST");
  const enabled = boolFromEnv("SAMANTHA_BRIDGE_ENABLED");
  const endpoint = process.env.SAMANTHA_BRIDGE_URL?.trim() || "";
  const timeoutMs = boundedIntFromEnv("SAMANTHA_BRIDGE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 3000, 60000);
  const maxRequestBytes = boundedIntFromEnv(
    "SAMANTHA_BRIDGE_MAX_REQUEST_BYTES",
    DEFAULT_MAX_REQUEST_BYTES,
    10000,
    250000,
  );
  const maxResponseBytes = boundedIntFromEnv(
    "SAMANTHA_BRIDGE_MAX_RESPONSE_BYTES",
    DEFAULT_MAX_RESPONSE_BYTES,
    10000,
    250000,
  );
  const base = {
    allowLocalhost,
    endpointConfigured: Boolean(endpoint),
    maxRequestBytes,
    maxResponseBytes,
    timeoutMs,
  };
  if (!enabled) {
    return configResult("disabled", "Samantha automatic bridge is disabled; manual task packet is available.", base);
  }
  const safeEndpoint = endpointIsSafe(endpoint, allowLocalhost);
  if (!safeEndpoint.safe) {
    return configResult("manual_fallback", safeEndpoint.reason || "Samantha bridge endpoint is not safe.", base);
  }
  return configResult("automatic", "Samantha automatic bridge is configured.", base);
}

export function validateSamanthaBridgeTask(
  task: SamanthaBridgeTask,
  config = getSamanthaBridgeConfig(),
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
  config: SamanthaBridgeConfig,
  reason: string,
  errorCode: SamanthaBridgeErrorCode,
): SamanthaBridgeSendResult {
  return {
    automaticAvailable: false,
    checkedAt: nowIso(),
    errorCode,
    fallbackRequired: true,
    mode: config.mode,
    reason,
    status: config.mode === "disabled" ? "disabled" : "fallback_required",
    warnings: [],
  };
}

function parseBridgeResponse(value: unknown): SamanthaResearchResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    accepted: typeof record.accepted === "boolean" ? record.accepted : undefined,
    message: typeof record.message === "string" ? record.message.slice(0, 280) : undefined,
    report:
      record.report && typeof record.report === "object"
        ? (record.report as SamanthaResearchResponse["report"])
        : record.researchReport && typeof record.researchReport === "object"
          ? (record.researchReport as SamanthaResearchResponse["report"])
          : record.version === "1.0"
            ? (record as SamanthaResearchResponse["report"])
            : undefined,
    status:
      record.status === "accepted" ||
      record.status === "pending" ||
      record.status === "processing" ||
      record.status === "queued" ||
      record.status === "researching" ||
      record.status === "completed" ||
      record.status === "partial" ||
      record.status === "manual_needed" ||
      record.status === "failed_safe" ||
      record.status === "failed"
        ? record.status
        : undefined,
    taskId: typeof record.taskId === "string" ? record.taskId.slice(0, 120) : undefined,
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter((item): item is string => typeof item === "string").slice(0, 6)
      : undefined,
  };
}

function endpointForTaskStatus(endpoint: URL, taskId: string): URL {
  const base = endpoint.toString().replace(/\/+$/, "");
  return new URL(`${base}/${encodeURIComponent(taskId)}`);
}

export async function sendSamanthaResearchTask(task: SamanthaBridgeTask): Promise<SamanthaBridgeSendResult> {
  const config = getSamanthaBridgeConfig();
  if (config.mode !== "automatic") {
    const errorCode = config.mode === "disabled" ? "bridge_disabled" : "invalid_bridge_config";
    return fallbackResult(config, config.reason, errorCode);
  }

  const validation = validateSamanthaBridgeTask(task, config);
  if (!validation.valid) {
    return {
      automaticAvailable: true,
      checkedAt: nowIso(),
      errorCode: validation.errors.includes("task_payload_too_large") ? "payload_too_large" : "invalid_request",
      fallbackRequired: true,
      mode: config.mode,
      reason: "Samantha task packet did not pass bridge validation.",
      status: "error",
      validationErrors: validation.errors,
      warnings: [],
    };
  }

  const endpoint = process.env.SAMANTHA_BRIDGE_URL?.trim() || "";
  const safeEndpoint = endpointIsSafe(endpoint, config.allowLocalhost);
  if (!safeEndpoint.safe || !safeEndpoint.url) {
    return fallbackResult(config, safeEndpoint.reason || "Samantha bridge endpoint is not safe.", "invalid_bridge_config");
  }

  const requestBody = JSON.stringify({
    requestType: "polysignal_deep_market_research",
    task,
    version: "1.0",
  });
  if (byteLength(requestBody) > config.maxRequestBytes) {
    return fallbackResult(config, "Samantha bridge request is too large.", "payload_too_large");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
    };
    const token = process.env.SAMANTHA_BRIDGE_TOKEN?.trim();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    const response = await fetch(safeEndpoint.url.toString(), {
      body: requestBody,
      cache: "no-store",
      credentials: "omit",
      headers,
      method: "POST",
      redirect: "error",
      signal: controller.signal,
    });
    const text = await response.text();
    if (byteLength(text) > config.maxResponseBytes) {
      return fallbackResult(config, "Samantha bridge response exceeded the safe size limit.", "invalid_response");
    }
    if (!response.ok) {
      return fallbackResult(config, "Samantha bridge did not accept the task.", "request_failed");
    }
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      return fallbackResult(config, "Samantha bridge returned invalid JSON.", "invalid_response");
    }
    if (containsUnsafeText(parsed)) {
      return fallbackResult(config, "Samantha bridge response contained unsafe text.", "invalid_response");
    }
    const bridgeResponse = parseBridgeResponse(parsed);
    if (bridgeResponse.report) {
      const reportResult = parseSamanthaResearchReport(bridgeResponse.report);
      if (!reportResult.valid || !reportResult.report) {
        return {
          automaticAvailable: true,
          checkedAt: nowIso(),
          errorCode: "report_invalid",
          fallbackRequired: true,
          mode: config.mode,
          reason: "Samantha returned a report, but it failed PolySignal validation.",
          status: "report_invalid",
          validationErrors: reportResult.errors,
          warnings: reportResult.warnings,
        };
      }
      return {
        automaticAvailable: true,
        checkedAt: nowIso(),
        fallbackRequired: false,
        mode: config.mode,
        reason: "Samantha returned a validated research report.",
        report: reportResult.report,
        status: "report_received",
        taskId: bridgeResponse.taskId,
        warnings: reportResult.warnings,
      };
    }
    return {
      automaticAvailable: true,
      checkedAt: nowIso(),
      fallbackRequired: false,
      mode: config.mode,
      reason: bridgeResponse.message || "Samantha accepted the research task.",
      status: "samantha_researching",
      taskId: bridgeResponse.taskId,
      warnings: bridgeResponse.warnings ?? [],
    };
  } catch (error) {
    const timedOut = typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
    return fallbackResult(
      config,
      timedOut
        ? "Samantha bridge request timed out."
        : "Samantha bridge request failed safely.",
      timedOut ? "request_timeout" : "request_failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupSamanthaResearchTask(taskId: string): Promise<SamanthaBridgeLookupResult> {
  const config = getSamanthaBridgeConfig();
  if (config.mode !== "automatic") {
    const errorCode = config.mode === "disabled" ? "bridge_disabled" : "invalid_bridge_config";
    return fallbackResult(config, config.reason, errorCode);
  }
  if (!TASK_ID_PATTERN.test(taskId)) {
    return {
      automaticAvailable: true,
      checkedAt: nowIso(),
      errorCode: "invalid_request",
      fallbackRequired: true,
      mode: config.mode,
      reason: "Samantha task id did not pass validation.",
      status: "error",
      warnings: [],
    };
  }

  const endpoint = process.env.SAMANTHA_BRIDGE_URL?.trim() || "";
  const safeEndpoint = endpointIsSafe(endpoint, config.allowLocalhost);
  if (!safeEndpoint.safe || !safeEndpoint.url) {
    return fallbackResult(config, safeEndpoint.reason || "Samantha bridge endpoint is not safe.", "invalid_bridge_config");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
    };
    const token = process.env.SAMANTHA_BRIDGE_TOKEN?.trim();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    const response = await fetch(endpointForTaskStatus(safeEndpoint.url, taskId).toString(), {
      cache: "no-store",
      credentials: "omit",
      headers,
      method: "GET",
      redirect: "error",
      signal: controller.signal,
    });
    const text = await response.text();
    if (byteLength(text) > config.maxResponseBytes) {
      return fallbackResult(config, "Samantha bridge response exceeded the safe size limit.", "invalid_response");
    }
    if (!response.ok) {
      return fallbackResult(config, "Samantha bridge did not return a safe task status.", "request_failed");
    }
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      return fallbackResult(config, "Samantha bridge returned invalid JSON.", "invalid_response");
    }
    if (containsUnsafeText(parsed)) {
      return fallbackResult(config, "Samantha bridge response contained unsafe text.", "invalid_response");
    }
    const bridgeResponse = parseBridgeResponse(parsed);
    if (bridgeResponse.status === "manual_needed") {
      return {
        automaticAvailable: true,
        bridgeTaskStatus: "manual_needed",
        checkedAt: nowIso(),
        fallbackRequired: true,
        mode: config.mode,
        reason: bridgeResponse.message || "Samantha marked this task as requiring manual research.",
        status: "manual_needed",
        taskId: bridgeResponse.taskId || taskId,
        warnings: bridgeResponse.warnings ?? [],
      };
    }
    if (bridgeResponse.status === "failed_safe" || bridgeResponse.status === "failed") {
      return {
        automaticAvailable: true,
        bridgeTaskStatus: "failed_safe",
        checkedAt: nowIso(),
        errorCode: "request_failed",
        fallbackRequired: true,
        mode: config.mode,
        reason: bridgeResponse.message || "Samantha could not complete the task safely.",
        status: "error",
        taskId: bridgeResponse.taskId || taskId,
        warnings: bridgeResponse.warnings ?? [],
      };
    }
    if (bridgeResponse.report) {
      const reportResult = parseSamanthaResearchReport(bridgeResponse.report);
      if (!reportResult.valid || !reportResult.report) {
        return {
          automaticAvailable: true,
          bridgeTaskStatus: "completed",
          checkedAt: nowIso(),
          errorCode: "report_invalid",
          fallbackRequired: true,
          mode: config.mode,
          reason: "Samantha returned a report, but it failed PolySignal validation.",
          status: "report_invalid",
          taskId: bridgeResponse.taskId || taskId,
          validationErrors: reportResult.errors,
          warnings: reportResult.warnings,
        };
      }
      return {
        automaticAvailable: true,
        bridgeTaskStatus: "completed",
        checkedAt: nowIso(),
        fallbackRequired: false,
        mode: config.mode,
        reason: "Samantha returned a validated research report.",
        report: reportResult.report,
        status: "report_received",
        taskId: bridgeResponse.taskId || taskId,
        warnings: reportResult.warnings,
      };
    }
    return {
      automaticAvailable: true,
      bridgeTaskStatus: bridgeResponse.status === "processing" ? "processing" : "pending",
      checkedAt: nowIso(),
      fallbackRequired: false,
      mode: config.mode,
      reason: bridgeResponse.message || "Samantha research is still pending.",
      status: "samantha_researching",
      taskId: bridgeResponse.taskId || taskId,
      warnings: bridgeResponse.warnings ?? [],
    };
  } catch (error) {
    const timedOut = typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
    return fallbackResult(
      config,
      timedOut
        ? "Samantha bridge status request timed out."
        : "Samantha bridge status request failed safely.",
      timedOut ? "request_timeout" : "request_failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}
