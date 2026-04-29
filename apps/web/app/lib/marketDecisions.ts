"use client";

export type MarketDecision =
  | "monitor"
  | "investigate_more"
  | "ignore"
  | "possible_opportunity"
  | "dismissed"
  | "waiting_for_data";

export type DecisionConfidenceLabel = "low" | "medium" | "high";

export type MarketDecisionItem = {
  id: number;
  market_id: number;
  decision: MarketDecision;
  note?: string | null;
  confidence_label?: DecisionConfidenceLabel | null;
  created_at: string;
  updated_at: string;
  market_question: string;
  market_slug: string;
  sport?: string | null;
  market_shape?: string | null;
  close_time?: string | null;
};

export type MarketDecisionPayload = {
  decision: MarketDecision;
  note?: string | null;
  confidence_label?: DecisionConfidenceLabel | null;
};

export const MARKET_DECISION_LABELS: Record<MarketDecision, string> = {
  monitor: "Seguir observando",
  investigate_more: "Investigar mas",
  ignore: "Ignorar",
  possible_opportunity: "Posible oportunidad",
  dismissed: "Descartado",
  waiting_for_data: "Esperando datos",
};

export const DECISION_CONFIDENCE_LABELS: Record<DecisionConfidenceLabel, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function requestDecision<T>(path: string, init?: RequestInit): Promise<T> {
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

export function fetchMarketDecisions(
  marketId: number | string,
): Promise<MarketDecisionItem[]> {
  return requestDecision<MarketDecisionItem[]>(`/markets/${marketId}/decisions`);
}

export function fetchAllMarketDecisions(limit = 200): Promise<MarketDecisionItem[]> {
  return requestDecision<MarketDecisionItem[]>(`/decisions?limit=${limit}`);
}

export function createMarketDecision(
  marketId: number | string,
  payload: MarketDecisionPayload,
): Promise<MarketDecisionItem> {
  return requestDecision<MarketDecisionItem>(`/markets/${marketId}/decisions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMarketDecision(
  decisionId: number | string,
  payload: Partial<MarketDecisionPayload>,
): Promise<MarketDecisionItem> {
  return requestDecision<MarketDecisionItem>(`/decisions/${decisionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteMarketDecision(decisionId: number | string): Promise<null> {
  return requestDecision<null>(`/decisions/${decisionId}`, {
    method: "DELETE",
  });
}
