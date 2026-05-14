import type { AnalysisAgentProvider } from "./analysisAgentTypes";

const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_MAX_REQUEST_BYTES = 90000;
const DEFAULT_MAX_RESPONSE_BYTES = 120000;
const DEFAULT_PROVIDER_ID = "samantha";

type ProviderInput = {
  allowLocalhost: boolean;
  enabled: boolean;
  endpointUrl: string;
  maxRequestBytes: number;
  maxResponseBytes: number;
  providerId: string;
  timeoutMs: number;
};

export type AnalysisAgentRuntimeConfig = ProviderInput & {
  displayName: string;
  provider: AnalysisAgentProvider;
  token: string;
  usesGenericEnv: boolean;
};

function boolFromEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function envValue(name: string): string {
  return process.env[name]?.trim() || "";
}

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
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

function providerDisplayName(providerId: string, explicitName: string): string {
  if (explicitName) {
    return explicitName.slice(0, 80);
  }
  if (providerId === "jarvis") {
    return "Jarvis";
  }
  if (providerId === "custom") {
    return "Agente analizador";
  }
  return "Samantha";
}

function providerDescription(providerId: string, displayName: string): string {
  if (providerId === "jarvis") {
    return "Proveedor compatible documentado para un futuro agente Jarvis.";
  }
  if (providerId === "custom") {
    return `${displayName} compatible con el contrato Analysis Agent Bridge.`;
  }
  return "Samantha Bridge compatible con /polysignal/analyze-market.";
}

export function getAnalysisAgentRuntimeConfig(): AnalysisAgentRuntimeConfig {
  const usesGenericEnv =
    hasEnv("ANALYSIS_AGENT_PROVIDER") ||
    hasEnv("ANALYSIS_AGENT_ENABLED") ||
    hasEnv("ANALYSIS_AGENT_URL") ||
    hasEnv("ANALYSIS_AGENT_TOKEN") ||
    hasEnv("ANALYSIS_AGENT_DISPLAY_NAME") ||
    hasEnv("ANALYSIS_AGENT_ALLOW_LOCALHOST");

  const providerId = (usesGenericEnv ? envValue("ANALYSIS_AGENT_PROVIDER") : "") || DEFAULT_PROVIDER_ID;
  const displayName = providerDisplayName(
    providerId,
    usesGenericEnv ? envValue("ANALYSIS_AGENT_DISPLAY_NAME") : "",
  );
  const endpointUrl = usesGenericEnv ? envValue("ANALYSIS_AGENT_URL") : envValue("SAMANTHA_BRIDGE_URL");
  const enabled = usesGenericEnv ? boolFromEnv("ANALYSIS_AGENT_ENABLED") : boolFromEnv("SAMANTHA_BRIDGE_ENABLED");
  const allowLocalhost = usesGenericEnv
    ? boolFromEnv("ANALYSIS_AGENT_ALLOW_LOCALHOST")
    : boolFromEnv("SAMANTHA_BRIDGE_ALLOW_LOCALHOST");
  const timeoutMs = usesGenericEnv
    ? boundedIntFromEnv("ANALYSIS_AGENT_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 3000, 60000)
    : boundedIntFromEnv("SAMANTHA_BRIDGE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 3000, 60000);
  const maxRequestBytes = usesGenericEnv
    ? boundedIntFromEnv("ANALYSIS_AGENT_MAX_REQUEST_BYTES", DEFAULT_MAX_REQUEST_BYTES, 10000, 250000)
    : boundedIntFromEnv("SAMANTHA_BRIDGE_MAX_REQUEST_BYTES", DEFAULT_MAX_REQUEST_BYTES, 10000, 250000);
  const maxResponseBytes = usesGenericEnv
    ? boundedIntFromEnv("ANALYSIS_AGENT_MAX_RESPONSE_BYTES", DEFAULT_MAX_RESPONSE_BYTES, 10000, 250000)
    : boundedIntFromEnv("SAMANTHA_BRIDGE_MAX_RESPONSE_BYTES", DEFAULT_MAX_RESPONSE_BYTES, 10000, 250000);
  const token = usesGenericEnv ? envValue("ANALYSIS_AGENT_TOKEN") : envValue("SAMANTHA_BRIDGE_TOKEN");

  return {
    allowLocalhost,
    displayName,
    enabled,
    endpointUrl,
    maxRequestBytes,
    maxResponseBytes,
    provider: {
      authMode: token ? "bearer" : "none",
      description: providerDescription(providerId, displayName),
      displayName,
      enabled,
      endpointConfigured: Boolean(endpointUrl),
      endpointUrl: endpointUrl || null,
      id: providerId,
      timeoutMs,
    },
    providerId,
    timeoutMs,
    token,
    usesGenericEnv,
  };
}

export function getPublicAnalysisAgentConfig() {
  const config = getAnalysisAgentRuntimeConfig();
  return {
    agentId: config.provider.id,
    agentName: config.provider.displayName,
    automaticAvailable: config.enabled && Boolean(config.endpointUrl),
    enabled: config.enabled,
    endpointConfigured: Boolean(config.endpointUrl),
    provider: {
      description: config.provider.description,
      displayName: config.provider.displayName,
      id: config.provider.id,
    },
    usesGenericEnv: config.usesGenericEnv,
  };
}
