import { NextResponse } from "next/server";

import { normalizePolymarketUrl } from "../../lib/polymarketLink";
import { resolvePolymarketLink } from "../../lib/polymarketLinkResolver";

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

  const result = await resolvePolymarketLink({ url });
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
