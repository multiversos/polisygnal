"use client";

export type SmartAlertSeverity = "info" | "warning" | "critical";

export type SmartAlert = {
  id: string;
  type: string;
  severity: SmartAlertSeverity;
  market_id?: number | null;
  title: string;
  description: string;
  reason: string;
  created_from: string;
  action_label?: string | null;
  action_url?: string | null;
  data: Record<string, unknown>;
};

export type SmartAlertsResponse = {
  generated_at: string;
  alerts: SmartAlert[];
  counts: Record<string, number>;
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

export async function fetchSmartAlerts(params?: {
  limit?: number;
  sport?: string | null;
  severity?: SmartAlertSeverity | null;
}): Promise<SmartAlertsResponse> {
  const search = new URLSearchParams({
    limit: String(params?.limit ?? 20),
  });
  if (params?.sport) {
    search.set("sport", params.sport);
  }
  if (params?.severity) {
    search.set("severity", params.severity);
  }
  const response = await fetch(`${API_BASE_URL}/alerts/smart?${search.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`/alerts/smart responded ${response.status}`);
  }
  return response.json() as Promise<SmartAlertsResponse>;
}
