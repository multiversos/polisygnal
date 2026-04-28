"use client";

export type InvestigationStatus =
  | "pending_review"
  | "investigating"
  | "has_evidence"
  | "review_required"
  | "dismissed"
  | "paused";

export type InvestigationStatusItem = {
  id: number;
  market_id: number;
  status: InvestigationStatus;
  note?: string | null;
  priority?: number | null;
  created_at: string;
  updated_at: string;
  market_question: string;
  market_slug: string;
  sport?: string | null;
  market_shape?: string | null;
  close_time?: string | null;
  active: boolean;
  closed: boolean;
  latest_yes_price?: string | number | null;
  latest_no_price?: string | number | null;
  liquidity?: string | number | null;
  volume?: string | number | null;
};

export const INVESTIGATION_STATUS_LABELS: Record<InvestigationStatus, string> = {
  pending_review: "Por revisar",
  investigating: "Investigando",
  has_evidence: "Con evidencia",
  review_required: "Requiere revisión",
  dismissed: "Descartado",
  paused: "Pausado",
};

export const INVESTIGATION_STATUS_ORDER: InvestigationStatus[] = [
  "pending_review",
  "investigating",
  "has_evidence",
  "review_required",
  "dismissed",
  "paused",
];

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function requestInvestigationStatus<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) {
    return null as T;
  }

  if (!response.ok) {
    throw new Error(`${path} responded ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function fetchInvestigationStatuses(): Promise<InvestigationStatusItem[]> {
  return requestInvestigationStatus<InvestigationStatusItem[]>("/investigation-status");
}

export function fetchMarketInvestigationStatus(
  marketId: number | string,
): Promise<InvestigationStatusItem | null> {
  return requestInvestigationStatus<InvestigationStatusItem | null>(
    `/markets/${marketId}/investigation-status`,
  );
}

export function upsertMarketInvestigationStatus(
  marketId: number | string,
  payload: {
    status?: InvestigationStatus;
    note?: string | null;
    priority?: number | null;
  },
): Promise<InvestigationStatusItem> {
  return requestInvestigationStatus<InvestigationStatusItem>(
    `/markets/${marketId}/investigation-status`,
    {
      method: "POST",
      body: JSON.stringify({
        status: payload.status ?? "pending_review",
        note: payload.note ?? null,
        priority: payload.priority ?? null,
      }),
    },
  );
}

export function updateMarketInvestigationStatus(
  marketId: number | string,
  payload: {
    status?: InvestigationStatus;
    note?: string | null;
    priority?: number | null;
  },
): Promise<InvestigationStatusItem> {
  return requestInvestigationStatus<InvestigationStatusItem>(
    `/markets/${marketId}/investigation-status`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export function removeMarketInvestigationStatus(marketId: number | string): Promise<null> {
  return requestInvestigationStatus<null>(`/markets/${marketId}/investigation-status`, {
    method: "DELETE",
  });
}
