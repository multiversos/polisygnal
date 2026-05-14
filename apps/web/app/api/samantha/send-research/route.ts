import { NextResponse } from "next/server";

import {
  DELETE as deleteAnalysisAgentResearch,
  GET as getAnalysisAgentResearch,
  POST as postAnalysisAgentResearch,
  PUT as putAnalysisAgentResearch,
} from "../../analysis-agent/send-research/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  return postAnalysisAgentResearch(request);
}

export function GET(): NextResponse {
  return getAnalysisAgentResearch();
}

export function PUT(): NextResponse {
  return putAnalysisAgentResearch();
}

export function DELETE(): NextResponse {
  return deleteAnalysisAgentResearch();
}
