import { NextResponse } from "next/server";

import { normalizePolymarketUrl } from "../../lib/polymarketLink";
import { resolvePolymarketLink, type PolymarketLinkResolveResult } from "../../lib/polymarketLinkResolver";

const MAX_BODY_BYTES = 4096;

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};
const DEFAULT_BACKEND_BASE_URL = "https://polisygnal.onrender.com";

type WalletAnalysisResolvedLink = {
  source_url: string;
  normalized_url: string;
  status: "ok" | "partial" | "not_found" | "unsupported" | "error";
  raw_source: string;
  market_title?: string | null;
  condition_id?: string | null;
  market_slug?: string | null;
  event_slug?: string | null;
  sport_or_league?: string | null;
  outcomes?: Array<{
    label: string;
    side: string;
    token_id?: string | null;
  }>;
  token_ids?: string[];
  warnings?: string[];
};

function jsonResponse(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, {
    headers: SECURITY_HEADERS,
    status,
  });
}

function safeUrlFromBody(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const url = (value as Record<string, unknown>).url;
  if (typeof url !== "string" || !url.trim() || url.length > 2048) {
    return null;
  }
  return normalizePolymarketUrl(url) ? url.trim() : null;
}

function backendBaseUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_BACKEND_BASE_URL).replace(/\/$/, "");
  try {
    const parsed = new URL(configured);
    if ((parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password) {
      return configured;
    }
  } catch {
    // Fall back to the known production backend.
  }
  return DEFAULT_BACKEND_BASE_URL;
}

function mapResolvedLinkToLegacy(result: WalletAnalysisResolvedLink): PolymarketLinkResolveResult {
  const warnings = Array.isArray(result.warnings) ? result.warnings.filter((item): item is string => typeof item === "string") : [];
  const outcomes = Array.isArray(result.outcomes) ? result.outcomes : [];
  const eventSlug = result.event_slug || undefined;
  const marketSlug = result.market_slug || undefined;
  const marketTitle = result.market_title || undefined;
  const checkedAt = new Date().toISOString();
  const legacyStatus: PolymarketLinkResolveResult["status"] =
    result.status === "partial" ? "partial" : result.status;

  return {
    checkedAt,
    event: marketTitle || eventSlug
      ? {
          league: result.sport_or_league || undefined,
          slug: eventSlug,
          sport: result.sport_or_league || undefined,
          title: marketTitle,
        }
      : undefined,
    eventSlug,
    league: result.sport_or_league || undefined,
    marketSlug,
    markets:
      marketTitle || result.condition_id || outcomes.length > 0
        ? [
            {
              conditionId: result.condition_id || undefined,
              eventSlug,
              outcomes: outcomes.map((outcome) => ({
                label: outcome.label,
                side: outcome.side as "DRAW" | "NO" | "UNKNOWN" | "YES",
                tokenId: outcome.token_id || undefined,
              })),
              question: marketTitle || "Mercado sin titulo disponible",
              slug: marketSlug,
            },
          ]
        : [],
    normalizedUrl: result.normalized_url || result.source_url,
    source: result.raw_source === "gamma" ? "gamma" : "unknown",
    sport: result.sport_or_league || undefined,
    status: legacyStatus,
    warnings,
  };
}

async function resolveViaBackend(url: string): Promise<PolymarketLinkResolveResult> {
  const response = await fetch(`${backendBaseUrl()}/wallet-analysis/resolve-link`, {
    body: JSON.stringify({ polymarket_url: url }),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "PolySignal Web resolver",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("backend_wallet_analysis_resolver_failed");
  }
  const payload = (await response.json()) as WalletAnalysisResolvedLink;
  return mapResolvedLinkToLegacy(payload);
}

export async function POST(request: Request): Promise<NextResponse> {
  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    return jsonResponse({ error: "invalid_request" }, 413);
  }

  let parsed: unknown;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const url = safeUrlFromBody(parsed);
  if (!url) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  let result: PolymarketLinkResolveResult;
  try {
    result = await resolveViaBackend(url);
  } catch {
    result = await resolvePolymarketLink({ url });
    result.warnings = [
      ...result.warnings,
      "Resolver local de compatibilidad usado porque el backend no respondio con metadata completa.",
    ];
  }
  return jsonResponse(result as unknown as Record<string, unknown>, 200);
}

export function GET(): NextResponse {
  return jsonResponse({ error: "method_not_allowed" }, 405);
}

export function PUT(): NextResponse {
  return jsonResponse({ error: "method_not_allowed" }, 405);
}

export function DELETE(): NextResponse {
  return jsonResponse({ error: "method_not_allowed" }, 405);
}
