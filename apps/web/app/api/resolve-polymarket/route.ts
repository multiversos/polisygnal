import { NextResponse } from "next/server";

import {
  lookupExternalPolymarketResolution,
  type ExternalResolutionLookupInput,
} from "../../lib/polymarketResolutionAdapter";
import { normalizePolymarketUrl } from "../../lib/polymarketLink";

const MAX_BODY_BYTES = 4096;

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function jsonResponse(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, {
    headers: SECURITY_HEADERS,
    status,
  });
}

function safeInput(value: unknown): ExternalResolutionLookupInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const input: ExternalResolutionLookupInput = {};
  for (const key of ["conditionId", "eventSlug", "marketId", "marketSlug", "remoteId", "url"] as const) {
    const field = record[key];
    if (typeof field === "string" && field.trim() && field.length <= 2048) {
      if (key === "url" && !normalizePolymarketUrl(field)) {
        return null;
      }
      input[key] = field.trim();
    }
  }
  return Object.keys(input).length > 0 ? input : null;
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
  const input = safeInput(parsed);
  if (!input) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const result = await lookupExternalPolymarketResolution(input);
  if (result.source === "unknown" && result.status === "unknown") {
    return jsonResponse(result, 200);
  }
  return jsonResponse(result, 200);
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
