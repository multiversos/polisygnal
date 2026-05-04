"use client";

import { API_BASE_URL, fetchApiJson } from "./api";

export type ManualEvidenceStance = "favor_yes" | "against_yes" | "neutral" | "risk";
export type ManualEvidenceReviewStatus = "pending_review" | "reviewed" | "rejected";

export type ManualEvidenceItem = {
  id: number;
  market_id: number;
  source_name: string;
  source_url?: string | null;
  title?: string | null;
  claim: string;
  stance: ManualEvidenceStance;
  evidence_type?: string | null;
  credibility_score?: string | number | null;
  notes?: string | null;
  review_status: ManualEvidenceReviewStatus;
  created_at: string;
  updated_at: string;
};

export type ManualEvidenceDashboardItem = ManualEvidenceItem & {
  market_question?: string | null;
  market_slug?: string | null;
  sport?: string | null;
  market_shape?: string | null;
};

export type ManualEvidenceListResponse = {
  items: ManualEvidenceDashboardItem[];
  count: number;
};

export type ManualEvidencePayload = {
  source_name: string;
  source_url?: string | null;
  title?: string | null;
  claim: string;
  stance: ManualEvidenceStance;
  evidence_type?: string | null;
  credibility_score?: string | number | null;
  notes?: string | null;
};

export const MANUAL_EVIDENCE_STANCE_LABELS: Record<ManualEvidenceStance, string> = {
  favor_yes: "A favor del SÍ",
  against_yes: "En contra del SÍ",
  neutral: "Neutral",
  risk: "Riesgo",
};

export const MANUAL_EVIDENCE_REVIEW_STATUS_LABELS: Record<ManualEvidenceReviewStatus, string> = {
  pending_review: "Pendiente de revisión",
  reviewed: "Revisada",
  rejected: "Rechazada",
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return fetchApiJson<T>(path, init);
}

export async function fetchMarketManualEvidence(marketId: number): Promise<ManualEvidenceItem[]> {
  return requestJson<ManualEvidenceItem[]>(`/markets/${marketId}/manual-evidence`);
}

export async function fetchManualEvidence(params?: {
  status?: ManualEvidenceReviewStatus | null;
  stance?: ManualEvidenceStance | null;
  market_id?: number | null;
  limit?: number;
}): Promise<ManualEvidenceListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) {
    searchParams.set("status", params.status);
  }
  if (params?.stance) {
    searchParams.set("stance", params.stance);
  }
  if (params?.market_id) {
    searchParams.set("market_id", String(params.market_id));
  }
  searchParams.set("limit", String(params?.limit ?? 50));
  return requestJson<ManualEvidenceListResponse>(`/manual-evidence?${searchParams.toString()}`);
}

export async function createManualEvidence(
  marketId: number,
  payload: ManualEvidencePayload,
): Promise<ManualEvidenceItem> {
  return requestJson<ManualEvidenceItem>(`/markets/${marketId}/manual-evidence`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateManualEvidence(
  evidenceId: number,
  payload: Partial<ManualEvidencePayload> & { review_status?: ManualEvidenceReviewStatus },
): Promise<ManualEvidenceItem> {
  return requestJson<ManualEvidenceItem>(`/manual-evidence/${evidenceId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteManualEvidence(evidenceId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/manual-evidence/${evidenceId}`, {
    method: "DELETE",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`/manual-evidence/${evidenceId} responded ${response.status}`);
  }
}
