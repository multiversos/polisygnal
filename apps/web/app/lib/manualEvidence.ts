"use client";

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
  favor_yes: "A favor del SI",
  against_yes: "En contra del SI",
  neutral: "Neutral",
  risk: "Riesgo",
};

export const MANUAL_EVIDENCE_REVIEW_STATUS_LABELS: Record<ManualEvidenceReviewStatus, string> = {
  pending_review: "Pendiente de revision",
  reviewed: "Revisada",
  rejected: "Rechazada",
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${path} responded ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchMarketManualEvidence(marketId: number): Promise<ManualEvidenceItem[]> {
  return requestJson<ManualEvidenceItem[]>(`/markets/${marketId}/manual-evidence`);
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
