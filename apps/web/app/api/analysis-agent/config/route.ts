import { NextResponse } from "next/server";

import {
  analysisAgentJsonResponse,
  handleAnalysisAgentConfig,
} from "../../../lib/analysisAgentRoute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): NextResponse {
  return handleAnalysisAgentConfig();
}

export function POST(): NextResponse {
  return analysisAgentJsonResponse({ error: "method_not_allowed" }, 405);
}

export function PUT(): NextResponse {
  return analysisAgentJsonResponse({ error: "method_not_allowed" }, 405);
}

export function DELETE(): NextResponse {
  return analysisAgentJsonResponse({ error: "method_not_allowed" }, 405);
}
