import { NextResponse } from "next/server";

import { lookupSamanthaResearchTask } from "../../../lib/samanthaBridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 2048;
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
  "webhookUrl",
]);
const TASK_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,160}$/;

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
  if (!isRecord(value)) return false;
  return Object.keys(value).some((key) => FORBIDDEN_CLIENT_KEYS.has(key));
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
  if (!isRecord(parsed) || containsForbiddenClientKey(parsed)) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const taskId = typeof parsed.taskId === "string" ? parsed.taskId.trim() : "";
  if (!TASK_ID_PATTERN.test(taskId)) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const result = await lookupSamanthaResearchTask(taskId);
  return jsonResponse({
    automaticAvailable: result.automaticAvailable,
    bridgeTaskStatus: result.bridgeTaskStatus,
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
