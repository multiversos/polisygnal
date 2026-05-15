import { NextResponse } from "next/server";

import { compareExternalOdds } from "../../../lib/externalOddsProvider";
import type { ExternalOddsCompareInput } from "../../../lib/externalOddsTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function json(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, {
    headers: SECURITY_HEADERS,
    status,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeParticipants(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .slice(0, 4);
}

function normalizeOutcomePrices(value: unknown): ExternalOddsCompareInput["outcomePrices"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, 8).map((entry) => {
    if (!isRecord(entry)) {
      return {};
    }
    return {
      label: cleanText(entry.label),
      price: typeof entry.price === "number" || typeof entry.price === "string" ? entry.price : null,
      side: cleanText(entry.side),
    };
  });
}

function normalizeInput(value: unknown): ExternalOddsCompareInput | null {
  if (!isRecord(value)) {
    return null;
  }
  const sport = cleanText(value.sport);
  const league = cleanText(value.league);
  const supported = ["nba", "basketball"].includes(sport.toLowerCase()) || ["nba", "basketball"].includes(league.toLowerCase());
  if (!supported) {
    return {
      eventDate: cleanText(value.eventDate) || null,
      eventSlug: cleanText(value.eventSlug) || null,
      league: league || null,
      marketSlug: cleanText(value.marketSlug) || null,
      marketTitle: cleanText(value.marketTitle) || null,
      outcomePrices: normalizeOutcomePrices(value.outcomePrices),
      participants: normalizeParticipants(value.participants),
      sport: sport || null,
    };
  }
  return {
    eventDate: cleanText(value.eventDate) || null,
    eventSlug: cleanText(value.eventSlug) || null,
    league: league || "nba",
    marketSlug: cleanText(value.marketSlug) || null,
    marketTitle: cleanText(value.marketTitle) || null,
    outcomePrices: normalizeOutcomePrices(value.outcomePrices),
    participants: normalizeParticipants(value.participants),
    sport: sport || "nba",
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const input = normalizeInput(parsed);
  if (!input) {
    return json({ error: "invalid_request" }, 400);
  }
  if (!["nba", "basketball"].includes(cleanText(input.sport || input.league).toLowerCase())) {
    const checkedAt = new Date().toISOString();
    return json({
      bestSourceUrl: null,
      checkedAt,
      eventName: null,
      eventStartTime: null,
      league: input.league || null,
      limitations: ["Este trial de odds externas solo soporta NBA por ahora."],
      matchConfidence: "unknown",
      matchedMarket: false,
      outcomes: [],
      providerName: "OddsBlaze",
      sportsbook: "draftkings",
      status: "disabled",
      warnings: ["unsupported_sport"],
    });
  }
  const comparison = await compareExternalOdds(input);
  return json(comparison);
}

export function GET(): NextResponse {
  return json({ error: "method_not_allowed" }, 405);
}
