"use client";

import { API_BASE_URL } from "./api";

export type ResearchRunMarketSummary = {
  id: number;
  question: string;
  sport?: string | null;
  market_shape?: string | null;
  close_time?: string | null;
};

export type ResearchRunItem = {
  id: number;
  market_id: number;
  market?: ResearchRunMarketSummary | null;
  status: string;
  research_mode: string;
  vertical: string;
  subvertical?: string | null;
  market_shape: string;
  started_at: string;
  finished_at?: string | null;
  degraded_mode: boolean;
  web_search_used: boolean;
  prediction_family?: string | null;
  confidence_score?: string | number | null;
  has_findings: boolean;
  has_report: boolean;
  has_prediction: boolean;
  findings_count: number;
  reports_count: number;
  predictions_count: number;
  request_path?: string | null;
  packet_path?: string | null;
  expected_response_path?: string | null;
  ingest_command?: string | null;
  warnings: string[];
};

export type ResearchRunsResponse = {
  count: number;
  limit: number;
  filters_applied: Record<string, unknown>;
  items: ResearchRunItem[];
};

export type ResearchRunDetail = ResearchRunItem & {
  error_message?: string | null;
  metadata_json?: Record<string, unknown> | unknown[] | null;
  findings: unknown[];
  report?: unknown | null;
  prediction?: unknown | null;
};

export type ResearchQualityGate = {
  research_run_id: number;
  market_id: number;
  status: string;
  report_exists: boolean;
  report_generated_at?: string | null;
  recommended_action?: string | null;
  severity?: string | null;
  errors: Array<{ code?: string | null; message: string }>;
  warnings: Array<{ code?: string | null; message: string }>;
  source_quality_score?: string | number | null;
  evidence_balance_score?: string | number | null;
  confidence_adjusted?: string | number | null;
  research_mode?: string | null;
  source_review_required?: boolean | null;
  dry_run_command: string;
  ingest_command: string;
  validation_report_name?: string | null;
  validation_report?: Record<string, unknown> | null;
  instructions: string[];
  system_warnings: string[];
};

export async function fetchResearchRuns(filters?: {
  status?: string | null;
  marketId?: string | number | null;
  researchMode?: string | null;
  limit?: number;
}): Promise<ResearchRunsResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(filters?.limit ?? 50));
  if (filters?.status) {
    params.set("status", filters.status);
  }
  if (filters?.marketId) {
    params.set("market_id", String(filters.marketId));
  }
  if (filters?.researchMode) {
    params.set("research_mode", filters.researchMode);
  }

  const response = await fetch(`${API_BASE_URL}/research/runs?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`/research/runs responded ${response.status}`);
  }
  return response.json() as Promise<ResearchRunsResponse>;
}

export async function fetchResearchRunDetail(runId: number | string): Promise<ResearchRunDetail> {
  const response = await fetch(`${API_BASE_URL}/research/runs/${runId}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`/research/runs/${runId} responded ${response.status}`);
  }
  return response.json() as Promise<ResearchRunDetail>;
}

export async function fetchResearchRunQualityGate(
  runId: number | string,
): Promise<ResearchQualityGate> {
  const response = await fetch(`${API_BASE_URL}/research/runs/${runId}/quality-gate`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`/research/runs/${runId}/quality-gate responded ${response.status}`);
  }
  return response.json() as Promise<ResearchQualityGate>;
}
