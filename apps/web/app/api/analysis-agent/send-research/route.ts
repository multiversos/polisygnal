import { NextResponse } from "next/server";

import {
  analysisAgentJsonResponse,
  handleAnalysisAgentSendResearch,
} from "../../../lib/analysisAgentRoute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  return handleAnalysisAgentSendResearch(request);
}

export function GET(): NextResponse {
  return analysisAgentJsonResponse({ error: "method_not_allowed" }, 405);
}

export function PUT(): NextResponse {
  return analysisAgentJsonResponse({ error: "method_not_allowed" }, 405);
}

export function DELETE(): NextResponse {
  return analysisAgentJsonResponse({ error: "method_not_allowed" }, 405);
}
