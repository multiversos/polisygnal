import { NextResponse } from "next/server";

import {
  DELETE as deleteAnalysisAgentStatus,
  GET as getAnalysisAgentStatus,
  POST as postAnalysisAgentStatus,
  PUT as putAnalysisAgentStatus,
} from "../../analysis-agent/research-status/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  return postAnalysisAgentStatus(request);
}

export function GET(): NextResponse {
  return getAnalysisAgentStatus();
}

export function PUT(): NextResponse {
  return putAnalysisAgentStatus();
}

export function DELETE(): NextResponse {
  return deleteAnalysisAgentStatus();
}
