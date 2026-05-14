import { NextResponse } from "next/server";

import { analysisAgentEndpointIsSafe } from "../../../lib/analysisAgentBridge";
import { getAnalysisAgentRuntimeConfig } from "../../../lib/analysisAgentRegistry";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

const HEALTH_TIMEOUT_MS = 5000;

type HealthResult = {
  checkedAt: string;
  httpStatus: number | null;
  message: string;
  status: "error" | "ok" | "skipped";
};

function jsonResponse(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, {
    headers: SECURITY_HEADERS,
    status,
  });
}

async function checkHealth(url: URL): Promise<HealthResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    return {
      checkedAt: new Date().toISOString(),
      httpStatus: response.status,
      message: response.ok ? "Health check OK." : "Health check did not return OK.",
      status: response.ok ? "ok" : "error",
    };
  } catch {
    return {
      checkedAt: new Date().toISOString(),
      httpStatus: null,
      message: "Health check failed or timed out.",
      status: "error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const config = getAnalysisAgentRuntimeConfig();
  const endpointConfigured = Boolean(config.endpointUrl);
  const safeEndpoint: { reason?: string; safe: boolean; url?: URL } = endpointConfigured
    ? analysisAgentEndpointIsSafe(config.endpointUrl, config.allowLocalhost, config.displayName)
    : { safe: false };
  const endpointHost = safeEndpoint.safe && safeEndpoint.url ? safeEndpoint.url.host : null;

  let health: HealthResult = {
    checkedAt: new Date().toISOString(),
    httpStatus: null,
    message: "Health check skipped.",
    status: "skipped",
  };
  let expectedState: "Connected" | "Disabled" | "Misconfigured" | "Unavailable" = "Disabled";
  let message = "Agente deshabilitado, se usara lectura parcial.";

  if (!config.enabled) {
    expectedState = "Disabled";
  } else if (!endpointConfigured || !safeEndpoint.safe || !safeEndpoint.url) {
    expectedState = "Misconfigured";
    message = "Agente configurado de forma incompleta; se usara lectura parcial.";
    health = {
      checkedAt: new Date().toISOString(),
      httpStatus: null,
      message: safeEndpoint.reason || "Endpoint no configurado.",
      status: "error",
    };
  } else {
    const healthUrl = new URL("/health", safeEndpoint.url.origin);
    health = await checkHealth(healthUrl);
    expectedState = health.status === "ok" ? "Connected" : "Unavailable";
    message =
      health.status === "ok"
        ? `${config.displayName} Bridge conectado`
        : "Agente no disponible, se usara lectura parcial.";
  }

  return jsonResponse({
    agentId: config.provider.id,
    agentName: config.displayName,
    bridgeEnabled: config.enabled,
    endpointConfigured,
    endpointHost,
    expectedState,
    health,
    message,
    providerDescription: config.provider.description,
    usesGenericEnv: config.usesGenericEnv,
  });
}

export function POST(): NextResponse {
  return jsonResponse({ error: "method_not_allowed" }, 405);
}

export function PUT(): NextResponse {
  return jsonResponse({ error: "method_not_allowed" }, 405);
}

export function DELETE(): NextResponse {
  return jsonResponse({ error: "method_not_allowed" }, 405);
}
