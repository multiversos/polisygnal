import { NextResponse } from "next/server";

import { sendSamanthaResearchTask } from "../../../lib/samanthaBridge";
import { buildSamanthaResearchBrief, validateResearchBrief } from "../../../lib/samanthaResearchBrief";
import { buildSamanthaTaskPacket } from "../../../lib/samanthaTaskPacket";
import type { MarketOverviewItem } from "../../../lib/marketOverview";
import type { SamanthaResearchBrief } from "../../../lib/samanthaResearchTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 90000;
const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};
const FORBIDDEN_CLIENT_KEYS = new Set([
  "bridgeUrl",
  "callbackUrl",
  "destination",
  "endpoint",
  "target",
  "targetUrl",
  "urlToFetch",
]);
const FULL_WALLET_PATTERN = /0x[a-fA-F0-9]{40}/;
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

function jsonResponse(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, {
    headers: SECURITY_HEADERS,
    status,
  });
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function containsForbiddenClientKey(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return Object.keys(value).some((key) => FORBIDDEN_CLIENT_KEYS.has(key));
}

function containsUnsafeText(value: unknown): boolean {
  const serialized = JSON.stringify(value ?? "");
  const lower = serialized.toLowerCase();
  return FULL_WALLET_PATTERN.test(serialized) || SECRET_MARKERS.some((marker) => lower.includes(marker));
}

function normalizeString(value: unknown, max = 600): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

function briefFromBody(body: Record<string, unknown>): SamanthaResearchBrief | null {
  if (isRecord(body.brief)) {
    return body.brief as SamanthaResearchBrief;
  }
  if (isRecord(body.marketItem)) {
    const normalizedUrl = normalizeString(body.normalizedUrl);
    if (!normalizedUrl) {
      return null;
    }
    return buildSamanthaResearchBrief({
      item: body.marketItem as MarketOverviewItem,
      normalizedUrl,
      url: normalizeString(body.url) ?? normalizedUrl,
    });
  }
  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }
  if (byteLength(rawBody) > MAX_BODY_BYTES) {
    return jsonResponse({ error: "payload_too_large" }, 413);
  }

  let parsed: unknown;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }
  if (!isRecord(parsed)) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }
  if (containsForbiddenClientKey(parsed)) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }
  if (containsUnsafeText(parsed)) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const normalizedUrl = normalizeString(parsed.normalizedUrl);
  const brief = briefFromBody(parsed);
  if (!normalizedUrl || !brief) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const briefValidation = validateResearchBrief(brief);
  if (!briefValidation.valid) {
    return jsonResponse(
      {
        automaticAvailable: false,
        fallbackRequired: true,
        reason: "Research brief did not pass validation.",
        validationErrors: briefValidation.errors,
      },
      400,
    );
  }

  const taskPacket = buildSamanthaTaskPacket(brief);
  const bridgeTask = {
    brief,
    createdAt: new Date().toISOString(),
    deepAnalysisJobId: normalizeString(parsed.deepAnalysisJobId, 160),
    id: `samantha-task-${Date.now()}`,
    normalizedUrl,
    taskPacket,
  };
  const result = await sendSamanthaResearchTask(bridgeTask);
  return jsonResponse({
    automaticAvailable: result.automaticAvailable,
    checkedAt: result.checkedAt,
    errorCode: result.errorCode,
    fallbackRequired: result.fallbackRequired,
    mode: result.mode,
    reason: result.reason,
    report: result.report,
    status: result.status,
    taskId: result.taskId,
    validationErrors: result.validationErrors,
    warnings: result.warnings,
  });
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
